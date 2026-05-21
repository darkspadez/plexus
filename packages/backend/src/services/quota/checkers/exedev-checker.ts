import { defineChecker } from '../checker-registry';
import { z } from 'zod';
import { logger } from '../../../utils/logger';

interface ExeDevCreditsResponse {
  monthly_allowance_usd: number;
  monthly_credits_left_usd: number;
  extra_credits_left_usd: number;
  next_credit_reset: string;
}

function parseResetTimestamp(input: string): string {
  // Format: "00:00 on Jun 1" → ISO 8601
  const [time, datePart] = input.split(' on ');
  if (!time || !datePart) throw new Error(`Cannot parse next_credit_reset: "${input}"`);

  const year = new Date().getUTCFullYear();
  let date = new Date(`${datePart}, ${year} ${time} UTC`);
  if (isNaN(date.getTime())) throw new Error(`Cannot parse next_credit_reset: "${input}"`);
  if (date < new Date()) date = new Date(`${datePart}, ${year + 1} ${time} UTC`);
  return date.toISOString();
}

export default defineChecker({
  type: 'exedev',
  displayName: 'exe.dev',
  optionsSchema: z.object({
    apiKey: z.string().min(1, 'exe.dev API bearer token is required'),
    endpoint: z.string().url().optional(),
  }),
  async check(ctx) {
    const apiKey = ctx.requireOption<string>('apiKey');
    const endpoint = ctx.getOption<string>('endpoint', 'https://exe.dev/exec');

    logger.silly(`Calling ${endpoint}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'text/plain',
      },
      body: 'billing credits --json',
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const data: ExeDevCreditsResponse = await response.json();

    const limit = Number(data.monthly_allowance_usd);
    const remaining = Number(data.monthly_credits_left_usd);
    const used = limit - remaining;
    const extraCredits = Number(data.extra_credits_left_usd);

    if (!Number.isFinite(limit))
      throw new Error(`Invalid monthly_allowance_usd: ${String(data.monthly_allowance_usd)}`);
    if (!Number.isFinite(remaining))
      throw new Error(`Invalid monthly_credits_left_usd: ${String(data.monthly_credits_left_usd)}`);
    if (!Number.isFinite(extraCredits))
      throw new Error(`Invalid extra_credits_left_usd: ${String(data.extra_credits_left_usd)}`);

    const resetsAt = data.next_credit_reset
      ? parseResetTimestamp(data.next_credit_reset)
      : undefined;

    return [
      ctx.allowance({
        key: 'shelley_allowance',
        label: 'Monthly allowance',
        unit: 'usd',
        limit,
        used,
        remaining,
        periodValue: 1,
        periodUnit: 'month',
        periodCycle: 'fixed',
        resetsAt,
      }),
      ctx.balance({
        key: 'shelley_extra_credits',
        label: 'Extra credits',
        unit: 'usd',
        remaining: extraCredits,
      }),
    ];
  },
});
