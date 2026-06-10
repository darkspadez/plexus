import { defineChecker } from '../checker-registry';
import { z } from 'zod';
import { logger } from '../../../utils/logger';

const DASHBOARD_BASE_URL = 'https://opencode.ai/workspace/';
const DASHBOARD_URL_SUFFIX = '/go';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/148.0';
const SCRAPE_TIMEOUT_MS = 10_000;

const SESSION_EXPIRED_MESSAGE =
  'OpenCode Go session is invalid or expired — sign in at opencode.ai again, then copy the fresh "auth" cookie value into this provider\'s quota checker options (DevTools → Application → Cookies → opencode.ai → auth)';

interface OpenCodeGoWindow {
  usagePercent: number;
  resetInSec: number;
}

// An invalid/expired auth cookie makes the dashboard redirect (followed
// silently by fetch, ending in HTTP 200) to the OpenAuth login page.
function isLoginPage(html: string, finalUrl: string, redirected: boolean): boolean {
  if (redirected && (finalUrl.includes('auth.opencode.ai') || finalUrl.includes('/authorize'))) {
    return true;
  }
  return (
    /<title>\s*OpenAuth\s*<\/title>/i.test(html) || html.includes('auth.opencode.ai/authorize')
  );
}

// Keys may appear bare (seroval: rollingUsage:$R[1]={...}), JSON-quoted, or
// quote-escaped inside a JS string; the $R[n]= assignment is optional.
const key = (name: string) => `(?:\\\\?["'])?${name}(?:\\\\?["'])?\\s*:\\s*`;
const NUM = '(-?\\d+(?:\\.\\d+)?)';

function windowPattern(field: string, firstKey: string, secondKey: string): RegExp {
  return new RegExp(
    `${key(field)}(?:\\$R\\[\\d+\\]=)?\\{[^}]*${key(firstKey)}${NUM}[^}]*${key(secondKey)}${NUM}[^}]*\\}`
  );
}

function parseWindowUsage(html: string, field: string): OpenCodeGoWindow | null {
  const rePctFirst = windowPattern(field, 'usagePercent', 'resetInSec');
  const reResetFirst = windowPattern(field, 'resetInSec', 'usagePercent');

  const pctFirstMatch = rePctFirst.exec(html);
  if (pctFirstMatch) {
    const usagePercent = Number(pctFirstMatch[1]);
    const resetInSec = Number(pctFirstMatch[2]);
    if (Number.isFinite(usagePercent) && Number.isFinite(resetInSec)) {
      return { usagePercent, resetInSec };
    }
  }

  const resetFirstMatch = reResetFirst.exec(html);
  if (resetFirstMatch) {
    const resetInSec = Number(resetFirstMatch[1]);
    const usagePercent = Number(resetFirstMatch[2]);
    if (Number.isFinite(usagePercent) && Number.isFinite(resetInSec)) {
      return { usagePercent, resetInSec };
    }
  }

  return null;
}

export default defineChecker({
  type: 'opencode-go',
  displayName: 'OpenCode Go',
  optionsSchema: z.object({
    workspaceId: z.string().min(1, 'OpenCode Go workspace ID is required'),
    authCookie: z.string().min(1, 'OpenCode Go auth cookie is required'),
    endpoint: z.string().url().optional(),
  }),
  async check(ctx) {
    const workspaceId = ctx.getOption<string>('workspaceId', '').trim();
    const authCookie = ctx.getOption<string>('authCookie', '').trim();
    if (!workspaceId || !authCookie) {
      const missing = [!workspaceId && 'workspaceId', !authCookie && 'authCookie']
        .filter(Boolean)
        .join(', ');
      throw new Error(
        `OpenCode Go requires ${missing} in quota_checker.options. ` +
          'Set these in the provider config (e.g. options: { workspaceId: "...", authCookie: "..." })'
      );
    }
    const configuredEndpoint = ctx.getOption<string>('endpoint', '');
    const endpoint =
      configuredEndpoint ||
      `${DASHBOARD_BASE_URL}${encodeURIComponent(workspaceId)}${DASHBOARD_URL_SUFFIX}`;

    logger.silly(`Fetching OpenCode Go dashboard: ${endpoint}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

    let html: string;
    let finalUrl = '';
    let redirected = false;
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html',
          Cookie: `auth=${authCookie}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OpenCode Go dashboard error ${response.status}: ${response.statusText}`);
      }

      finalUrl = response.url ?? '';
      redirected = response.redirected;
      html = await response.text();
    } finally {
      clearTimeout(timeout);
    }

    if (isLoginPage(html, finalUrl, redirected)) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    const rolling = parseWindowUsage(html, 'rollingUsage');
    const weekly = parseWindowUsage(html, 'weeklyUsage');
    const monthly = parseWindowUsage(html, 'monthlyUsage');

    if (!rolling && !weekly && !monthly) {
      throw new Error(
        'Could not parse any OpenCode Go dashboard usage windows (rollingUsage, weeklyUsage, monthlyUsage)'
      );
    }

    const meters = [];
    const now = Date.now();

    if (rolling) {
      meters.push(
        ctx.allowance({
          key: 'rolling_5h',
          label: 'Rolling 5h quota',
          unit: 'percentage',
          used: rolling.usagePercent,
          remaining: Math.max(0, 100 - rolling.usagePercent),
          periodValue: 5,
          periodUnit: 'hour',
          periodCycle: 'rolling',
          resetsAt: new Date(now + rolling.resetInSec * 1000).toISOString(),
        })
      );
    }

    if (weekly) {
      meters.push(
        ctx.allowance({
          key: 'weekly',
          label: 'Weekly quota',
          unit: 'percentage',
          used: weekly.usagePercent,
          remaining: Math.max(0, 100 - weekly.usagePercent),
          periodValue: 7,
          periodUnit: 'day',
          periodCycle: 'rolling',
          resetsAt: new Date(now + weekly.resetInSec * 1000).toISOString(),
        })
      );
    }

    if (monthly) {
      meters.push(
        ctx.allowance({
          key: 'monthly',
          label: 'Monthly quota',
          unit: 'percentage',
          used: monthly.usagePercent,
          remaining: Math.max(0, 100 - monthly.usagePercent),
          periodValue: 1,
          periodUnit: 'month',
          periodCycle: 'rolling',
          resetsAt: new Date(now + monthly.resetInSec * 1000).toISOString(),
        })
      );
    }

    logger.debug(`Returning ${meters.length} OpenCode Go meter(s)`);
    return meters;
  },
});
