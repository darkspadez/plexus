/**
 * Route wiring for database maintenance. The cleanup service and compactor
 * are mocked; their behaviour is covered by the DB-backed tests in
 * services/maintenance/__tests__.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

vi.mock('../../../services/maintenance/database-cleanup-service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../services/maintenance/database-cleanup-service')
  >()),
  scanDatabase: vi.fn(),
  purgeDatabase: vi.fn(),
}));

vi.mock('../../../services/maintenance/database-compactor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/maintenance/database-compactor')>()),
  compactDatabase: vi.fn(),
}));

import { setConfigForTesting } from '../../../config';
import {
  purgeDatabase,
  scanDatabase,
} from '../../../services/maintenance/database-cleanup-service';
import {
  CompactionInProgressError,
  compactDatabase,
} from '../../../services/maintenance/database-compactor';
import type { Dispatcher } from '../../../services/dispatch/dispatcher';
import type { UsageStorageService } from '../../../services/observability/usage-storage';
import type { ProbeService } from '../../../services/probes/probe-service';
import { registerManagementRoutes } from '../../management';
import { registerDatabaseMaintenanceRoutes } from '../database';

const SCAN_RESULT = {
  scannedAt: 1_700_000_000_000,
  categories: [
    {
      id: 'meter-snapshots',
      label: 'Orphaned quota meter history',
      description: 'desc',
      defaultSelected: true,
      count: 3,
      items: [{ id: 'poe|poe', label: 'poe', detail: '3 rows', count: 3 }],
    },
  ],
  size: { dialect: 'sqlite', totalBytes: 4096, reclaimableBytes: 1024 },
};

const COMPACT_RESULT = {
  dialect: 'sqlite',
  beforeBytes: 4096,
  afterBytes: 2048,
  reclaimedBytes: 2048,
  durationMs: 12,
  full: false,
};

describe('database maintenance routes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();
    await registerDatabaseMaintenanceRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  it('GET /cleanup returns the scan result', async () => {
    vi.mocked(scanDatabase).mockResolvedValue(SCAN_RESULT as any);

    const res = await fastify.inject({ method: 'GET', url: '/v0/management/database/cleanup' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: SCAN_RESULT });
  });

  it('GET /cleanup maps a scan failure to 500', async () => {
    vi.mocked(scanDatabase).mockRejectedValue(new Error('cannot decrypt'));

    const res = await fastify.inject({ method: 'GET', url: '/v0/management/database/cleanup' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'cannot decrypt' });
  });

  it('POST /purge passes deduplicated categories and returns the result', async () => {
    const purgeResult = { deleted: { 'meter-snapshots': 3 }, errors: { 'legacy-files': 'EACCES' } };
    vi.mocked(purgeDatabase).mockResolvedValue(purgeResult as any);

    const res = await fastify.inject({
      method: 'POST',
      url: '/v0/management/database/purge',
      payload: { categories: ['meter-snapshots', 'legacy-files', 'meter-snapshots'] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: purgeResult });
    expect(purgeDatabase).toHaveBeenCalledWith(['meter-snapshots', 'legacy-files']);
  });

  it.each([
    ['a missing body', undefined],
    ['an empty list', { categories: [] }],
    ['an unknown category', { categories: ['everything'] }],
    ['a non-array', { categories: 'meter-snapshots' }],
  ])('POST /purge rejects %s with 400', async (_name, payload) => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/v0/management/database/purge',
      ...(payload ? { payload } : {}),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'Invalid request body' });
    expect(res.json().details).toBeDefined();
    expect(purgeDatabase).not.toHaveBeenCalled();
  });

  it('POST /compact runs without a body and forwards full', async () => {
    vi.mocked(compactDatabase).mockResolvedValue(COMPACT_RESULT as any);

    const bare = await fastify.inject({ method: 'POST', url: '/v0/management/database/compact' });
    const full = await fastify.inject({
      method: 'POST',
      url: '/v0/management/database/compact',
      payload: { full: true },
    });

    expect(bare.statusCode).toBe(200);
    expect(bare.json()).toEqual({ data: COMPACT_RESULT });
    expect(full.statusCode).toBe(200);
    expect(compactDatabase).toHaveBeenNthCalledWith(1, { full: undefined });
    expect(compactDatabase).toHaveBeenNthCalledWith(2, { full: true });
  });

  it('POST /compact rejects a non-boolean full with 400', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/v0/management/database/compact',
      payload: { full: 'yes' },
    });

    expect(res.statusCode).toBe(400);
    expect(compactDatabase).not.toHaveBeenCalled();
  });

  it('POST /compact maps a concurrent compaction to 409', async () => {
    vi.mocked(compactDatabase).mockRejectedValue(new CompactionInProgressError());

    const res = await fastify.inject({ method: 'POST', url: '/v0/management/database/compact' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'Database compaction already in progress' });
  });
});

describe('database maintenance routes — admin only', () => {
  const originalAdminKey = process.env.ADMIN_KEY;
  let fastify: FastifyInstance;

  beforeEach(async () => {
    process.env.ADMIN_KEY = 'correct-admin-key';
    setConfigForTesting({
      providers: {},
      models: {},
      keys: { limited: { secret: 'sk-limited-secret' } },
      failover: { enabled: false, retryableStatusCodes: [], retryableErrors: [] },
      quotas: [],
    } as any);
    fastify = Fastify();
    await registerManagementRoutes(
      fastify,
      {} as UsageStorageService,
      {} as Dispatcher,
      {} as ProbeService
    );
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    if (originalAdminKey === undefined) delete process.env.ADMIN_KEY;
    else process.env.ADMIN_KEY = originalAdminKey;
  });

  it.each([
    ['GET', '/v0/management/database/cleanup'],
    ['POST', '/v0/management/database/purge'],
    ['POST', '/v0/management/database/compact'],
  ] as const)('%s %s returns 403 for a limited principal', async (method, url) => {
    const res = await fastify.inject({
      method,
      url,
      headers: { 'x-admin-key': 'sk-limited-secret' },
      ...(method === 'POST' ? { payload: { categories: ['dead-rows'] } } : {}),
    });

    expect(res.statusCode).toBe(403);
    expect(scanDatabase).not.toHaveBeenCalled();
    expect(purgeDatabase).not.toHaveBeenCalled();
    expect(compactDatabase).not.toHaveBeenCalled();
  });

  it('allows the admin key', async () => {
    vi.mocked(scanDatabase).mockResolvedValue(SCAN_RESULT as any);

    const res = await fastify.inject({
      method: 'GET',
      url: '/v0/management/database/cleanup',
      headers: { 'x-admin-key': 'correct-admin-key' },
    });

    expect(res.statusCode).toBe(200);
  });
});
