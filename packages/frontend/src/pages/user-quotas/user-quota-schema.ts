/**
 * user-quota-schema.ts — Zod schema for the User Quota form.
 *
 * Canonical form-validation pattern for Phase 4 (reference for Phases 5–7):
 *   - z.object() with typed enums matching the API's UserQuota interface.
 *   - Cross-field rule (duration required for rolling) enforced here so the
 *     same schema works for both client validation and runtime narrowing.
 *
 * Scoped multi-quota feature (ported from main's Keys.tsx, see PR #651):
 *   - `shared`: pools usage across every key referencing the quota. Kept as
 *     `boolean | undefined` in form state (not defaulted to `false`) so an
 *     edited quota that never carried a `shared` field on the wire can still
 *     round-trip as "absent" rather than becoming an explicit `false` — see
 *     `toUserQuotaPayload`.
 *   - `warnAtPercent`: numeric field kept as a STRING in form state (existing
 *     convention for optional numerics elsewhere in this codebase, e.g.
 *     `pi-registry-schema.ts`'s `num`/`float` helpers) — '' means disabled.
 *     Displayed/edited as a whole percent (1-99) and converted to the
 *     `warnAt` fraction (0,1) exclusive only at payload time.
 *   - allowedProviders/excludedProviders/allowedModels/excludedModels: scope
 *     restriction arrays. Empty arrays are semantically "unscoped" — see
 *     `toUserQuotaPayload`'s per-field omission logic, which mirrors main's
 *     `handleSaveQuota` byte-for-byte.
 */
import * as z from 'zod';
import type { UserQuota } from '../../lib/api';

export const userQuotaFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters.')
      .max(63, 'Name must be at most 63 characters.')
      .regex(
        /^[a-z0-9][a-z0-9_-]*$/,
        'Lowercase letters, digits, hyphens, underscores only; must start with a letter or digit.'
      ),
    type: z.enum(['rolling', 'daily', 'weekly', 'monthly']),
    limitType: z.enum(['requests', 'tokens', 'cost']),
    limit: z.number().int().min(1, 'Must be at least 1'),
    duration: z.string().trim(),
    shared: z.boolean().optional(),
    warnAtPercent: z.string().trim(),
    allowedProviders: z.array(z.string()),
    excludedProviders: z.array(z.string()),
    allowedModels: z.array(z.string()),
    excludedModels: z.array(z.string()),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'rolling' && !data.duration) {
      ctx.addIssue({
        code: 'custom',
        path: ['duration'],
        message: 'Rolling quotas require a duration (e.g. 1h, 24h, 7d).',
      });
    }
    if (data.warnAtPercent !== '') {
      const pct = Number(data.warnAtPercent);
      const frac = pct / 100;
      // Mirrors main's handleSaveQuota guard: `warnAt <= 0 || warnAt >= 1` is
      // rejected — translated here to the percent-string the form edits.
      if (!Number.isFinite(frac) || frac <= 0 || frac >= 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['warnAtPercent'],
          message: 'Warn threshold must be between 0% and 100% (exclusive).',
        });
      }
    }
  });

export type UserQuotaFormValues = z.infer<typeof userQuotaFormSchema>;

/**
 * Build the UserQuota API payload from validated form values.
 *
 * Serialization rules (from main's handleSaveQuota — ported byte-for-byte):
 * - type/limitType/limit: always included.
 * - duration: omitted for non-rolling types, matching old handleSaveQuota
 *   behavior.
 * - shared: included verbatim (true or false) when the form carries a
 *   concrete value; omitted (not merely `false`) when the form value is
 *   `undefined` — i.e. an edited quota whose fetched definition never had a
 *   `shared` field, and the user never touched the toggle.
 * - warnAt: parsed from the percent-string field and included only when set;
 *   omitted when the field is empty. Validated in (0,1) exclusive above.
 * - allowedProviders/excludedProviders/allowedModels/excludedModels: each
 *   included only when non-empty. An empty scope array is semantically
 *   "unscoped" and must NOT be sent as `[]` on the wire.
 */
export function toUserQuotaPayload(values: UserQuotaFormValues): UserQuota {
  return {
    type: values.type,
    limitType: values.limitType,
    limit: values.limit,
    ...(values.type === 'rolling' && values.duration ? { duration: values.duration } : {}),
    ...(values.shared !== undefined ? { shared: values.shared } : {}),
    ...(values.warnAtPercent !== '' ? { warnAt: Number(values.warnAtPercent) / 100 } : {}),
    ...(values.allowedProviders.length > 0 ? { allowedProviders: values.allowedProviders } : {}),
    ...(values.excludedProviders.length > 0 ? { excludedProviders: values.excludedProviders } : {}),
    ...(values.allowedModels.length > 0 ? { allowedModels: values.allowedModels } : {}),
    ...(values.excludedModels.length > 0 ? { excludedModels: values.excludedModels } : {}),
  };
}

/**
 * True when a quota definition restricts itself to (or excludes) specific
 * providers or models. Mirrors main Keys.tsx's local `defHasScope` helper.
 *
 * Exported from here (rather than duplicated locally in every consumer)
 * because both the User Quotas page and the standalone UserQuotaTable
 * need the exact same "scoped" fact about a `UserQuota` definition, and this
 * module is already the single owner of the `UserQuota` shape's form/wire
 * semantics.
 */
export function defHasScope(def: UserQuota | undefined): boolean {
  if (!def) return false;
  return Boolean(
    def.allowedProviders?.length ||
      def.excludedProviders?.length ||
      def.allowedModels?.length ||
      def.excludedModels?.length
  );
}
