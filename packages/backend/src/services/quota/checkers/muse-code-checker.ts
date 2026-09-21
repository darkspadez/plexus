/**
 * Muse Code subscription quota checker.
 *
 * Subscription state lives on the same key endpoint as the login mint:
 * re-`POST https://api.meta.ai/muse-code/key` with the account's OAuth
 * identity token returns `subs_usage` with a rolling `window` and a
 * `weekly` window, each carrying `used_percent` and `resets_at`. The minted
 * `api_key` itself carries no quota identity, so the checker always resolves
 * the identity token — either the explicitly configured `apiKey` (a raw
 * account token, paralleling the Codex checker) or the `refresh` field of
 * pi-ai's `meta` OAuth credential (which stores the identity token there and
 * the minted key in `access`) — and strips `api_key` from anything logged.
 *
 * Failure contract: every failure throws — the scheduler records an error
 * sentinel (no fabricated meters, no routing cooldown) and the UI shows
 * the failure in "Needs attention" instead of hiding the panel. 401/403
 * means the device token is dead or the subscription lapsed, so the error
 * says to sign in again instead of retrying. Throttling (HTTP 429, or a
 * 200 that carries no usable windows but signals rate limiting) throws a
 * dedicated throttled error; a reactive force-refresh would only burn
 * another call on the aggressively rate-limited key endpoint.
 * `is_subs_active === false` likewise throws rather than publishing
 * zeroed meters.
 */

import { defineChecker } from '../checker-registry';
import { z } from 'zod';
import { OAuthAuthManager } from '../../oauth/oauth-auth-manager';
import type { OAuthProvider } from '../../oauth/oauth-providers';
import { logger } from '../../../utils/logger';
import type { Meter } from '../../../types/meter';
import type { MeterContext } from '../checker-registry';

const MUSE_KEY_URL = 'https://api.meta.ai/muse-code/key';
const MUSE_API_VERSION = '1.0.0';
const MUSE_USER_AGENT = 'muse-code/1.0.2';

interface MuseUsageWindow {
  used_percent?: number;
  resets_at?: string | number;
  window_duration_mins?: number;
}

interface MuseKeyResponse {
  api_key?: string;
  user_email?: string;
  user_id?: string;
  is_subs_active?: boolean;
  subs_tier_id?: string | null;
  subs_tier_name?: string | null;
  subs_usage?: {
    window?: MuseUsageWindow | null;
    weekly?: MuseUsageWindow | null;
  } | null;
  require_payment?: boolean;
}

function resolveOAuthToken(ctx: {
  getOption<T>(key: string, def: T): T;
  checkerId: string;
}): string {
  const configured = ctx.getOption<string>('apiKey', '').trim();
  if (configured) return configured;

  const provider = ctx.getOption<string>('oauthProvider', 'meta').trim() || 'meta';
  const oauthAccountId = ctx.getOption<string>('oauthAccountId', '').trim();
  const credentials = (
    oauthAccountId
      ? OAuthAuthManager.getInstance().getCredentials(provider as OAuthProvider, oauthAccountId)
      : OAuthAuthManager.getInstance().getCredentials(provider as OAuthProvider)
  ) as { refresh?: string } | null;
  const identityToken = credentials?.refresh?.trim();
  if (!identityToken) {
    throw new Error(
      `Muse Code quota checker '${ctx.checkerId}' has no stored login; run OAuth login for provider '${provider}'.`
    );
  }
  return identityToken;
}

function parseResetsAt(value: string | number | undefined): string | undefined {
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  return undefined;
}

/** Rolling-window period from `window_duration_mins` (300 → 5 hours). */
function rollingPeriod(minutes?: number): { periodValue: number; periodUnit: 'minute' | 'hour' } {
  if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0) {
    const rounded = Math.round(minutes);
    if (rounded % 60 === 0) return { periodValue: rounded / 60, periodUnit: 'hour' };
    return { periodValue: rounded, periodUnit: 'minute' };
  }
  return { periodValue: 5, periodUnit: 'hour' };
}

function rollingLabel(minutes?: number): string {
  const { periodValue, periodUnit } = rollingPeriod(minutes);
  const unit = periodUnit === 'hour' ? (periodValue === 1 ? 'hour' : 'hours') : 'minutes';
  return `Rolling (${periodValue} ${unit})`;
}

function buildWindowMeter(
  window: MuseUsageWindow,
  key: string,
  label: string,
  period: { periodValue: number; periodUnit: 'minute' | 'hour' | 'day' | 'week' },
  ctx: Pick<MeterContext, 'allowance'>
): Meter | null {
  const usedPercent = window.used_percent;
  if (typeof usedPercent !== 'number' || !Number.isFinite(usedPercent) || usedPercent < 0) {
    return null;
  }
  const used = Math.min(usedPercent, 100);
  return ctx.allowance({
    key,
    label,
    unit: 'percentage',
    used,
    limit: 100,
    remaining: Math.max(0, 100 - used),
    periodValue: period.periodValue,
    periodUnit: period.periodUnit,
    periodCycle: 'rolling',
    resetsAt: parseResetsAt(window.resets_at),
  });
}

/** Matches rate-limit/throttle signals in endpoint responses. */
const RATE_LIMIT_SIGNAL =
  /rate[\s_-]*limit|too many|exhaust|throttl|quota[\s_-]*exceed|usage[\s_-]*exceed/i;

/** Redacts the minted `api_key` so error text is safe to log and display. */
function redactApiKey(bodyText: string): string {
  return bodyText.replace(/("api_key"\s*:\s*")[^"]*(")/g, '$1[redacted]$2');
}

/** Comma-separated top-level keys for diagnostics (names only, no values). */
function topKeys(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return `(${typeof value})`;
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length > 0 ? keys.join(',') : '(no keys)';
}

function looksRateLimited(bodyText: string): boolean {
  return RATE_LIMIT_SIGNAL.test(redactApiKey(bodyText));
}

function asFiniteNumber(value: unknown): number | undefined {
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof num === 'number' && Number.isFinite(num) ? num : undefined;
}

function firstPresent<T>(record: Record<string, unknown>, keys: string[]): T | undefined {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value as T;
  }
  return undefined;
}

/**
 * Normalizes the usage container across endpoint shapes. The documented
 * shape is `subs_usage`; fall back to `usage` before giving up.
 */
function normalizeUsage(data: Record<string, unknown>): Record<string, unknown> | null {
  const candidate = firstPresent<unknown>(data, ['subs_usage', 'usage']);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  return candidate as Record<string, unknown>;
}

/**
 * Normalizes one usage window across observed field-name variants
 * (`used_percent`/`utilization`/`percent`, `resets_at`/`resetsAt`). A bare
 * `used` count is deliberately not accepted: it is not a percentage and
 * would publish a wrong utilization.
 */
function pickWindow(raw: unknown): MuseUsageWindow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const used = asFiniteNumber(
    firstPresent<unknown>(record, ['used_percent', 'utilization', 'percent'])
  );
  const resets = firstPresent<string | number>(record, [
    'resets_at',
    'resetsAt',
    'reset_at',
    'reset',
  ]);
  const durationMins = asFiniteNumber(
    firstPresent<unknown>(record, ['window_duration_mins', 'window_duration_minutes'])
  );
  if (used === undefined && resets === undefined && durationMins === undefined) return null;
  return {
    ...(used !== undefined ? { used_percent: used } : {}),
    ...(typeof resets === 'string' || typeof resets === 'number' ? { resets_at: resets } : {}),
    ...(durationMins !== undefined ? { window_duration_mins: durationMins } : {}),
  };
}

/** Dedicated error for throttled checks; the scheduler retries on interval. */
function throttledError(detail: string): Error {
  return new Error(`Muse Code quota check throttled (${detail}); will retry on the next check`);
}

/**
 * Human-readable `Retry-After` detail for throttle errors (seconds or HTTP
 * date). Never throws, so a malformed header can't turn a throttle into a
 * crash.
 */
function retryAfterDetail(value: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  const secs = Number(trimmed);
  if (Number.isFinite(secs) && secs >= 0) {
    const at = Date.now() + secs * 1000;
    if (Number.isFinite(at)) return `retry after ${Math.round(secs)}s`;
  }
  const ms = Date.parse(trimmed);
  if (Number.isFinite(ms)) return `retry after ${new Date(ms).toISOString()}`;
  return undefined;
}

export default defineChecker({
  type: 'muse-code',
  displayName: 'Muse Code',
  optionsSchema: z.object({
    apiKey: z.string().optional(),
    oauthAccountId: z.string().optional(),
    oauthProvider: z.string().optional(),
    endpoint: z.string().url().optional(),
    timeoutMs: z.number().int().positive().optional(),
  }),
  async check(ctx) {
    const endpoint = ctx.getOption<string>('endpoint', MUSE_KEY_URL);
    const timeoutMs = ctx.getOption<number>('timeoutMs', 15000);
    const oauthToken = resolveOAuthToken(ctx);

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);
    try {
      logger.silly(`Requesting usage for '${ctx.checkerId}' from ${endpoint}`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${oauthToken}`,
          'Content-Type': 'application/json',
          'x-api-version': MUSE_API_VERSION,
          'User-Agent': MUSE_USER_AGENT,
        },
        body: JSON.stringify({}),
        signal: abortController.signal,
      });

      const bodyText = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Muse Code subscription is inactive or the login expired (HTTP ${response.status}); sign in again.`
        );
      }
      if (response.status === 429) {
        // Throttled: throw so the scheduler records an error sentinel (no
        // fabricated meters, no routing cooldown) and the UI shows the
        // failure instead of hiding the panel.
        const detail = retryAfterDetail(response.headers.get('retry-after'));
        throw new Error(
          `Muse Code quota endpoint rate-limited (HTTP 429${detail ? `; ${detail}` : ''}); will retry on the next check`
        );
      }
      if (!response.ok) {
        throw new Error(
          `quota request failed with status ${response.status}: ${redactApiKey(bodyText).slice(0, 300)}`
        );
      }

      let data: MuseKeyResponse;
      try {
        data = JSON.parse(bodyText) as MuseKeyResponse;
      } catch {
        throw new Error('failed to parse Muse Code quota response');
      }

      if (data.is_subs_active === false || data.require_payment === true) {
        throw new Error('Muse Code subscription is inactive; sign in again.');
      }

      // The key endpoint has changed shape before (epoch-second resets_at,
      // extra billing fields) and drops subs_usage entirely when throttled,
      // so resolve the usage container and window fields tolerantly.
      const usage = normalizeUsage(data as Record<string, unknown>);
      if (!usage) {
        if (looksRateLimited(bodyText)) {
          throw throttledError('response carries no usage');
        }
        throw new Error(
          `Muse Code quota response changed shape (top-level keys: ${topKeys(data)}); expected subs_usage with window/weekly windows`
        );
      }

      const meters: Meter[] = [];
      const rollingSource = pickWindow(firstPresent<unknown>(usage, ['window', 'rolling']));
      if (rollingSource) {
        const meter = buildWindowMeter(
          rollingSource,
          'rolling',
          rollingLabel(rollingSource.window_duration_mins),
          rollingPeriod(rollingSource.window_duration_mins),
          ctx
        );
        if (meter) meters.push(meter);
      }
      const weeklySource = pickWindow(firstPresent<unknown>(usage, ['weekly', 'seven_day']));
      if (weeklySource) {
        const meter = buildWindowMeter(
          weeklySource,
          'weekly',
          'Weekly',
          { periodValue: 1, periodUnit: 'week' },
          ctx
        );
        if (meter) meters.push(meter);
      }
      if (meters.length === 0) {
        if (looksRateLimited(bodyText)) {
          throw throttledError('response carries no usable windows');
        }
        throw new Error(
          `Muse Code quota response carries no usable windows (usage keys: ${topKeys(usage)})`
        );
      }
      return meters;
    } finally {
      clearTimeout(timeout);
    }
  },
});
