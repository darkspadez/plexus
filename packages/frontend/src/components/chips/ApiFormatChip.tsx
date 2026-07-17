import React from 'react';
import { getApiBaseType } from '../../lib/apiFormats';
import { Pill } from './Pill';

export type ApiFormat = 'OpenAI' | 'Anthropic' | 'Gemini' | 'Responses';

// Subtle alphas match the Pill tone tints in dark theme (0.18) so branded
// format chips carry the same visual weight as semantic pills beside them.
const FORMAT_HUES: Record<ApiFormat, { hex: string; subtle: string }> = {
  OpenAI: { hex: '#2F9F6A', subtle: 'rgba(47,159,106,0.18)' },
  Anthropic: { hex: '#E07A3E', subtle: 'rgba(224,122,62,0.18)' },
  Gemini: { hex: '#4A7FCF', subtle: 'rgba(74,127,207,0.18)' },
  Responses: { hex: '#7C5CFC', subtle: 'rgba(124,92,252,0.18)' },
};

// Aliases cover both the legacy/client-facing vocabulary (chat, messages,
// gemini, responses, openai, anthropic, google) AND the pi-ai (inference-v2)
// `KnownApi` wire-format vocabulary (e.g. anthropic-messages, openai-completions),
// so incoming and outgoing api types both resolve onto the same four branded
// formats regardless of which pipeline produced them. Azure/Vertex/Codex names
// are hosting/vendor variants of an already-known shape and map to that shape's
// branded format; `bedrock-converse-stream` and `mistral-conversations` have no
// confident 1:1 branded equivalent today and intentionally fall through to the
// unbranded (raw text) chip rendering below.
const FORMAT_ALIASES: Record<string, ApiFormat> = {
  chat: 'OpenAI',
  openai: 'OpenAI',
  'openai-completions': 'OpenAI',
  messages: 'Anthropic',
  anthropic: 'Anthropic',
  'anthropic-messages': 'Anthropic',
  gemini: 'Gemini',
  google: 'Gemini',
  'google-generative-ai': 'Gemini',
  'google-generative-ai-vertex': 'Gemini',
  'google-vertex': 'Gemini',
  responses: 'Responses',
  'openai-responses': 'Responses',
  'azure-openai-responses': 'Responses',
  'openai-codex-responses': 'Responses',
};

/**
 * Resolves a raw incoming/outgoing api-type string (legacy or pi-ai vocabulary)
 * onto its branded `ApiFormat`, or `null` when unrecognized. Exported so callers
 * (e.g. `getRoutePath` / `apiFormatsDiffer` in components/logs/route.ts) can
 * compare two raw api-type strings by their resolved format instead of the raw
 * strings themselves.
 */
export const resolveApiFormat = (value: string | undefined): ApiFormat | null => {
  if (!value) return null;
  const lower = value.toLowerCase();
  // Upstream api types may carry a `type:subtype` suffix (see lib/apiFormats);
  // fall back to the base type so subtyped variants still resolve to a brand.
  return FORMAT_ALIASES[lower] ?? FORMAT_ALIASES[getApiBaseType(lower)] ?? null;
};

interface ApiFormatChipProps {
  format: string;
  className?: string;
}

export const ApiFormatChip: React.FC<ApiFormatChipProps> = ({ format, className }) => {
  const resolved = resolveApiFormat(format);
  if (!resolved) {
    return (
      <Pill size="sm" className={className}>
        <span aria-hidden className="inline-block size-1.5 rounded-full bg-current" />
        {format}
      </Pill>
    );
  }
  const { hex, subtle } = FORMAT_HUES[resolved];
  return (
    <Pill size="sm" className={className} style={{ color: hex, backgroundColor: subtle }}>
      <span
        aria-hidden
        className="inline-block size-1.5 rounded-full"
        style={{ backgroundColor: hex }}
      />
      {resolved}
    </Pill>
  );
};
