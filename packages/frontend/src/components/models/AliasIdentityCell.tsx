// packages/frontend/src/components/models/AliasIdentityCell.tsx
import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Pill } from '../chips/Pill';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui-v2/tooltip';

interface AliasIdentityCellProps {
  id: string;
  aliases: string[];
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const INLINE_LIMIT = 2;

export const AliasIdentityCell: React.FC<AliasIdentityCellProps> = ({
  id,
  aliases,
  isExpanded,
  onToggleExpand,
}) => {
  const inline = aliases.slice(0, INLINE_LIMIT);
  const overflow = aliases.slice(INLINE_LIMIT);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
        className="flex size-5 items-center justify-center rounded text-foreground-muted hover:bg-surface-elevated hover:text-foreground"
        aria-label={isExpanded ? 'Collapse model' : 'Expand model'}
        aria-expanded={isExpanded}
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <span className="font-mono font-semibold">{id}</span>
      {inline.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {inline.map((a) => (
            <Pill key={a} size="sm" tone="neutral">
              <span className="font-mono">{a}</span>
            </Pill>
          ))}
          {overflow.length > 0 && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-default"
                  >
                    <Pill size="sm" tone="neutral">
                      +{overflow.length}
                    </Pill>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex flex-col gap-1 font-mono text-xs">
                    {overflow.map((a) => (
                      <span key={a}>{a}</span>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
    </div>
  );
};
