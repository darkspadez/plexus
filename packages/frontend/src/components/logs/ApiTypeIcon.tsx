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
import { formatApiTypeLabel, getApiBaseType } from '../../lib/apiFormats';
import { API_LOGOS } from './constants';
import { isDecisionsApiType } from './helpers';

interface ApiTypeIconProps {
  apiType?: string | null;
  /** Edge length of the rendered icon in pixels. */
  size: number;
  /** Rendered instead of the "?" glyph when the type has no icon or logo. */
  fallback?: React.ReactNode;
  /** When false, brand logos are skipped and `fallback` renders instead. */
  logos?: boolean;
  /** Hides the logo from assistive tech (alt="") when a text label sits beside it. */
  decorative?: boolean;
}

export const ApiTypeIcon: React.FC<ApiTypeIconProps> = ({
  apiType,
  size,
  fallback,
  logos = true,
  decorative = false,
}) => {
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

  const logo = logos ? API_LOGOS[getApiBaseType(apiType)] : undefined;
  if (logo) {
    const label = formatApiTypeLabel(apiType);
    return decorative ? (
      <img src={logo} alt="" aria-hidden width={size} height={size} />
    ) : (
      <img src={logo} alt={label} title={label} width={size} height={size} />
    );
  }

  return <>{unknown}</>;
};
