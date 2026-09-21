import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, initializeDatabase } from '../client';
import { runMigrations } from '../migrate';
import { ConfigRepository } from '../config-repository';
import type { ProviderConfig } from '../../config';

const oauthProvider = (account: string): ProviderConfig =>
  ({
    api_base_url: 'oauth://',
    api_key: 'oauth',
    oauth_provider: 'meta',
    oauth_account: account,
    disable_cooldown: false,
    stall_cooldown: false,
    allow_100_percent_utilization: false,
    estimateTokens: false,
    useClaudeMasking: false,
  }) as ProviderConfig;

const creds = { accessToken: 'access', refreshToken: 'refresh', expiresAt: 2000000000 };

describe('provider OAuth account hydration', () => {
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

  it('hydrates the account when the credential is created after the provider was saved', async () => {
    // Provider saved before OAuth login: no credential exists, so no link.
    await repo.saveProvider('metasub', oauthProvider('Personal'));
    expect((await repo.getProvider('metasub'))?.oauth_account).toBeUndefined();

    await repo.setOAuthCredentials('meta', 'Personal', creds);

    const bySlug = await repo.getProvider('metasub');
    expect(bySlug?.oauth_account).toBe('Personal');
    const all = await repo.getAllProviders();
    expect(all['metasub']?.oauth_account).toBe('Personal');
  });

  it('re-links the credential on the next save', async () => {
    await repo.saveProvider('metasub', oauthProvider('Personal'));
    await repo.setOAuthCredentials('meta', 'Personal', creds);
    await repo.setOAuthCredentials('meta', 'Work', creds);

    // Two accounts with no link is ambiguous: nothing to hydrate.
    expect((await repo.getProvider('metasub'))?.oauth_account).toBeUndefined();

    // Saving with the hydrated name links the FK, disambiguating later reads.
    await repo.saveProvider('metasub', oauthProvider('Personal'));
    expect((await repo.getProvider('metasub'))?.oauth_account).toBe('Personal');
  });

  it('matches the credential when the saved account name has surrounding whitespace', async () => {
    await repo.setOAuthCredentials('meta', 'Personal', creds);

    await repo.saveProvider('metasub', oauthProvider('  Personal  '));
    expect((await repo.getProvider('metasub'))?.oauth_account).toBe('Personal');
  });
});
