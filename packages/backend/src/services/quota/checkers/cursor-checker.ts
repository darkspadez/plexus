import { defineChecker } from '../checker-registry';
import { z } from 'zod';
import { OAuthAuthManager } from '../../oauth-auth-manager';
import type { OAuthProvider } from '@earendil-works/pi-ai/oauth';
import { logger } from '../../../utils/logger';
import type { Meter } from '../../../types/meter';
import type { MeterContext } from '../checker-registry';

// ── Cursor quota checker ──────────────────────────────────────────────────────
// Cursor exposes clean JSON usage to the OAuth access JWT. The JWT `sub` claim
// looks like `auth0|user_01K...`; the `user_*` segment is the Cursor userId,
// which is used both as a query param and to build the WorkosCursorSessionToken
// cookie (`<userId>::<accessJWT>`, URL-encoded) for the cursor.com endpoints.
//
// Three sources are queried (each tolerant of per-call failure):
//   (B) GetCurrentPeriodUsage  — primary usd_credit usage (newer usage-based plans)
//   (A) /api/usage             — legacy request-count plans (maxRequestUsage > 0)
//   (C) /api/auth/stripe       — prepaid credit balance (customerBalance < 0)
// ────────────────────────────────────────────────────────────────────────────

const USAGE_ENDPOINT = 'https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage';
const LEGACY_USAGE_ENDPOINT = 'https://cursor.com/api/usage';
const STRIPE_ENDPOINT = 'https://cursor.com/api/auth/stripe';

interface PlanUsage {
  limit?: number; // cents
  remaining?: number; // cents
  used?: number; // cents
  totalPercentUsed?: number;
}

interface CurrentPeriodUsageResponse {
  billingCycleStart?: string; // epoch-ms string
  billingCycleEnd?: string; // epoch-ms string
  planUsage?: PlanUsage;
}

interface LegacyUsageResponse {
  startOfMonth?: string;
  [model: string]: unknown;
}

interface LegacyModelUsage {
  numRequests?: number;
  maxRequestUsage?: number | null;
}

interface StripeResponse {
  membershipType?: string;
  individualMembershipType?: string;
  customerBalance?: number; // cents, negative == prepaid credit
}

// ── Pure helpers (unit-tested) ────────────────────────────────────────────────

/**
 * Decode an access JWT payload and extract the Cursor userId from the `sub`
 * claim (`auth0|user_01K...` → `user_01K...`). Returns null on any failure.
 */
export function extractCursorUserId(accessToken: string): string | null {
  const parts = accessToken.split('.');
  const payloadSegment = parts[1];
  if (!payloadSegment) return null;
  try {
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as {
      sub?: string;
    };
    const sub = payload.sub?.trim();
    if (!sub) return null;
    // sub is typically "auth0|user_01K..."; take the user_* segment.
    const segments = sub.split('|');
    const userSegment =
      segments.find((s) => s.startsWith('user_')) ?? segments[segments.length - 1];
    return userSegment?.trim() || null;
  } catch {
    return null;
  }
}

/** Build the WorkosCursorSessionToken cookie value (URL-encoded `userId::jwt`). */
export function buildCursorCookie(userId: string, accessToken: string): string {
  return `WorkosCursorSessionToken=${encodeURIComponent(`${userId}::${accessToken}`)}`;
}

const centsToUsd = (cents: number): number => cents / 100;

/**
 * Map a GetCurrentPeriodUsage response into a usd-credit allowance meter.
 * Returns null if there is not enough information (no limit) to build one.
 */
export function buildUsdCreditMeter(
  data: CurrentPeriodUsageResponse,
  ctx: Pick<MeterContext, 'allowance'>
): Meter | null {
  const plan = data.planUsage;
  if (!plan) return null;
  const { limit, remaining, used, totalPercentUsed } = plan;
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return null;

  // Prefer explicit `used`, else derive from limit-remaining, else from percent.
  let usedCents: number | undefined;
  if (typeof used === 'number' && Number.isFinite(used)) {
    usedCents = used;
  } else if (typeof remaining === 'number' && Number.isFinite(remaining)) {
    usedCents = limit - remaining;
  } else if (typeof totalPercentUsed === 'number' && Number.isFinite(totalPercentUsed)) {
    usedCents = Math.round((limit * totalPercentUsed) / 100);
  }

  let resetsAt: string | undefined;
  if (data.billingCycleEnd) {
    const end = Number(data.billingCycleEnd);
    if (Number.isFinite(end) && end > 0) resetsAt = new Date(end).toISOString();
  }

  return ctx.allowance({
    key: 'credit',
    label: 'Usage credits',
    unit: 'usd',
    used: usedCents !== undefined ? centsToUsd(usedCents) : undefined,
    limit: centsToUsd(limit),
    remaining:
      typeof remaining === 'number' && Number.isFinite(remaining)
        ? centsToUsd(remaining)
        : undefined,
    periodValue: 1,
    periodUnit: 'month',
    periodCycle: 'fixed',
    resetsAt,
  });
}

/**
 * Map the legacy /api/usage response into a request-count allowance meter.
 * Only legacy plans (maxRequestUsage > 0) get a meter; returns null otherwise.
 */
export function buildLegacyRequestMeter(
  data: LegacyUsageResponse,
  userId: string,
  ctx: Pick<MeterContext, 'allowance'>
): Meter | null {
  const gpt4 = data['gpt-4'] as LegacyModelUsage | undefined;
  if (!gpt4) return null;
  const maxRequestUsage = gpt4.maxRequestUsage;
  if (typeof maxRequestUsage !== 'number' || maxRequestUsage <= 0) return null;
  const numRequests = typeof gpt4.numRequests === 'number' ? gpt4.numRequests : 0;

  let resetsAt: string | undefined;
  if (data.startOfMonth) {
    const start = new Date(data.startOfMonth);
    if (!Number.isNaN(start.getTime())) {
      // Operate in UTC so the reset day is stable regardless of server timezone.
      const next = new Date(start);
      next.setUTCMonth(next.getUTCMonth() + 1);
      resetsAt = next.toISOString();
    }
  }

  // userId is unused for the mapping itself but kept in the signature so callers
  // pass the resolved id; reference it to satisfy strict noUnusedParameters.
  logger.silly(`legacy request meter for user ${userId}`);

  return ctx.allowance({
    key: 'requests',
    label: 'Request usage',
    unit: 'requests',
    used: numRequests,
    limit: maxRequestUsage,
    remaining: Math.max(0, maxRequestUsage - numRequests),
    periodValue: 1,
    periodUnit: 'month',
    periodCycle: 'fixed',
    resetsAt,
  });
}

/** Map the stripe response into a prepaid-credit balance meter (negative balance). */
export function buildPrepaidMeter(
  data: StripeResponse,
  ctx: Pick<MeterContext, 'balance'>
): Meter | null {
  const balance = data.customerBalance;
  if (typeof balance !== 'number' || !Number.isFinite(balance) || balance >= 0) return null;
  return ctx.balance({
    key: 'prepaid',
    label: 'Prepaid credit',
    unit: 'usd',
    remaining: centsToUsd(Math.abs(balance)),
  });
}

// ── Token resolution ──────────────────────────────────────────────────────────

function parseAccessToken(apiKey: string): string {
  const raw = apiKey.trim();
  if (!raw) throw new Error('OAuth missing access_token');
  if (raw.toLowerCase().startsWith('bearer ')) return raw.slice(7).trim();
  if (!raw.startsWith('{')) return raw;
  try {
    const parsed = JSON.parse(raw) as { access_token?: string };
    const token = parsed.access_token?.trim();
    if (token) return token;
  } catch {}
  throw new Error('failed to parse OAuth credentials JSON');
}

async function resolveAccessToken(ctx: {
  getOption<T>(key: string, def: T): T;
  checkerId: string;
}): Promise<string> {
  const configured = ctx.getOption<string>('apiKey', '').trim();
  if (configured) return parseAccessToken(configured);

  const provider = 'cursor';
  const oauthAccountId = ctx.getOption<string>('oauthAccountId', '').trim();
  const authManager = OAuthAuthManager.getInstance();
  logger.debug(`resolveAccessToken for '${ctx.checkerId}'`);

  let oauthApiKey: string;
  try {
    oauthApiKey = oauthAccountId
      ? await authManager.getApiKey(provider as OAuthProvider, oauthAccountId)
      : await authManager.getApiKey(provider as OAuthProvider);
  } catch {
    authManager.reload();
    oauthApiKey = oauthAccountId
      ? await authManager.getApiKey(provider as OAuthProvider, oauthAccountId)
      : await authManager.getApiKey(provider as OAuthProvider);
  }
  return parseAccessToken(oauthApiKey);
}

function isAuthError(status: number): boolean {
  return status === 401 || status === 403;
}

export default defineChecker({
  type: 'cursor',
  displayName: 'Cursor',
  optionsSchema: z.object({
    apiKey: z.string().optional(),
    oauthAccountId: z.string().optional(),
  }),
  async check(ctx) {
    const accessToken = await resolveAccessToken(ctx);
    const userId = extractCursorUserId(accessToken);
    if (!userId) throw new Error('failed to extract Cursor userId from access token');
    const cookie = buildCursorCookie(userId, accessToken);

    // (B) Primary: usage-based usd-credit plan.
    const usagePromise = (async (): Promise<Meter | null> => {
      const response = await fetch(USAGE_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Connect-Protocol-Version': '1',
        },
        body: '{}',
      });
      if (isAuthError(response.status)) {
        throw new Error(`Cursor OAuth token expired or invalid (HTTP ${response.status})`);
      }
      if (!response.ok) {
        logger.debug(`Cursor GetCurrentPeriodUsage returned HTTP ${response.status}`);
        return null;
      }
      const data = (await response.json()) as CurrentPeriodUsageResponse;
      return buildUsdCreditMeter(data, ctx);
    })();

    // (A) Legacy fallback: request-count plans.
    const legacyPromise = (async (): Promise<Meter | null> => {
      const url = `${LEGACY_USAGE_ENDPOINT}?user=${encodeURIComponent(userId)}`;
      const response = await fetch(url, { method: 'GET', headers: { Cookie: cookie } });
      if (isAuthError(response.status)) {
        throw new Error(`Cursor OAuth token expired or invalid (HTTP ${response.status})`);
      }
      if (!response.ok) {
        logger.debug(`Cursor /api/usage returned HTTP ${response.status}`);
        return null;
      }
      const data = (await response.json()) as LegacyUsageResponse;
      return buildLegacyRequestMeter(data, userId, ctx);
    })();

    // (C) Prepaid credit balance.
    const stripePromise = (async (): Promise<Meter | null> => {
      const response = await fetch(STRIPE_ENDPOINT, { method: 'GET', headers: { Cookie: cookie } });
      if (isAuthError(response.status)) {
        throw new Error(`Cursor OAuth token expired or invalid (HTTP ${response.status})`);
      }
      if (!response.ok) {
        logger.debug(`Cursor /api/auth/stripe returned HTTP ${response.status}`);
        return null;
      }
      const data = (await response.json()) as StripeResponse;
      return buildPrepaidMeter(data, ctx);
    })();

    const results = await Promise.allSettled([usagePromise, legacyPromise, stripePromise]);

    // If any call surfaced an auth error, propagate it (expired token).
    for (const r of results) {
      if (r.status === 'rejected') {
        const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
        if (message.includes('expired or invalid')) throw r.reason;
        logger.debug(`Cursor sub-request failed: ${message}`);
      }
    }

    const [usageMeter, legacyMeter, prepaidMeter] = results.map((r) =>
      r.status === 'fulfilled' ? r.value : null
    );

    // Billing-model detection: prefer (B) usd_credit; fall back to (A) request_count.
    const meters: Meter[] = [];
    if (usageMeter) {
      meters.push(usageMeter);
    } else if (legacyMeter) {
      meters.push(legacyMeter);
    }
    if (prepaidMeter) meters.push(prepaidMeter);

    if (meters.length === 0) {
      throw new Error('Could not determine Cursor usage (no usage, request, or balance data)');
    }

    return meters;
  },
});
