// packages/frontend/src/components/models/AliasTableRow.tsx
import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { Alias } from '../../lib/api';
import { ActiveDots } from './ActiveDots';
import { AliasIdentityCell } from './AliasIdentityCell';
import { ModelTypeBadge } from './ModelTypeBadge';

interface AliasTableRowProps {
  alias: Alias;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: (alias: Alias) => void;
  onDelete: (alias: Alias) => void;
}

export const AliasTableRow: React.FC<AliasTableRowProps> = ({
  alias,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
}) => {
  const total = alias.targets.length;
  const active = alias.targets.filter((t) => t.enabled !== false).length;

  return (
    <tr className="hover:bg-surface-elevated">
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
        <ActiveDots total={total} active={active} />
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
              onEdit(alias);
            }}
            className="rounded p-1 text-foreground-muted opacity-60 transition-all hover:bg-surface-elevated hover:text-foreground hover:opacity-100"
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
            className="rounded p-1 text-foreground-muted opacity-60 transition-all hover:bg-danger-subtle hover:text-danger hover:opacity-100"
            aria-label="Delete alias"
          >
            <Trash2 className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </td>
    </tr>
  );
};
