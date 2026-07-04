import React from 'react';
import { cn } from '../../lib/cn';

export type ApiFormat = 'OpenAI' | 'Anthropic' | 'Gemini' | 'Responses';

const FORMAT_HUES: Record<ApiFormat, { hex: string; subtle: string }> = {
  OpenAI: { hex: '#2F9F6A', subtle: 'rgba(47,159,106,0.12)' },
  Anthropic: { hex: '#E07A3E', subtle: 'rgba(224,122,62,0.12)' },
  Gemini: { hex: '#4A7FCF', subtle: 'rgba(74,127,207,0.12)' },
  Responses: { hex: '#7C5CFC', subtle: 'rgba(124,92,252,0.12)' },
};

const FORMAT_ALIASES: Record<string, ApiFormat> = {
  chat: 'OpenAI',
  openai: 'OpenAI',
  messages: 'Anthropic',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  google: 'Gemini',
  responses: 'Responses',
};

const resolveFormat = (raw: string): ApiFormat | null => {
  const lower = raw.toLowerCase();
  if (lower in FORMAT_ALIASES) return FORMAT_ALIASES[lower]!;
  return null;
};

interface ApiFormatChipProps {
  format: string;
  className?: string;
}

export const ApiFormatChip: React.FC<ApiFormatChipProps> = ({ format, className }) => {
  const resolved = resolveFormat(format);
  if (!resolved) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full bg-surface-elevated px-2 py-0.5 font-mono text-[11px] font-medium leading-none text-foreground-muted',
          className
        )}
      >
        {format}
      </span>
    );
  }
  const { hex, subtle } = FORMAT_HUES[resolved];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-medium leading-none',
        className
      )}
      style={{ color: hex, backgroundColor: subtle }}
    >
      {resolved}
    </span>
  );
};
