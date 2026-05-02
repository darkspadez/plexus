import React from 'react';
import { Pill, type PillTone } from '../chips/Pill';
import { cn } from '../../lib/cn';
import type { Alias } from '../../lib/api';

interface ModelTypeBadgeProps {
  type?: Alias['type'];
  className?: string;
}

const TYPE_TONE: Record<NonNullable<Alias['type']>, PillTone> = {
  chat: 'neutral',
  embeddings: 'success',
  transcriptions: 'accent',
  speech: 'warning',
  image: 'info',
  responses: 'info',
};

export const ModelTypeBadge: React.FC<ModelTypeBadgeProps> = ({ type, className }) => {
  const label = type || 'chat';
  const tone = TYPE_TONE[label as NonNullable<Alias['type']>] ?? 'neutral';
  return (
    <Pill tone={tone} size="sm" className={cn('uppercase tracking-wider', className)}>
      {label}
    </Pill>
  );
};
