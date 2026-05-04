// packages/frontend/src/components/models/AliasTableRow.tsx
import React from 'react';
import { Edit2, Loader2, Play, Trash2 } from 'lucide-react';
import { Alias, Cooldown } from '../../lib/api';
import { Pill } from '../chips/Pill';
import { ActiveDots, DotState } from './ActiveDots';
import { AliasIdentityCell } from './AliasIdentityCell';
import { ModelTypeBadge } from './ModelTypeBadge';

interface AliasTableRowProps {
  alias: Alias;
  cooldowns: Cooldown[];
  isExpanded: boolean;
  isTesting: boolean;
  onToggleExpand: () => void;
  onEdit: (alias: Alias) => void;
  onDelete: (alias: Alias) => void;
  onTestAll: (alias: Alias) => void;
}

export const AliasTableRow: React.FC<AliasTableRowProps> = ({
  alias,
  cooldowns,
  isExpanded,
  isTesting,
  onToggleExpand,
  onEdit,
  onDelete,
  onTestAll,
}) => {
  const dotStates: DotState[] = alias.targets.map((t) => {
    if (t.enabled === false) return 'disabled';
    const onCooldown = cooldowns.some(
      (c) => c.provider === t.provider && c.model === t.model && !c.accountId
    );
    return onCooldown ? 'cooldown' : 'active';
  });
  const testableCount = alias.targets.filter(
    (t) => t.enabled !== false && t.provider && t.model
  ).length;
  const testDisabled = isTesting || testableCount === 0;

  return (
    <tr className="cursor-pointer hover:bg-surface-elevated" onClick={onToggleExpand}>
      <td
        className="border-b border-border px-4 py-3 text-left text-foreground"
        style={{ paddingLeft: '24px' }}
      >
        <AliasIdentityCell
          id={alias.id}
          aliases={alias.aliases ?? []}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
        />
      </td>
      <td className="border-b border-border px-4 py-3 text-left text-foreground">
        <ModelTypeBadge type={alias.type} />
      </td>
      <td className="border-b border-border px-4 py-3 text-left text-foreground">
        <span className="text-[11px] capitalize text-foreground-muted">
          {alias.selector || 'random'}
        </span>
      </td>
      <td className="border-b border-border px-4 py-3 text-left text-foreground">
        {alias.metadata ? (
          <Pill size="sm" tone="accent" className="capitalize">
            {alias.metadata.source}
          </Pill>
        ) : (
          <span className="text-xs text-foreground-subtle">—</span>
        )}
      </td>
      <td className="border-b border-border px-4 py-3 text-left text-foreground">
        <ActiveDots states={dotStates} />
      </td>
      <td
        className="border-b border-border px-4 py-3 text-foreground"
        style={{ paddingRight: '24px', textAlign: 'right' }}
      >
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTestAll(alias);
            }}
            disabled={testDisabled}
            className="cursor-pointer rounded p-1 text-foreground-muted opacity-60 transition-all hover:bg-success-subtle hover:text-success hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-foreground-muted"
            aria-label="Test all targets"
            title={isTesting ? 'Testing…' : 'Test all targets'}
          >
            {isTesting ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <Play className="size-3.5" strokeWidth={1.75} />
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(alias);
            }}
            className="cursor-pointer rounded p-1 text-foreground-muted opacity-60 transition-all hover:bg-accent-subtle hover:text-accent hover:opacity-100"
            aria-label="Edit alias"
          >
            <Edit2 className="size-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(alias);
            }}
            className="cursor-pointer rounded p-1 text-foreground-muted opacity-60 transition-all hover:bg-danger-subtle hover:text-danger hover:opacity-100"
            aria-label="Delete alias"
          >
            <Trash2 className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </td>
    </tr>
  );
};
