/**
 * alias-schema.ts — Zod schema and save-payload serializer for the Alias form.
 *
 * The shape produced by toAliasPayload() must match exactly what the old
 * handleSave() in useModels.ts passed to api.saveAlias(alias, oldId).
 *
 * Save-payload rules (extracted from Models.tsx handleSave + useModels.ts handleSave):
 * - alias.id must be non-empty.
 * - If metadata.source === 'custom', metadata.overrides.name must be non-empty.
 * - All other Alias fields pass through as-is (api.saveAlias handles serialization).
 *
 * Note: this codebase uses Zod v4 (classic compat layer).
 * z.record() requires two args: z.record(keyType, valueType) — no 1-arg shorthand in types.
 */
import * as z from 'zod';
import type { Alias, CompactionSettings } from '../../lib/api';

// ---------------------------------------------------------------------------
// Zod schema — validates the minimum required fields before saving.
// ---------------------------------------------------------------------------

const aliasTargetSchema = z.object({
  provider: z.string(),
  model: z.string(),
  apiType: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

const aliasTargetGroupSchema = z.object({
  name: z.string(),
  selector: z.string(),
  targets: z.array(aliasTargetSchema),
});

const metadataOverridesSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  context_length: z.number().optional(),
  pricing: z
    .object({
      prompt: z.string().optional(),
      completion: z.string().optional(),
      input_cache_read: z.string().optional(),
      input_cache_write: z.string().optional(),
    })
    .optional(),
  architecture: z
    .object({
      input_modalities: z.array(z.string()).optional(),
      output_modalities: z.array(z.string()).optional(),
      tokenizer: z.string().optional(),
    })
    .optional(),
  supported_parameters: z.array(z.string()).optional(),
  top_provider: z
    .object({
      context_length: z.number().optional(),
      max_completion_tokens: z.number().optional(),
    })
    .optional(),
});

const aliasMetadataSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.enum(['openrouter', 'models.dev', 'catwalk']),
    source_path: z.string(),
    overrides: metadataOverridesSchema.optional(),
  }),
  z.object({
    source: z.literal('custom'),
    source_path: z.string().optional(),
    overrides: metadataOverridesSchema.extend({ name: z.string() }),
  }),
]);

const stripAdaptiveThinkingBehaviorSchema = z.object({
  type: z.literal('strip_adaptive_thinking'),
  enabled: z.boolean(),
});

const modelArchitectureSchema = z.object({
  total_params: z.number().optional(),
  active_params: z.number().optional(),
  layers: z.number().optional(),
  heads: z.number().optional(),
  kv_lora_rank: z.number().optional(),
  qk_rope_head_dim: z.number().optional(),
  context_length: z.number().optional(),
  dtype: z
    .enum(['fp16', 'bf16', 'fp8', 'fp8_e4m3', 'fp8_e5m2', 'nvfp4', 'int4', 'int8'])
    .optional(),
});

export const aliasFormSchema = z.object({
  id: z.string().trim().min(1, 'Alias ID is required'),
  aliases: z.array(z.string()).optional(),
  priority: z.enum(['selector', 'api_match']).optional(),
  type: z.enum(['text', 'embeddings', 'transcriptions', 'speech', 'image']).optional(),
  target_groups: z.array(aliasTargetGroupSchema),
  advanced: z.array(stripAdaptiveThinkingBehaviorSchema).optional(),
  metadata: aliasMetadataSchema.optional(),
  use_image_fallthrough: z.boolean().optional(),
  model_architecture: modelArchitectureSchema.optional(),
  enforce_limits: z.boolean().optional(),
  sticky_session: z.boolean().optional(),
  preferred_api: z
    .array(z.enum(['chat_completions', 'messages', 'gemini', 'responses']))
    .optional(),
  pi_model: z
    .object({
      provider: z.string(),
      model_id: z.string(),
    })
    .optional(),
  extraBody: z.record(z.string(), z.unknown()).optional(),
  // compaction: verbatim passthrough only (tri-state Inherit/On/Off relies on
  // undefined/true/false + null subfields) — intentionally untyped via
  // z.custom() so we never validate or reshape its contents.
  compaction: z.custom<CompactionSettings>().optional(),
});

export type AliasFormValues = z.infer<typeof aliasFormSchema>;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ToAliasPayloadResult {
  ok: true;
  alias: Alias;
}

export interface ToAliasPayloadError {
  ok: false;
  error: string;
}

// ---------------------------------------------------------------------------
// toAliasPayload — pure function extracted from Models.tsx handleSave().
//
// Applies the exact pre-flight validations the old handleSave() did before
// calling api.saveAlias(alias, oldId). Returns the Alias object to pass to
// api.saveAlias(), or an error string.
// ---------------------------------------------------------------------------

export function toAliasPayload(
  formValues: AliasFormValues
): ToAliasPayloadResult | ToAliasPayloadError {
  // Validate required id
  if (!formValues.id) {
    return { ok: false, error: 'Alias ID is required' };
  }

  // Validate custom metadata: name must be non-empty
  if (formValues.metadata?.source === 'custom') {
    const name = formValues.metadata.overrides?.name;
    if (!name || name.trim() === '') {
      return { ok: false, error: 'Custom metadata requires a non-empty Name.' };
    }
  }

  // Pass through as Alias — the shape is identical
  const alias: Alias = {
    id: formValues.id,
    ...(formValues.aliases !== undefined && { aliases: formValues.aliases }),
    ...(formValues.priority !== undefined && { priority: formValues.priority }),
    ...(formValues.type !== undefined && { type: formValues.type }),
    target_groups: formValues.target_groups,
    ...(formValues.advanced !== undefined && { advanced: formValues.advanced }),
    ...(formValues.metadata !== undefined && {
      metadata: formValues.metadata as Alias['metadata'],
    }),
    ...(formValues.use_image_fallthrough !== undefined && {
      use_image_fallthrough: formValues.use_image_fallthrough,
    }),
    ...(formValues.model_architecture !== undefined && {
      model_architecture: formValues.model_architecture,
    }),
    ...(formValues.enforce_limits !== undefined && { enforce_limits: formValues.enforce_limits }),
    ...(formValues.sticky_session !== undefined && { sticky_session: formValues.sticky_session }),
    ...(formValues.preferred_api !== undefined && { preferred_api: formValues.preferred_api }),
    ...(formValues.pi_model !== undefined && { pi_model: formValues.pi_model }),
    ...(formValues.extraBody !== undefined && {
      extraBody: formValues.extraBody as Record<string, any>,
    }),
    ...(formValues.compaction !== undefined && {
      compaction: formValues.compaction as Alias['compaction'],
    }),
  };

  return { ok: true, alias };
}

// ---------------------------------------------------------------------------
// Defaults for a new (empty) alias form — matches EMPTY_ALIAS in useModels.ts.
// ---------------------------------------------------------------------------

export const ALIAS_FORM_DEFAULTS: AliasFormValues = {
  id: '',
  aliases: [],
  priority: 'selector',
  target_groups: [{ name: 'default', selector: 'random', targets: [] }],
  sticky_session: true,
};
