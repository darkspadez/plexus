export type ApiAccessOption = { type: string; label: string };

export const API_ACCESS_OPTIONS: readonly ApiAccessOption[] = [
  { type: 'chat', label: 'chat' },
  { type: 'completions', label: 'completions' },
  { type: 'messages', label: 'messages' },
  { type: 'gemini', label: 'gemini' },
  { type: 'responses', label: 'responses' },
  { type: 'ollama', label: 'ollama' },
];

export const IMAGE_API_ACCESS_OPTIONS: readonly ApiAccessOption[] = [
  { type: 'chat', label: 'OpenAI-compatible' },
  { type: 'openai-images', label: 'OpenAI Images' },
  { type: 'openrouter-images', label: 'OpenRouter Images' },
  { type: 'gemini', label: 'Gemini Images' },
];

export const CODEX_IMAGE_API_ACCESS_OPTIONS: readonly ApiAccessOption[] = [
  { type: 'codex-images', label: 'Codex Images (ChatGPT OAuth)' },
];

export const CODEX_OAUTH_PROVIDER = 'openai-codex';
export const DEFAULT_IMAGE_ACCESS = 'openai-images';
export const CODEX_IMAGE_ACCESS = 'codex-images';
export const GPT5_SUPPRESSION_ADAPTER = 'suppress_unsupported_gpt5_options';

// Consistent compact field class used everywhere in the model editor
export const FIELD_CLS =
  'w-full h-[27px] py-0 px-2 font-sans text-[12px] leading-none text-foreground bg-surface border border-border rounded-sm outline-none focus:border-accent';

export function isGpt5Model(modelId: string): boolean {
  return /^gpt-5(?:[.-]|$)/i.test(modelId);
}

// Bespoke per-API brand colors — not part of the design-token palette, so these
// stay as arbitrary-value Tailwind classes rather than semantic tokens.
export function getApiBadgeClass(apiType: string): string {
  switch (apiType.toLowerCase()) {
    case 'messages':
      return 'bg-[#D97757] text-white border-none';
    case 'chat':
      return 'bg-[#ebebeb] text-[#333] border-none';
    case 'completions':
      return 'bg-[#3b82f6] text-white border-none';
    case 'gemini':
      return 'bg-[#5084ff] text-white border-none';
    case 'embeddings':
      return 'bg-[#10b981] text-white border-none';
    case 'transcriptions':
      return 'bg-[#a855f7] text-white border-none';
    case 'speech':
      return 'bg-[#f97316] text-white border-none';
    case 'openai-images':
      return 'bg-[#d946ef] text-white border-none';
    case 'responses':
      return 'bg-[#06b6d4] text-white border-none';
    case 'openrouter-images':
      return 'bg-[#7c3aed] text-white border-none';
    case 'codex-images':
      return 'bg-[#10a37f] text-white border-none';
    case 'ollama':
      return 'bg-[#1a5f7a] text-white border-none';
    default:
      return '';
  }
}
