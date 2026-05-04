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

export const AliasIdentityCell: React.FC<AliasIdentityCellProps> = ({
  id,
  aliases,
  isExpanded,
  onToggleExpand,
}) => {
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
      {aliases.length > 0 && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="cursor-default"
                aria-label={`${aliases.length} routing ${aliases.length === 1 ? 'alias' : 'aliases'}`}
              >
                <Pill size="sm" tone="neutral">
                  +{aliases.length}
                </Pill>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col gap-1 font-mono text-xs">
                {aliases.map((a) => (
                  <span key={a}>{a}</span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};
