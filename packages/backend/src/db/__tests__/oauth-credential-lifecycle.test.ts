/**
 * OAuth credential upsert bookkeeping and the config cache it drives.
 *
 * What must hold:
 *   - `setOAuthCredentials` tells a new login (`created`, plus any provider
 *     the slug backfill just linked) apart from a token rotation of an
 *     existing row, which reports neither;
 *   - `getOAuthCredentialTimestamps` exposes the row's lifecycle as numbers
 *     (connected once, refreshed on every save) or null when absent;
 *   - ConfigService rebuilds its cache for a new login / backfill link — so a
 *     provider saved before login hydrates `oauth_account` without being
 *     re-saved — skips the rebuild for a routine rotation, and always
 *     rebuilds after a credential delete.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSpy } from '../../../test/test-utils';
import { closeDatabase, initializeDatabase } from '../client';
import { runMigrations } from '../migrate';
import { ConfigRepository } from '../config-repository';
import { ConfigService } from '../../services/configuration/config-service';
import { ModelAutosyncScheduler } from '../../services/models/model-autosync-scheduler';
import type { ProviderConfig } from '../../config';

const oauthProvider = (account?: string): ProviderConfig =>
  ({
    api_base_url: 'oauth://',
    api_key: 'oauth',
    oauth_provider: 'meta',
    ...(account ? { oauth_account: account } : {}),
    disable_cooldown: false,
    stall_cooldown: false,
    allow_100_percent_utilization: false,
    estimateTokens: false,
    useClaudeMasking: false,
  }) as ProviderConfig;

const creds = { accessToken: 'access', refreshToken: 'refresh', expiresAt: 2000000000 };
const rotated = { accessToken: 'access-2', refreshToken: 'refresh-2', expiresAt: 2100000000 };

async function resetDatabase(): Promise<ConfigRepository> {
  await closeDatabase();
  process.env.DATABASE_URL = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
  initializeDatabase(process.env.DATABASE_URL);
  await runMigrations();
  const repo = new ConfigRepository();
  await repo.clearAllData();
  return repo;
}

describe('ConfigRepository OAuth credential upsert', () => {
  let repo: ConfigRepository;

  beforeEach(async () => {
    repo = await resetDatabase();
  });

  afterEach(async () => {
    await closeDatabase();
  });

  it('reports a first login and the unlinked provider it backfilled', async () => {
    await repo.saveProvider('metasub', oauthProvider());

    const result = await repo.setOAuthCredentials('meta', 'metasub', creds);

    expect(result).toEqual({ created: true, linkedProviderSlugs: ['metasub'] });
    expect((await repo.getProvider('metasub'))?.oauth_account).toBe('metasub');
  });

  it('reports a first login with no link when no provider matches the slug', async () => {
    await repo.saveProvider('other', oauthProvider());
    await repo.saveProvider('metasub', { ...oauthProvider(), oauth_provider: 'openai-codex' });

    const result = await repo.setOAuthCredentials('meta', 'metasub', creds);

    expect(result).toEqual({ created: true, linkedProviderSlugs: [] });
  });

  it('reports a token rotation as neither created nor linking', async () => {
    await repo.saveProvider('metasub', oauthProvider());
    await repo.setOAuthCredentials('meta', 'metasub', creds);

    const result = await repo.setOAuthCredentials('meta', 'metasub', rotated);

    expect(result).toEqual({ created: false, linkedProviderSlugs: [] });
    expect(await repo.getOAuthCredentials('meta', 'metasub')).toEqual({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expiresAt: 2100000000,
    });
  });

  it('returns credential timestamps as numbers, keeping connectedAt across rotations', async () => {
    const before = Date.now();
    await repo.setOAuthCredentials('meta', 'metasub', creds);
    const first = await repo.getOAuthCredentialTimestamps('meta', 'metasub');

    expect(first).not.toBeNull();
    expect(typeof first!.createdAt).toBe('number');
    expect(typeof first!.updatedAt).toBe('number');
    expect(typeof first!.expiresAt).toBe('number');
    expect(first!.createdAt).toBeGreaterThanOrEqual(before);
    expect(first!.updatedAt).toBe(first!.createdAt);
    expect(first!.expiresAt).toBe(2000000000);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await repo.setOAuthCredentials('meta', 'metasub', rotated);
    const second = await repo.getOAuthCredentialTimestamps('meta', 'metasub');

    expect(second!.createdAt).toBe(first!.createdAt);
    expect(second!.updatedAt).toBeGreaterThan(first!.updatedAt);
    expect(second!.expiresAt).toBe(2100000000);
  });

  it('returns null timestamps for an unknown credential', async () => {
    await repo.setOAuthCredentials('meta', 'metasub', creds);

    expect(await repo.getOAuthCredentialTimestamps('meta', 'nobody')).toBeNull();
    expect(await repo.getOAuthCredentialTimestamps('openai-codex', 'metasub')).toBeNull();
  });
});

describe('ConfigService OAuth credential cache', () => {
  let repo: ConfigRepository;
  let service: ConfigService;

  beforeEach(async () => {
    ConfigService.resetInstance();
    ModelAutosyncScheduler.resetInstance();
    repo = await resetDatabase();
    service = new ConfigService(repo);
    await service.initialize();
  });

  afterEach(async () => {
    await service.flush();
    ModelAutosyncScheduler.resetInstance();
    ConfigService.resetInstance();
    await closeDatabase();
  });

  it('hydrates a provider saved before login without re-saving it', async () => {
    await service.saveProvider('metasub', oauthProvider());
    await service.flush();
    expect(service.getConfig().providers['metasub']?.oauth_account).toBeUndefined();

    const rebuild = registerSpy(repo, 'getAllProviders');
    await service.setOAuthCredentials('meta', 'metasub', creds);

    // The login alone triggers the rebuild (no flush, no provider save).
    expect(rebuild).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(service.getConfig().providers['metasub']?.oauth_account).toBe('metasub');
    });
  });

  it('skips the cache rebuild for a token rotation', async () => {
    await service.saveProvider('metasub', oauthProvider());
    await service.setOAuthCredentials('meta', 'metasub', creds);
    await service.flush();
    expect(service.getConfig().providers['metasub']?.oauth_account).toBe('metasub');

    const rebuild = registerSpy(repo, 'getAllProviders');
    await service.setOAuthCredentials('meta', 'metasub', rotated);

    expect(rebuild).not.toHaveBeenCalled();
    expect((await service.getOAuthCredentials('meta', 'metasub'))?.accessToken).toBe('access-2');
  });

  it('rebuilds the cache after a credential delete', async () => {
    await service.saveProvider('metasub', oauthProvider());
    await service.setOAuthCredentials('meta', 'metasub', creds);
    await service.flush();
    expect(service.getConfig().providers['metasub']?.oauth_account).toBe('metasub');

    const rebuild = registerSpy(repo, 'getAllProviders');
    await service.deleteOAuthCredentials('meta', 'metasub');

    expect(rebuild).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(service.getConfig().providers['metasub']?.oauth_account).toBeUndefined();
    });
  });

  it('passes credential timestamps through', async () => {
    await service.setOAuthCredentials('meta', 'metasub', creds);

    const timestamps = await service.getOAuthCredentialTimestamps('meta', 'metasub');

    expect(timestamps).toEqual({
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
      expiresAt: 2000000000,
    });
    expect(await service.getOAuthCredentialTimestamps('meta', 'nobody')).toBeNull();
  });
});
