/**
 * provider-schema.ts — Zod schema and save-payload serializer for the Provider form.
 *
 * The shape produced by toProviderPayload() must match exactly what the old
 * handleSave() in useProviderForm.tsx passed to api.saveProvider(providerToSave, ...).
 *
 * Save-payload rules (extracted from useProviderForm.tsx handleSave):
 * - In OAuth mode, if oauthProvider is empty, default to first OAUTH_PROVIDERS entry.
 * - If quotaChecker.type is empty/blank, strip the quotaChecker entirely.
 * - All other Provider fields pass through as-is (api.saveProvider handles further mapping).
 *
 * Note: this codebase uses Zod v4 (classic compat layer).
 * z.record() requires two args: z.record(keyType, valueType) — no 1-arg shorthand in types.
 */
import * as z from 'zod';
import type { Provider, CompactionSettings } from '../../lib/api';

export const OAUTH_PROVIDERS_DEFAULT = 'anthropic';

// ---------------------------------------------------------------------------
// Zod schema — validates the minimum required fields before saving.
// The Provider object is complex and edited via sub-editors; we validate
// key invariants rather than re-declaring every field.
// ---------------------------------------------------------------------------

const quotaCheckerSchema = z.object({
  type: z.string().optional(),
  enabled: z.boolean(),
  intervalMinutes: z.number().min(1),
  options: z.record(z.string(), z.unknown()).optional(),
});

const modelAutosyncSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().min(1),
});

export const providerFormSchema = z.object({
  id: z.string().trim().min(1, 'Provider ID is required'),
  name: z.string(),
  type: z.union([z.string(), z.array(z.string())]),
  apiBaseUrl: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
  apiKey: z.string(),
  oauthProvider: z.string().optional(),
  oauthAccount: z.string().optional(),
  enabled: z.boolean(),
  disableCooldown: z.boolean().optional(),
  stallCooldown: z.boolean().optional(),
  estimateTokens: z.boolean().optional(),
  useClaudeMasking: z.boolean().optional(),
  geminiThinkingEnabled: z.boolean().optional(),
  discount: z.number().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  extraBody: z.record(z.string(), z.unknown()).optional(),
  models: z.union([z.array(z.string()), z.record(z.string(), z.unknown())]).optional(),
  quotaChecker: quotaCheckerSchema.optional(),
  modelAutosync: modelAutosyncSchema.optional(),
  gpu_profile: z.string().optional(),
  gpu_ram_gb: z.number().optional(),
  gpu_bandwidth_tb_s: z.number().optional(),
  gpu_flops_tflop: z.number().optional(),
  gpu_power_draw_watts: z.number().optional(),
  adapter: z.array(z.unknown()).optional(),
  timeoutMs: z.number().optional(),
  maxConcurrency: z.number().nullable().optional(),
  stallTtfbMs: z.number().nullable().optional(),
  stallTtfbBytes: z.number().nullable().optional(),
  stallMinBps: z.number().nullable().optional(),
  stallWindowMs: z.number().nullable().optional(),
  stallGracePeriodMs: z.number().nullable().optional(),
  pi_ai_provider: z.string().optional(),
  // compaction: verbatim passthrough only (tri-state Inherit/On/Off relies on
  // undefined/true/false + null subfields) — intentionally untyped via
  // z.custom() so we never validate or reshape its contents.
  compaction: z.custom<CompactionSettings>().optional(),
});

export type ProviderFormValues = z.infer<typeof providerFormSchema>;

// ---------------------------------------------------------------------------
// OAuth mode detection — same logic as useProviderForm.tsx isOAuthMode
// ---------------------------------------------------------------------------

export function isOAuthProvider(provider: ProviderFormValues): boolean {
  return (
    typeof provider.apiBaseUrl === 'string' &&
    provider.apiBaseUrl.toLowerCase().startsWith('oauth://')
  );
}

// ---------------------------------------------------------------------------
// toProviderPayload — pure function extracted from handleSave().
//
// Applies the exact pre-flight transformations the old handleSave() did before
// calling api.saveProvider(providerToSave, ...). Returns the Provider object
// to pass to api.saveProvider(), or throws a validation error string.
// ---------------------------------------------------------------------------

export interface ToProviderPayloadResult {
  ok: true;
  provider: Provider;
}

export interface ToProviderPayloadError {
  ok: false;
  error: string;
}

export function toProviderPayload(
  formValues: ProviderFormValues,
  options?: { isOAuthMode?: boolean }
): ToProviderPayloadResult | ToProviderPayloadError {
  // Detect OAuth mode from the values themselves if not passed explicitly
  const oauthMode = options?.isOAuthMode ?? isOAuthProvider(formValues);

  let p: Provider = {
    id: formValues.id,
    name: formValues.name,
    type: formValues.type,
    apiBaseUrl: formValues.apiBaseUrl,
    apiKey: formValues.apiKey,
    oauthProvider: formValues.oauthProvider,
    oauthAccount: formValues.oauthAccount,
    enabled: formValues.enabled,
    disableCooldown: formValues.disableCooldown,
    stallCooldown: formValues.stallCooldown,
    estimateTokens: formValues.estimateTokens,
    useClaudeMasking: formValues.useClaudeMasking,
    geminiThinkingEnabled: formValues.geminiThinkingEnabled,
    discount: formValues.discount,
    headers: formValues.headers,
    extraBody: formValues.extraBody as Record<string, any> | undefined,
    models: formValues.models,
    quotaChecker: formValues.quotaChecker,
    modelAutosync: formValues.modelAutosync,
    gpu_profile: formValues.gpu_profile,
    gpu_ram_gb: formValues.gpu_ram_gb,
    gpu_bandwidth_tb_s: formValues.gpu_bandwidth_tb_s,
    gpu_flops_tflop: formValues.gpu_flops_tflop,
    gpu_power_draw_watts: formValues.gpu_power_draw_watts,
    adapter: formValues.adapter as any[],
    timeoutMs: formValues.timeoutMs,
    maxConcurrency: formValues.maxConcurrency,
    stallTtfbMs: formValues.stallTtfbMs,
    stallTtfbBytes: formValues.stallTtfbBytes,
    stallMinBps: formValues.stallMinBps,
    stallWindowMs: formValues.stallWindowMs,
    stallGracePeriodMs: formValues.stallGracePeriodMs,
    pi_ai_provider: formValues.pi_ai_provider,
    compaction: formValues.compaction,
  };

  // OAuth mode: default oauthProvider, validate oauthAccount
  if (oauthMode) {
    if (!p.oauthProvider) {
      p = { ...p, oauthProvider: OAUTH_PROVIDERS_DEFAULT };
    }
    if (!p.oauthAccount?.trim()) {
      return { ok: false, error: 'OAuth account is required' };
    }
  }

  // Strip quotaChecker if type is empty/blank
  if (p.quotaChecker && !p.quotaChecker.type?.trim()) {
    p = { ...p, quotaChecker: undefined };
  }

  return { ok: true, provider: p };
}

// ---------------------------------------------------------------------------
// Defaults for a new (empty) provider form — matches EMPTY_PROVIDER in
// the old useProviderForm.tsx so edit-mode prefill is identical.
// ---------------------------------------------------------------------------

export const PROVIDER_FORM_DEFAULTS: ProviderFormValues = {
  id: '',
  name: '',
  type: [],
  apiKey: '',
  oauthProvider: '',
  oauthAccount: '',
  enabled: true,
  disableCooldown: false,
  stallCooldown: false,
  estimateTokens: false,
  useClaudeMasking: false,
  apiBaseUrl: {},
  headers: {},
  extraBody: {},
  models: {},
  modelAutosync: { enabled: false, intervalMinutes: 60 },
  adapter: [],
  timeoutMs: undefined,
  maxConcurrency: undefined,
};
