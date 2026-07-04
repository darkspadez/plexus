/**
 * config-schemas.ts — Zod schemas for the Config page settings panels.
 *
 * Each panel gets its own schema matching the exact payload the corresponding
 * api.patch* method expects. Characterization tests in __tests__/config-schemas.test.ts
 * lock down the serialization so that payload parity with the old imperative
 * handlers is provable.
 *
 * Note: this codebase uses Zod v4. Some Zod v3 APIs differ:
 *   - z.number({ invalid_type_error }) → z.number({ error }) in Zod v4
 *   - z.ZodTypeDef → z.ZodType (satisfies constraints differ)
 */
import * as z from 'zod';

// ---------------------------------------------------------------------------
// Failover Settings
// ---------------------------------------------------------------------------

export const failoverFormSchema = z.object({
  enabled: z.boolean(),
  /** Raw textarea text — parsed on submit (comma/space separated integers 100–599) */
  statusCodesText: z.string(),
  /** Raw textarea text — parsed on submit (comma/space separated strings) */
  errorsText: z.string(),
});

export type FailoverFormValues = z.infer<typeof failoverFormSchema>;

/**
 * Build the patchFailoverPolicy payload from form values.
 * Mirrors the old handleSaveFailover parse logic exactly.
 */
export function toFailoverPayload(values: FailoverFormValues): {
  enabled: boolean;
  retryableStatusCodes: number[];
  retryableErrors: string[];
} {
  const statusCodes = values.statusCodesText
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 100 && n <= 599);

  const retryableErrors = values.errorsText
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    enabled: values.enabled,
    retryableStatusCodes: statusCodes,
    retryableErrors,
  };
}

// ---------------------------------------------------------------------------
// Cooldown Settings
//
// Form values use number type directly — RHF's { valueAsNumber: true }
// coerces the input's string → number before validation.
// ---------------------------------------------------------------------------

export const cooldownFormSchema = z.object({
  initialMinutes: z.number().min(0.1, 'Must be at least 0.1'),
  maxMinutes: z.number().min(0.1, 'Must be at least 0.1'),
});

export type CooldownFormValues = z.infer<typeof cooldownFormSchema>;

export function toCooldownPayload(values: CooldownFormValues): {
  initialMinutes: number;
  maxMinutes: number;
} {
  return {
    initialMinutes: values.initialMinutes,
    maxMinutes: values.maxMinutes,
  };
}

// ---------------------------------------------------------------------------
// Timeout Settings
// ---------------------------------------------------------------------------

export const timeoutFormSchema = z.object({
  defaultSeconds: z
    .number()
    .int('Must be an integer')
    .min(1, 'Must be at least 1')
    .max(3600, 'Must be at most 3600'),
});

export type TimeoutFormValues = z.infer<typeof timeoutFormSchema>;

export function toTimeoutPayload(values: TimeoutFormValues): { defaultSeconds: number } {
  return { defaultSeconds: values.defaultSeconds };
}

// ---------------------------------------------------------------------------
// Stall Detection Settings
//
// All form fields are strings (native input values). The schema validates and
// transforms them into the typed payload. We use StallFormRaw as the RHF form
// type (all strings) and validate via stallFormSchema.safeParse() in onSubmit.
// ---------------------------------------------------------------------------

export type StallFormRaw = {
  ttfbSeconds: string;
  ttfbBytes: string;
  minBytesPerSecond: string;
  windowSeconds: string;
  gracePeriodSeconds: string;
};

/** Validated (parsed) stall form values — output of stallFormSchema. */
export type StallFormParsed = {
  ttfbSeconds: number | null;
  ttfbBytes?: number;
  minBytesPerSecond: number | null;
  windowSeconds?: number;
  gracePeriodSeconds?: number;
};

/**
 * Validation-only schema that operates on string raw form values.
 * Returns StallFormParsed on success.
 */
export const stallFormSchema = z.object({
  /** Empty string means null (disabled). Must be integer 5–120 when present. */
  ttfbSeconds: z
    .string()
    .transform((v, ctx) => {
      if (v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        ctx.addIssue({ code: 'custom', message: 'Must be an integer' });
        return z.NEVER;
      }
      if (n < 5) {
        ctx.addIssue({ code: 'custom', message: 'Must be at least 5' });
        return z.NEVER;
      }
      if (n > 120) {
        ctx.addIssue({ code: 'custom', message: 'Must be at most 120' });
        return z.NEVER;
      }
      return n;
    })
    .pipe(z.number().nullable()),

  /** Must be integer 50–10000 when non-empty; empty keeps server default. */
  ttfbBytes: z
    .string()
    .transform((v, ctx) => {
      if (v === '') return undefined;
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        ctx.addIssue({ code: 'custom', message: 'Must be an integer' });
        return z.NEVER;
      }
      if (n < 50) {
        ctx.addIssue({ code: 'custom', message: 'Must be at least 50' });
        return z.NEVER;
      }
      if (n > 10000) {
        ctx.addIssue({ code: 'custom', message: 'Must be at most 10000' });
        return z.NEVER;
      }
      return n;
    })
    .pipe(z.number().optional()),

  /** Empty string means null (disabled). Must be integer 50–5000 when present. */
  minBytesPerSecond: z
    .string()
    .transform((v, ctx) => {
      if (v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        ctx.addIssue({ code: 'custom', message: 'Must be an integer' });
        return z.NEVER;
      }
      if (n < 50) {
        ctx.addIssue({ code: 'custom', message: 'Must be at least 50' });
        return z.NEVER;
      }
      if (n > 5000) {
        ctx.addIssue({ code: 'custom', message: 'Must be at most 5000' });
        return z.NEVER;
      }
      return n;
    })
    .pipe(z.number().nullable()),

  /** Must be integer 3–30 when non-empty; empty keeps server default. */
  windowSeconds: z
    .string()
    .transform((v, ctx) => {
      if (v === '') return undefined;
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        ctx.addIssue({ code: 'custom', message: 'Must be an integer' });
        return z.NEVER;
      }
      if (n < 3) {
        ctx.addIssue({ code: 'custom', message: 'Must be at least 3' });
        return z.NEVER;
      }
      if (n > 30) {
        ctx.addIssue({ code: 'custom', message: 'Must be at most 30' });
        return z.NEVER;
      }
      return n;
    })
    .pipe(z.number().optional()),

  /** Must be integer 0–120 when non-empty; empty keeps server default. */
  gracePeriodSeconds: z
    .string()
    .transform((v, ctx) => {
      if (v === '') return undefined;
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        ctx.addIssue({ code: 'custom', message: 'Must be an integer' });
        return z.NEVER;
      }
      if (n < 0) {
        ctx.addIssue({ code: 'custom', message: 'Must be at least 0' });
        return z.NEVER;
      }
      if (n > 120) {
        ctx.addIssue({ code: 'custom', message: 'Must be at most 120' });
        return z.NEVER;
      }
      return n;
    })
    .pipe(z.number().optional()),
});

/**
 * Build the patchStallConfig partial payload.
 * Mirrors the old handleSaveStall logic exactly:
 * - ttfbSeconds: always sent (null when empty)
 * - minBytesPerSecond: always sent (null when empty)
 * - ttfbBytes / windowSeconds / gracePeriodSeconds: only sent when non-empty
 */
export function toStallPayload(values: StallFormParsed): {
  ttfbSeconds?: number | null;
  ttfbBytes?: number;
  minBytesPerSecond?: number | null;
  windowSeconds?: number;
  gracePeriodSeconds?: number;
} {
  const payload: {
    ttfbSeconds?: number | null;
    ttfbBytes?: number;
    minBytesPerSecond?: number | null;
    windowSeconds?: number;
    gracePeriodSeconds?: number;
  } = {};

  // Always include nullable fields (null = disabled)
  payload.ttfbSeconds = values.ttfbSeconds;
  payload.minBytesPerSecond = values.minBytesPerSecond;

  // Only include optional fields when they have a value
  if (values.ttfbBytes !== undefined) payload.ttfbBytes = values.ttfbBytes;
  if (values.windowSeconds !== undefined) payload.windowSeconds = values.windowSeconds;
  if (values.gracePeriodSeconds !== undefined)
    payload.gracePeriodSeconds = values.gracePeriodSeconds;

  return payload;
}

// ---------------------------------------------------------------------------
// Exploration Settings
//
// Uses { valueAsNumber: true } in the component for number fields.
// ---------------------------------------------------------------------------

export const explorationFormSchema = z.object({
  performanceExplorationRate: z
    .number()
    .min(0, 'Must be between 0 and 1')
    .max(1, 'Must be between 0 and 1'),
  latencyExplorationRate: z
    .number()
    .min(0, 'Must be between 0 and 1')
    .max(1, 'Must be between 0 and 1'),
  e2ePerformanceExplorationRate: z
    .number()
    .min(0, 'Must be between 0 and 1')
    .max(1, 'Must be between 0 and 1'),
  bgEnabled: z.boolean(),
  stalenessThresholdSeconds: z
    .number()
    .int('Must be an integer (seconds)')
    .min(1, 'Must be at least 1 second'),
  workerConcurrency: z
    .number()
    .int('Must be an integer')
    .min(1, 'Must be between 1 and 16')
    .max(16, 'Must be between 1 and 16'),
});

export type ExplorationFormValues = z.infer<typeof explorationFormSchema>;

export function toExplorationPayload(values: ExplorationFormValues): {
  bgExploration: {
    enabled: boolean;
    stalenessThresholdSeconds: number;
    workerConcurrency: number;
  };
  rates: {
    performanceExplorationRate: number;
    latencyExplorationRate: number;
    e2ePerformanceExplorationRate: number;
  };
} {
  return {
    bgExploration: {
      enabled: values.bgEnabled,
      stalenessThresholdSeconds: values.stalenessThresholdSeconds,
      workerConcurrency: values.workerConcurrency,
    },
    rates: {
      performanceExplorationRate: values.performanceExplorationRate,
      latencyExplorationRate: values.latencyExplorationRate,
      e2ePerformanceExplorationRate: values.e2ePerformanceExplorationRate,
    },
  };
}

// ---------------------------------------------------------------------------
// Network Settings (Trusted Proxies)
// ---------------------------------------------------------------------------

export const networkFormSchema = z.object({
  trustedProxies: z.array(z.string()),
});

export type NetworkFormValues = z.infer<typeof networkFormSchema>;

export function toNetworkPayload(values: NetworkFormValues): string[] {
  return values.trustedProxies;
}

// ---------------------------------------------------------------------------
// Context Compaction Settings
//
// All form fields are strings (native input values), same approach as Stall.
// Mirrors the old handleSaveCompaction logic exactly: the whole current
// settings object was re-sent on every save, so every field the form shows
// must be emitted per its own blank-state rule — never conditionally skipped
// because some OTHER toggle (e.g. strategy) is in a particular position.
//   - "empty = off" fields (absoluteTriggerTokens, headroom.targetRatio) are
//     nullable and ALWAYS included (null when blank).
//   - "empty = server default" fields (triggerRatio, minTokens, protectRecent,
//     native.maxArrayItems/maxStringChars, headroom.baseUrl/apiKey/timeoutMs)
//     are optional and OMITTED entirely when blank.
//   - native / headroom sub-objects are always present regardless of which
//     strategy is currently selected.
// ---------------------------------------------------------------------------

export type CompactionFormRaw = {
  enabled: boolean;
  strategy: 'native' | 'headroom';
  triggerRatio: string;
  absoluteTriggerTokens: string;
  minTokens: string;
  protectRecent: string;
  native: {
    maxArrayItems: string;
    maxStringChars: string;
  };
  headroom: {
    baseUrl: string;
    apiKey: string;
    targetRatio: string;
    timeoutMs: string;
  };
};

/** Validated (parsed) compaction form values — output of compactionFormSchema. */
export type CompactionFormParsed = {
  enabled: boolean;
  strategy: 'native' | 'headroom';
  triggerRatio?: number;
  absoluteTriggerTokens: number | null;
  minTokens?: number;
  protectRecent?: number;
  native: {
    maxArrayItems?: number;
    maxStringChars?: number;
  };
  headroom: {
    baseUrl?: string;
    apiKey?: string;
    targetRatio: number | null;
    timeoutMs?: number;
  };
};

/** Optional numeric field: empty string keeps the server default (omitted on save). */
function optionalNumberField(label: string) {
  return z
    .string()
    .transform((v, ctx) => {
      if (v === '') return undefined;
      const n = Number(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: 'custom', message: `${label} must be a number` });
        return z.NEVER;
      }
      return n;
    })
    .pipe(z.number().optional());
}

/** Nullable numeric field: empty string means null (feature explicitly disabled). */
function nullableNumberField(label: string) {
  return z
    .string()
    .transform((v, ctx) => {
      if (v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: 'custom', message: `${label} must be a number` });
        return z.NEVER;
      }
      return n;
    })
    .pipe(z.number().nullable());
}

/** Optional string field: empty string keeps the server default (omitted on save). */
const optionalStringField = z
  .string()
  .transform((v) => (v === '' ? undefined : v))
  .pipe(z.string().optional());

/**
 * Validation-only schema that operates on string raw form values.
 * Returns CompactionFormParsed on success.
 */
export const compactionFormSchema = z.object({
  enabled: z.boolean(),
  strategy: z.enum(['native', 'headroom']),
  triggerRatio: optionalNumberField('Trigger ratio'),
  absoluteTriggerTokens: nullableNumberField('Absolute trigger tokens'),
  minTokens: optionalNumberField('Min tokens'),
  protectRecent: optionalNumberField('Protect recent'),
  native: z.object({
    maxArrayItems: optionalNumberField('Max array items'),
    maxStringChars: optionalNumberField('Max string chars'),
  }),
  headroom: z.object({
    baseUrl: optionalStringField,
    apiKey: optionalStringField,
    targetRatio: nullableNumberField('Target ratio'),
    timeoutMs: optionalNumberField('Timeout'),
  }),
});

/**
 * Build the patchCompactionConfig payload from form values.
 * Mirrors the old handleSaveCompaction logic exactly:
 * - enabled / strategy: always sent
 * - absoluteTriggerTokens / headroom.targetRatio: always sent (null = disabled)
 * - triggerRatio / minTokens / protectRecent / native.* / headroom.baseUrl /
 *   headroom.apiKey / headroom.timeoutMs: omitted from the payload when blank
 * - native / headroom sub-objects are always present regardless of the
 *   currently selected strategy — emission is never gated on that toggle.
 */
export function toCompactionPayload(values: CompactionFormParsed): {
  enabled: boolean;
  strategy: 'native' | 'headroom';
  triggerRatio?: number;
  absoluteTriggerTokens: number | null;
  minTokens?: number;
  protectRecent?: number;
  native: { maxArrayItems?: number; maxStringChars?: number };
  headroom: { baseUrl?: string; apiKey?: string; targetRatio: number | null; timeoutMs?: number };
} {
  const native: { maxArrayItems?: number; maxStringChars?: number } = {};
  if (values.native.maxArrayItems !== undefined) {
    native.maxArrayItems = values.native.maxArrayItems;
  }
  if (values.native.maxStringChars !== undefined) {
    native.maxStringChars = values.native.maxStringChars;
  }

  const headroom: {
    baseUrl?: string;
    apiKey?: string;
    targetRatio: number | null;
    timeoutMs?: number;
  } = {
    targetRatio: values.headroom.targetRatio,
  };
  if (values.headroom.baseUrl !== undefined) headroom.baseUrl = values.headroom.baseUrl;
  if (values.headroom.apiKey !== undefined) headroom.apiKey = values.headroom.apiKey;
  if (values.headroom.timeoutMs !== undefined) headroom.timeoutMs = values.headroom.timeoutMs;

  const payload: {
    enabled: boolean;
    strategy: 'native' | 'headroom';
    triggerRatio?: number;
    absoluteTriggerTokens: number | null;
    minTokens?: number;
    protectRecent?: number;
    native: { maxArrayItems?: number; maxStringChars?: number };
    headroom: { baseUrl?: string; apiKey?: string; targetRatio: number | null; timeoutMs?: number };
  } = {
    enabled: values.enabled,
    strategy: values.strategy,
    absoluteTriggerTokens: values.absoluteTriggerTokens,
    native,
    headroom,
  };
  if (values.triggerRatio !== undefined) payload.triggerRatio = values.triggerRatio;
  if (values.minTokens !== undefined) payload.minTokens = values.minTokens;
  if (values.protectRecent !== undefined) payload.protectRecent = values.protectRecent;

  return payload;
}
