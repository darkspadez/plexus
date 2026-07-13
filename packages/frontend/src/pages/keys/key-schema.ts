/**
 * key-schema.ts — Zod schema for the API Key form (Keys page).
 *
 * Mirrors the KeyConfig interface in lib/api.ts exactly.
 * The shape produced by toKeyConfig() must match what the old
 * handleSaveKey() passed to api.saveKey(editingKey, ...) verbatim.
 */
import * as z from 'zod';
import type { KeyConfig } from '../../lib/api';

/** Units offered by the create-only expiry input — mirrors upstream's
 * amount + unit pair, converted to `expiresInMinutes` on save. */
export type ExpiryUnit = 'minutes' | 'hours' | 'days';

export const EXPIRY_MINUTES_PER_UNIT: Record<ExpiryUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1_440,
};

export const keyFormSchema = z.object({
  key: z.string().trim().min(1, 'Key name is required.'),
  secret: z.string().trim().min(1, 'Secret is required.'),
  comment: z.string().optional(),
  // Zero or more quota-definition names assigned to this key (non-stacking:
  // an empty array falls back to the system's default_quotas). Renamed from
  // the deprecated single `quota` field — mirrors KeyConfig.quotas.
  quotas: z.array(z.string()),
  allowedModels: z.array(z.string()),
  allowedProviders: z.array(z.string()),
  excludedModels: z.array(z.string()),
  excludedProviders: z.array(z.string()),
  allowedIps: z.array(z.string()),
  // Create-only expiry input (hidden/ignored by the sheet when editing).
  // Empty string == "never expires"; otherwise must be a positive whole
  // number — mirrors upstream's `!Number.isInteger(amount) || amount <= 0`
  // check on `handleSaveKey`.
  expiryAmount: z
    .string()
    .optional()
    .refine((v) => !v || (/^\d+$/.test(v) && Number(v) > 0), {
      message: 'Expiry must be a positive whole number.',
    }),
  expiryUnit: z.enum(['minutes', 'hours', 'days']).optional(),
});

export type KeyFormValues = z.infer<typeof keyFormSchema>;

/**
 * Convert validated form values to the KeyConfig shape sent to api.saveKey().
 *
 * Serialization rules (from old handleSaveKey / EMPTY_KEY):
 * - comment: pass as-is (string or undefined)
 * - quotas: always include (even when empty `[]`) — same convention as every
 *   other array field below. api.saveKey() sends `keyConfig.quotas ?? []` on
 *   the wire regardless, so an always-present array here produces identical
 *   wire bytes to conditionally omitting it; always-include keeps this field
 *   consistent with its array-field siblings.
 * - all array fields: always include (even if empty); omit undefined/empty only
 *   if the old code omitted them — but old code passed the full editingKey which
 *   always had arrays once set. We replicate: pass non-empty arrays, omit empties.
 * - expiresInMinutes: only attached when `expiryAmount` is non-empty. The
 *   sheet only ever populates `expiryAmount` for a brand-new key (the field
 *   is hidden/reset to '' when editing), so this naturally stays create-only
 *   without toKeyConfig needing to know whether it's editing.
 */
export function toKeyConfig(values: KeyFormValues): KeyConfig {
  const amount = values.expiryAmount ? Number(values.expiryAmount) : undefined;
  return {
    key: values.key,
    secret: values.secret,
    ...(values.comment !== undefined && values.comment !== '' ? { comment: values.comment } : {}),
    quotas: values.quotas,
    allowedModels: values.allowedModels,
    allowedProviders: values.allowedProviders,
    excludedModels: values.excludedModels,
    excludedProviders: values.excludedProviders,
    allowedIps: values.allowedIps,
    ...(amount
      ? { expiresInMinutes: amount * EXPIRY_MINUTES_PER_UNIT[values.expiryUnit ?? 'days'] }
      : {}),
  };
}

export const KEY_FORM_DEFAULTS: KeyFormValues = {
  key: '',
  secret: '',
  comment: '',
  quotas: [],
  allowedModels: [],
  allowedProviders: [],
  excludedModels: [],
  excludedProviders: [],
  allowedIps: [],
  expiryAmount: '',
  expiryUnit: 'days',
};
