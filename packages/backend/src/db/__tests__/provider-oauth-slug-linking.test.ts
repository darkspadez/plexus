import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, initializeDatabase } from '../client';
import { runMigrations } from '../migrate';
import { ConfigRepository } from '../config-repository';
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

describe('provider OAuth slug linking', () => {
  let repo: ConfigRepository;

  beforeEach(async () => {
    await closeDatabase();
    process.env.DATABASE_URL = process.env.PLEXUS_TEST_DB_URL ?? process.env.DATABASE_URL;
    initializeDatabase(process.env.DATABASE_URL);
    await runMigrations();

    repo = new ConfigRepository();
    await repo.clearAllData();
  });

  afterEach(async () => {
    await closeDatabase();
  });

  it('links the credential named after the provider slug, ignoring a stale account', async () => {
    await repo.setOAuthCredentials('meta', 'metasub', creds);
    await repo.setOAuthCredentials('meta', 'legacy-name', creds);

    // A stale incoming account must not win over the 1:1 slug key.
    await repo.saveProvider('metasub', oauthProvider('legacy-name'));

    expect((await repo.getProvider('metasub'))?.oauth_account).toBe('metasub');
  });

  it('falls back to a provided legacy account when no slug credential exists', async () => {
    await repo.setOAuthCredentials('meta', 'Personal', creds);

    // Restore/import path: grandfathered rows keep working.
    await repo.saveProvider('metasub', oauthProvider('Personal'));

    expect((await repo.getProvider('metasub'))?.oauth_account).toBe('Personal');
  });

  it('links a provider saved before login once the slug credential arrives', async () => {
    await repo.saveProvider('metasub', oauthProvider());
    expect((await repo.getProvider('metasub'))?.oauth_account).toBeUndefined();

    await repo.setOAuthCredentials('meta', 'metasub', creds);

    expect((await repo.getProvider('metasub'))?.oauth_account).toBe('metasub');
  });

  it('does not link a slug credential of a different provider type', async () => {
    await repo.saveProvider('metasub', oauthProvider());
    await repo.setOAuthCredentials('openai-codex', 'metasub', creds);

    expect((await repo.getProvider('metasub'))?.oauth_account).toBeUndefined();
  });

  it('deletes the exclusive credential with its provider', async () => {
    await repo.saveProvider('metasub', oauthProvider());
    await repo.setOAuthCredentials('meta', 'metasub', creds);

    const deleted = await repo.deleteProvider('metasub', true);

    expect(deleted).toEqual({ providerType: 'meta', accountId: 'metasub' });
    expect(await repo.getOAuthCredentials('meta', 'metasub')).toBeNull();
  });

  it('spares a credential still referenced by another provider', async () => {
    await repo.setOAuthCredentials('meta', 'shared', creds);
    await repo.saveProvider('first', {
      ...oauthProvider('shared'),
      oauth_provider: 'meta',
    } as ProviderConfig);
    await repo.saveProvider('second', {
      ...oauthProvider('shared'),
      oauth_provider: 'meta',
    } as ProviderConfig);

    const deleted = await repo.deleteProvider('first', true);

    expect(deleted).toBeNull();
    expect(await repo.getOAuthCredentials('meta', 'shared')).not.toBeNull();
    expect((await repo.getProvider('second'))?.oauth_account).toBe('shared');
  });
});
