# Token Accounting Across Providers

This document defines how Plexus normalizes token usage across provider APIs.

## Unified Semantics in Plexus

Plexus stores usage with these normalized meanings:

- `input_tokens`: Uncached input tokens (the base-rate input bucket).
- `cached_tokens`: Cache-read tokens (discounted input bucket).
- `cache_creation_tokens`: Cache-write tokens (separate bucket, when provider exposes it).
- `output_tokens`: Generated output tokens.
- `reasoning_tokens`: Reasoning subset of output tokens (when provided).

For billing, Plexus treats `input_tokens`, `cached_tokens`, and `cache_creation_tokens` as distinct buckets.

## Provider-Specific Mapping

### OpenAI Chat Completions

Source fields:

- `usage.prompt_tokens`
- `usage.prompt_tokens_details.cached_tokens`
- `usage.completion_tokens`
- `usage.completion_tokens_details.reasoning_tokens`

Normalization:

- `input_tokens = max(0, prompt_tokens - cached_tokens)`
- `cached_tokens = prompt_tokens_details.cached_tokens`
- `output_tokens = completion_tokens`

Why: OpenAI documents `cached_tokens` as "cached tokens present in the prompt", i.e. part of prompt tokens.

### OpenAI Responses API

Source fields:

- `usage.input_tokens`
- `usage.input_tokens_details.cached_tokens`
- `usage.output_tokens`
- `usage.output_tokens_details.reasoning_tokens`

Normalization:

- Primary rule: `input_tokens = max(0, input_tokens - cached_tokens)`
- Defensive compatibility rule: if `cached_tokens > input_tokens`, treat `input_tokens` as already-uncached and keep it unchanged.

Why: OpenAI defines `input_tokens` and separately defines `cached_tokens` as tokens retrieved from cache. In real-world payloads we have seen both total-input and already-uncached interpretations, so Plexus defends against both without producing negative values.

### Anthropic Messages API

Source fields:

- `usage.input_tokens`
- `usage.cache_read_input_tokens`
- `usage.cache_creation_input_tokens`
- `usage.output_tokens`

Normalization:

- `input_tokens = usage.input_tokens` (already uncached)
- `cached_tokens = usage.cache_read_input_tokens`
- `cache_creation_tokens = usage.cache_creation_input_tokens`
- `output_tokens = usage.output_tokens`

Why: Anthropic explicitly defines `input_tokens` as tokens after the last cache breakpoint and defines reads/writes in separate fields.

### Google Gemini / Vertex AI

Source fields:

- `usageMetadata.promptTokenCount`
- `usageMetadata.cachedContentTokenCount`
- `usageMetadata.candidatesTokenCount`
- `usageMetadata.thoughtsTokenCount`

Normalization:

- `input_tokens = max(0, promptTokenCount - cachedContentTokenCount)`
- Defensive compatibility rule: if `cachedContentTokenCount > promptTokenCount`, keep `input_tokens = promptTokenCount`.
- `cached_tokens = cachedContentTokenCount`
- `output_tokens = candidatesTokenCount`

Why: Vertex AI defines `promptTokenCount` as total prompt tokens and states that when cached content is set, prompt count includes cached content.

## Implementation Locations

- Normalizers: `packages/backend/src/utils/usage-normalizer.ts`
- Gemini transformer extractors:
  - `packages/backend/src/transformers/gemini/index.ts`
  - `packages/backend/src/transformers/gemini/response-transformer.ts`
  - `packages/backend/src/transformers/gemini/stream-transformer.ts`
- Stream reconstruction path:
  - `packages/backend/src/services/inspectors/usage-logging.ts`

## Primary References

- OpenAI Prompt Caching guide: https://developers.openai.com/api/docs/guides/prompt-caching/
- OpenAI Responses API reference: https://platform.openai.com/docs/api-reference/responses
- Anthropic Prompt Caching docs: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Vertex AI GenerateContentResponse usage metadata: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/GenerateContentResponse
- Vertex AI context cache overview: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview
