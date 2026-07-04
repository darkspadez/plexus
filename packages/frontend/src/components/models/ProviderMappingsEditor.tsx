/**
 * ProviderMappingsEditor — flat, single-group provider-mapping editor used in
 * the Models per-row inline expand. Matches the old design: a numbered list of
 * rows (drag handle · # · toggle · provider ▾ · → · model ▾ · play · delete)
 * with a full-width dashed "Add mapping" button. Drag-to-reorder via @dnd-kit.
 *
 * Operates on a single target group's `targets` array. The Models page binds
 * this to the alias's first target group and preserves any additional groups.
 */
import React from 'react';
import { GripVertical, Plus, Trash2, Play, Loader2, CheckCircle, XCircle } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Switch } from '../ui/Switch';
import type { AliasTargetGroup, Provider, Model } from '../../lib/api';

type Target = AliasTargetGroup['targets'][number];

interface TestState {
  loading?: boolean;
  result?: 'success' | 'error';
  showResult?: boolean;
}

interface ProviderMappingsEditorProps {
  aliasId: string;
  targets: Target[];
  providers: Provider[];
  availableModels: Model[];
  testStates: Record<string, TestState | undefined>;
  onChange: (targets: Target[]) => void;
  onTest: (index: number, provider: string, model: string) => void;
}

const SELECT_CLS =
  'h-9 rounded-md border border-border bg-surface-sunken px-2.5 text-xs text-foreground outline-none transition-colors focus:border-accent disabled:opacity-50';

const MappingRow: React.FC<{
  rowId: string;
  index: number;
  target: Target;
  providers: Provider[];
  availableModels: Model[];
  testState?: TestState;
  onChange: (patch: Partial<Target>) => void;
  onTest: () => void;
  onDelete: () => void;
}> = ({
  rowId,
  index,
  target,
  providers,
  availableModels,
  testState,
  onChange,
  onTest,
  onDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rowId,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const filteredModels = availableModels.filter((m) => m.providerId === target.provider);
  const canTest = target.enabled !== false && !!target.provider && !!target.model;

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-md py-1">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-foreground-muted active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>
      <span className="w-4 shrink-0 text-center font-mono text-[11px] text-foreground-muted">
        {index + 1}
      </span>
      <Switch
        checked={target.enabled !== false}
        onChange={(val) => onChange({ enabled: val })}
        size="sm"
      />
      <select
        className={`${SELECT_CLS} w-40 shrink-0`}
        value={target.provider}
        onChange={(e) => onChange({ provider: e.target.value, model: '' })}
      >
        <option value="">Provider…</option>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <span className="shrink-0 text-foreground-muted">→</span>
      <select
        className={`${SELECT_CLS} min-w-0 flex-1`}
        value={target.model}
        onChange={(e) => onChange({ model: e.target.value })}
        disabled={!target.provider}
      >
        <option value="">Select model…</option>
        {filteredModels.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onTest}
        disabled={!canTest}
        title="Test mapping"
        aria-label="Test mapping"
        className="rounded p-1.5 text-foreground-muted transition-colors hover:bg-success-subtle hover:text-success disabled:opacity-40"
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
        title="Delete mapping"
        aria-label="Delete mapping"
        className="rounded p-1.5 text-foreground-muted transition-colors hover:bg-danger-subtle hover:text-danger"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};

export const ProviderMappingsEditor: React.FC<ProviderMappingsEditorProps> = ({
  aliasId,
  targets,
  providers,
  availableModels,
  testStates,
  onChange,
  onTest,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const ids = targets.map((_, i) => `${aliasId}::${i}`);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(targets, from, to));
  };

  const update = (index: number, patch: Partial<Target>) =>
    onChange(targets.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  const remove = (index: number) => onChange(targets.filter((_, i) => i !== index));
  const addBlank = () => onChange([...targets, { provider: '', model: '', enabled: true }]);

  return (
    <div className="flex flex-col gap-1.5">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-0.5">
            {targets.map((target, i) => (
              <MappingRow
                key={ids[i]}
                rowId={ids[i]}
                index={i}
                target={target}
                providers={providers}
                availableModels={availableModels}
                testState={testStates[`${aliasId}-0-${i}`]}
                onChange={(patch) => update(i, patch)}
                onTest={() => onTest(i, target.provider, target.model)}
                onDelete={() => remove(i)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={addBlank}
        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs text-foreground-muted transition-colors hover:border-accent hover:text-foreground"
      >
        <Plus size={14} />
        Add mapping
      </button>
    </div>
  );
};
