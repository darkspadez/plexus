// packages/frontend/src/components/models/MappingRow.tsx
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckCircle, Clock, GripVertical, Loader2, Play, Trash2, XCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui-v2/select';
import { Switch } from '../ui-v2/switch';
import { Alias, Cooldown, Model, Provider } from '../../lib/api';

type Target = Alias['targets'][number];

interface TestState {
  loading: boolean;
  result?: 'success' | 'error';
  message?: string;
  showResult: boolean;
}

interface MappingRowProps {
  rowId: string;
  index: number;
  target: Target;
  providers: Provider[];
  availableModels: Model[];
  cooldowns: Cooldown[];
  testState?: TestState;
  onToggle: (enabled: boolean) => void;
  onChangeProvider: (provider: string) => void;
  onChangeModel: (model: string) => void;
  onTest: () => void;
  onDelete: () => void;
}

export const MappingRow: React.FC<MappingRowProps> = ({
  rowId,
  index,
  target,
  providers,
  availableModels,
  cooldowns,
  testState,
  onToggle,
  onChangeProvider,
  onChangeModel,
  onTest,
  onDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rowId,
  });

  const provider = providers.find((p) => p.id === target.provider);
  const isProviderDisabled = provider?.enabled === false;
  const isTargetDisabled = target.enabled === false;
  const isDisabled = isProviderDisabled || isTargetDisabled;

  const cooldown = cooldowns.find(
    (c) => c.provider === target.provider && c.model === target.model && !c.accountId
  );
  const cooldownMinutes = cooldown ? Math.ceil(cooldown.timeRemainingMs / 60000) : 0;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const filteredModels = availableModels.filter((m) => m.providerId === target.provider);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-xs',
        isDisabled && 'opacity-70'
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-foreground-muted active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>
      <span className="w-4 text-center font-mono text-[11px] text-foreground-muted tabular-nums">
        {index + 1}
      </span>
      <Switch
        checked={target.enabled !== false}
        onCheckedChange={onToggle}
        disabled={isProviderDisabled}
        className="scale-75"
      />
      <div className="w-32 shrink-0">
        <Select value={target.provider || undefined} onValueChange={onChangeProvider}>
          <SelectTrigger size="sm">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="text-foreground-muted">→</span>
      <div className="flex-1 min-w-0">
        <Select
          value={target.model || undefined}
          onValueChange={onChangeModel}
          disabled={!target.provider}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Select model…" />
          </SelectTrigger>
          <SelectContent>
            {filteredModels.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {cooldown && (
        <div
          className="flex items-center gap-1 text-[11px] font-medium text-warning"
          title={`On cooldown for ${cooldownMinutes}m`}
        >
          <Clock size={12} strokeWidth={1.75} />
          <span>{cooldownMinutes}m</span>
        </div>
      )}
      <button
        type="button"
        onClick={onTest}
        disabled={isDisabled || !target.provider || !target.model}
        className="rounded p-1 text-foreground-muted hover:bg-surface hover:text-accent disabled:opacity-40"
        aria-label="Test mapping"
        title={testState?.message || 'Test'}
      >
        {testState?.loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : testState?.showResult && testState.result === 'success' ? (
          <CheckCircle size={14} className="text-success" />
        ) : testState?.showResult && testState.result === 'error' ? (
          <XCircle size={14} className="text-danger" />
        ) : (
          <Play size={14} />
        )}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded p-1 text-foreground-muted hover:bg-danger-subtle hover:text-danger"
        aria-label="Delete mapping"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};
