import { defineChecker } from '../checker-registry';
import { z } from 'zod';
import { OAuthAuthManager } from '../../oauth-auth-manager';
import type { OAuthProvider } from '@earendil-works/pi-ai/oauth';
import { logger } from '../../../utils/logger';
import type { Meter } from '../../../types/meter';

// ── IMPORTANT ─────────────────────────────────────────────────────────────────
// xAI / Grok exposes NO usage, credit, or subscription-quota API to the OAuth
// access token (confirmed). The team/billing usage endpoints require a console
// management key, not the user OAuth token. As a result this checker CANNOT emit
// a percentage/credit allowance meter. Instead it ships an ACCOUNT-HEALTH check:
// it verifies the OAuth token still authenticates and reports whether the team is
// blocked, plus (best-effort) the number of language models the token can see.
// ────────────────────────────────────────────────────────────────────────────

const ME_ENDPOINT = 'https://api.x.ai/v1/me';
const MODELS_ENDPOINT = 'https://api.x.ai/v1/language-models';
const REQUEST_TIMEOUT_MS = 15_000;

interface XaiMeResponse {
  team_id?: string;
  team_blocked?: boolean;
  [key: string]: unknown;
}

interface XaiLanguageModelsResponse {
  models?: unknown[];
  [key: string]: unknown;
}

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

  const provider = 'xai';
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

export default defineChecker({
  type: 'xai',
  displayName: 'xAI / Grok',
  optionsSchema: z.object({
    apiKey: z.string().optional(),
    oauthAccountId: z.string().optional(),
  }),
  async check(ctx) {
    const accessToken = await resolveAccessToken(ctx);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };

    logger.silly(`Requesting account status for '${ctx.checkerId}' from ${ME_ENDPOINT}`);
    const meResponse = await fetch(ME_ENDPOINT, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (meResponse.status === 401 || meResponse.status === 403) {
      throw new Error(`xAI OAuth token expired or invalid (HTTP ${meResponse.status})`);
    }
    const meBody = await meResponse.text();
    if (!meResponse.ok) {
      throw new Error(`xAI account request failed with status ${meResponse.status}: ${meBody}`);
    }

    let me: XaiMeResponse;
    try {
      me = JSON.parse(meBody) as XaiMeResponse;
    } catch {
      throw new Error('failed to parse xAI account response');
    }

    const meters: Meter[] = [];

    // Account-availability status meter: 1 = usable, 0 = team blocked. xAI does
    // not expose subscription usage to the OAuth token, so this is the only
    // health signal available (no %/credit meter is possible).
    const blocked = me.team_blocked === true;
    meters.push(
      ctx.balance({
        key: 'account',
        label: 'Account status',
        unit: 'status',
        remaining: blocked ? 0 : 1,
        used: blocked ? 1 : 0,
        limit: 1,
      })
    );

    // Best-effort: how many language models the token can access. Tolerate
    // failure — it is purely informational and must not fail the whole check.
    try {
      const modelsResponse = await fetch(MODELS_ENDPOINT, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (modelsResponse.ok) {
        const models = (await modelsResponse.json()) as XaiLanguageModelsResponse;
        const count = Array.isArray(models.models) ? models.models.length : 0;
        if (count > 0) {
          meters.push(
            ctx.balance({
              key: 'models',
              label: 'Available models',
              unit: 'models',
              remaining: count,
            })
          );
        }
      } else {
        logger.debug(`xAI language-models request returned HTTP ${modelsResponse.status}`);
      }
    } catch (error) {
      logger.debug(
        `xAI language-models request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return meters;
  },
});
