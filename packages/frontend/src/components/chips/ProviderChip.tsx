import React from 'react';
import { cn } from '../../lib/cn';

export type ProviderKey =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'google'
  | 'deepseek'
  | 'groq'
  | 'openrouter'
  | 'ollama'
  | 'oauth-github-copilot'
  | 'oauth-codex'
  | 'oauth-gemini-cli'
  | 'oauth-antigravity'
  | 'unknown';

interface ProviderHue {
  hex: string;
  label: string;
}

/** Provider color assignments — see DESIGN_SYSTEM.md §7.5.1. */
const PROVIDER_HUES: Record<ProviderKey, ProviderHue> = {
  openai: { hex: '#2A9D8F', label: 'OpenAI' },
  anthropic: { hex: '#C58A5A', label: 'Anthropic' },
  gemini: { hex: '#5B7FB8', label: 'Gemini' },
  google: { hex: '#5B7FB8', label: 'Google' },
  deepseek: { hex: '#6B6BC4', label: 'DeepSeek' },
  groq: { hex: '#C5635B', label: 'Groq' },
  openrouter: { hex: '#7A7468', label: 'OpenRouter' },
  ollama: { hex: '#6B9968', label: 'Ollama' },
  'oauth-github-copilot': { hex: '#4A4E58', label: 'GitHub Copilot' },
  'oauth-codex': { hex: '#4A4E58', label: 'Codex CLI' },
  'oauth-gemini-cli': { hex: '#5B7FB8', label: 'Gemini CLI' },
  'oauth-antigravity': { hex: '#4A4E58', label: 'Antigravity' },
  unknown: { hex: 'var(--foreground-muted)', label: 'Provider' },
};

const KEY_ALIASES: Record<string, ProviderKey> = {
  copilot: 'oauth-github-copilot',
  'github-copilot': 'oauth-github-copilot',
  'openai-codex': 'oauth-codex',
  codex: 'oauth-codex',
  antigravity: 'oauth-antigravity',
  'gemini-cli': 'oauth-gemini-cli',
};

const resolveKey = (key: string): ProviderKey => {
  const lower = key.toLowerCase();
  if (lower in PROVIDER_HUES) return lower as ProviderKey;
  if (lower in KEY_ALIASES) return KEY_ALIASES[lower]!;
  return 'unknown';
};

interface ProviderChipProps {
  /** Provider id — looked up against the fixed hue map. */
  provider: string;
  /** Override displayed label. Defaults to the canonical provider name. */
  label?: string;
  className?: string;
}

export const ProviderChip: React.FC<ProviderChipProps> = ({ provider, label, className }) => {
  const key = resolveKey(provider);
  const { hex, label: defaultLabel } = PROVIDER_HUES[key];
  const text = label ?? defaultLabel;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium leading-none',
        className
      )}
      style={{
        color: hex,
        backgroundColor: hex.startsWith('#') ? `${hex}1F` : 'var(--surface-elevated)',
      }}
    >
      <span
        aria-hidden
        className="inline-block size-1.5 rounded-full"
        style={{ backgroundColor: hex }}
      />
      {text}
    </span>
  );
};
