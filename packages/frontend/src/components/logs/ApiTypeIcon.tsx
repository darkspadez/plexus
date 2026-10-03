import React from 'react';
import {
  AudioLines,
  BadgeQuestionMark,
  Disc,
  Gavel,
  Image as ImageIcon,
  ShieldCheck,
  Variable,
  Volume2,
} from 'lucide-react';
import { isDecisionsApiType } from './helpers';

interface ApiTypeIconProps {
  apiType?: string | null;
  /** Edge length of the rendered icon in pixels. */
  size: number;
  /** Rendered instead of the "?" glyph when the type has no icon. */
  fallback?: React.ReactNode;
}

export const ApiTypeIcon: React.FC<ApiTypeIconProps> = ({ apiType, size, fallback }) => {
  const unknown = fallback ?? <span className="text-[10px] text-foreground-subtle">?</span>;
  if (!apiType) return <>{unknown}</>;
  if (apiType === 'embeddings') return <Variable size={size} className="text-success" />;
  if (apiType === 'transcriptions') return <AudioLines size={size} className="text-accent" />;
  if (apiType === 'speech') return <Volume2 size={size} className="text-warning" />;
  if (apiType === 'images') return <ImageIcon size={size} className="text-warning" />;
  if (apiType === 'completions') return <Disc size={size} className="text-info" />;
  if (apiType === 'raw') return <BadgeQuestionMark size={size} className="text-info" />;
  if (isDecisionsApiType(apiType)) return <Gavel size={size} className="text-info" />;
  if (apiType === 'oauth') return <ShieldCheck size={size} className="text-success" />;

  return <>{unknown}</>;
};
