import { afterEach, describe, expect, test, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { registerQuotaRoutes } from '../quotas';
import { getConfig } from '../../../config';
import type { QuotaScheduler } from '../../../services/quota/quota-scheduler';

vi.mock('../../../config', () => ({
  getConfig: vi.fn(),
}));

describe('GET /v0/management/quota-checkers stale flag', () => {
  let fastify: FastifyInstance | undefined;

  afterEach(async () => {
    await fastify?.close();
    fastify = undefined;
  });

  async function build(latest: unknown) {
    vi.mocked(getConfig).mockReturnValue({
      quotas: [{ id: 'chk-1', type: 'synthetic', options: {} }],
    } as any);
    const scheduler = {
      getLatestQuota: vi.fn().mockResolvedValue(latest),
    } as unknown as QuotaScheduler;
    fastify = Fastify();
    await registerQuotaRoutes(fastify, scheduler);
    await fastify.ready();
    return fastify;
  }

  test('includes stale: true when the latest reading is stale', async () => {
    const app = await build({
      success: true,
      meters: [],
      checkedAt: '2026-01-01T00:00:00.000Z',
      stale: true,
    });
    const res = await app.inject({ method: 'GET', url: '/v0/management/quota-checkers' });
    expect(res.statusCode).toBe(200);
    const entry = res.json().configured[0];
    expect(entry.checkerId).toBe('chk-1');
    expect(entry.stale).toBe(true);
  });

  test('omits stale when the latest reading is fresh', async () => {
    const app = await build({ success: true, meters: [], checkedAt: '2026-01-01T00:00:00.000Z' });
    const res = await app.inject({ method: 'GET', url: '/v0/management/quota-checkers' });
    expect(res.json().configured[0]).not.toHaveProperty('stale');
  });
});
