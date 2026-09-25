import { z } from 'zod';

/**
 * Pre-configured provider presets for the Add Provider flow.
 *
 * Each preset pre-fills the endpoint map (`apiBaseUrl`), the pi-ai provider
 * id, and auto-compat, so adding a known provider is pick-a-preset plus an
 * API key instead of hand-typing base URLs. Endpoint research (docs URLs,
 * verification status) lives with the project history; per-preset `notes`
 * capture only what an operator needs at setup time.
 *
 * URL convention: values are the base to store in `apiBaseUrl[type]` —
 * Plexus appends the per-type suffix (`/chat/completions`, `/messages`,
 * `/responses`, ...). Anthropic-compatible bases therefore include the
 * `/v1` segment (e.g. `.../anthropic/v1`), unlike SDK base URLs.
 */

const PresetTemplateVarSchema = z.object({
  /** Placeholder key, substituted as `{key}` wherever it appears in a URL. */
  key: z.string().trim().min(1),
  /** Label shown next to the setup-time input for this value. */
  label: z.string().trim().min(1),
  placeholder: z.string().optional(),
});

export const ProviderPresetSchema = z
  .object({
    /** Stable preset key, e.g. `openai`, `moonshot-cn`. */
    id: z.string().trim().min(1),
    /** Display label for the preset picker. */
    name: z.string().trim().min(1),
    description: z.string().optional(),
    docsUrl: z.string().url().optional(),
    /** Pre-filled provider id / display name (only applied to empty fields). */
    suggestedProviderId: z.string().trim().min(1),
    suggestedName: z.string().trim().min(1),
    /** Endpoint map applied verbatim to the provider draft's `apiBaseUrl`. */
    apiBaseUrl: z.record(z.string(), z.string().trim().min(1)),
    /** Subset of `apiBaseUrl` keys that are documented but not yet probed live. */
    experimentalApis: z.array(z.string().trim().min(1)).default([]),
    /** Setup-time values embedded as `{key}` placeholders in the URLs. */
    templateVars: z.array(PresetTemplateVarSchema).default([]),
    /** pi-ai builtin provider id used for catalog lookups and compat mapping. */
    piAiProvider: z.string().trim().min(1),
    autoCompat: z.boolean(),
    /** Operator-facing caveats shown in the picker (auth quirks, docs gaps). */
    notes: z.string().optional(),
  })
  .refine((preset) => Object.keys(preset.apiBaseUrl).length > 0, {
    message: 'preset must define at least one endpoint',
  })
  .refine((preset) => preset.experimentalApis.every((api) => api in preset.apiBaseUrl), {
    message: 'experimentalApis must be a subset of apiBaseUrl keys',
  })
  .refine(
    (preset) =>
      preset.templateVars.every((variable) =>
        Object.values(preset.apiBaseUrl).some((url) => url.includes(`{${variable.key}}`))
      ),
    { message: 'every templateVar key must appear as {key} in at least one URL' }
  );

export type ProviderPresetTemplateVar = z.infer<typeof PresetTemplateVarSchema>;
export type ProviderPreset = z.infer<typeof ProviderPresetSchema>;

export function findProviderPreset(
  presets: ProviderPreset[],
  id: string
): ProviderPreset | undefined {
  return presets.find((preset) => preset.id === id);
}

/**
 * Substitute `{key}` template placeholders in an endpoint map. Values without
 * a matching entry are left intact so partially-filled drafts keep visible
 * placeholders instead of silently producing broken URLs.
 */
export function substitutePresetVars(
  urls: Record<string, string>,
  values: Record<string, string>
): Record<string, string> {
  const substituted: Record<string, string> = {};
  for (const [apiType, url] of Object.entries(urls)) {
    substituted[apiType] = url.replace(/\{([^{}]+)\}/g, (match, key: string) => {
      const value = values[key]?.trim();
      return value ? value : match;
    });
  }
  return substituted;
}

/** Minimal structural draft a preset can be applied to (the frontend Provider satisfies this). */
export interface ProviderPresetDraft {
  id: string;
  name: string;
  apiBaseUrl?: string | Record<string, string>;
  apiKey: string;
  oauthProvider?: string;
  type: string | string[];
  pi_ai_provider?: string;
  auto_compat?: boolean;
}

/**
 * Apply a preset to a provider draft: endpoint map, derived API types, pi-ai
 * provider, and auto-compat. The id/name suggestions only fill empty fields
 * so re-applying never clobbers operator input. Presets are API-key
 * providers, so any OAuth-mode leftovers are cleared.
 */
export function applyProviderPreset<T extends ProviderPresetDraft>(
  draft: T,
  preset: ProviderPreset,
  varValues: Record<string, string> = {}
): T {
  return {
    ...draft,
    id: draft.id.trim() ? draft.id : preset.suggestedProviderId,
    name: draft.name.trim() ? draft.name : preset.suggestedName,
    apiBaseUrl: substitutePresetVars({ ...preset.apiBaseUrl }, varValues),
    apiKey: draft.apiKey === 'oauth' ? '' : draft.apiKey,
    oauthProvider: '',
    type: Object.keys(preset.apiBaseUrl),
    pi_ai_provider: preset.piAiProvider,
    auto_compat: preset.autoCompat,
  };
}
