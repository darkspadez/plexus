import React from 'react';
import { Pill, type PillTone } from '../chips/Pill';
import { Alias } from '../../lib/api';

interface ModelTypeBadgeProps {
  type?: Alias['type'];
  className?: string;
}

const typeToTone: Record<string, PillTone> = {
  text: 'neutral',
  embeddings: 'success',
  // transcriptions, speech, image have no semantic token equivalent;
  // neutral keeps us within the token system. Visual distinction comes from the label.
  transcriptions: 'info',
  speech: 'warning',
  image: 'accent',
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
