import React from 'react';
import { Pill, type PillTone } from '../chips/Pill';
import { Alias } from '../../lib/api';

interface ModelTypeBadgeProps {
  type?: Alias['type'];
  className?: string;
}

const typeToTone: Record<string, PillTone> = {
  text: 'neutral',
  embeddings: 'secondary',
  // Type tones spread across the theme roles so each type reads distinctly in every theme.
  transcriptions: 'accent',
  speech: 'warning',
  image: 'primary',
  decisions: 'info',
};

export const ModelTypeBadge: React.FC<ModelTypeBadgeProps> = ({ type, className }) => {
  const label = type || 'text';
  const tone: PillTone = typeToTone[label] ?? 'neutral';

  return (
    <Pill tone={tone} size="sm" className={`uppercase tracking-wider ${className ?? ''}`}>
      {label}
    </Pill>
  );
};
