// packages/frontend/src/components/models/MappingsList.tsx
import React from 'react';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { Alias, Cooldown, Model, Provider } from '../../lib/api';
import { MappingRow } from './MappingRow';

type Target = Alias['targets'][number];

interface TestState {
  loading: boolean;
  result?: 'success' | 'error';
  message?: string;
  showResult: boolean;
}

interface MappingsListProps {
  aliasId: string;
  targets: Target[];
  providers: Provider[];
  availableModels: Model[];
  cooldowns: Cooldown[];
  testStates: Record<string, TestState>;
  onChange: (next: Target[]) => void;
  onTest: (index: number, provider: string, model: string) => void;
}

export const MappingsList: React.FC<MappingsListProps> = ({
  aliasId,
  targets,
  providers,
  availableModels,
  cooldowns,
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

  const update = (index: number, patch: Partial<Target>) => {
    onChange(targets.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const remove = (index: number) => {
    onChange(targets.filter((_, i) => i !== index));
  };

  const addBlank = () => {
    onChange([...targets, { provider: '', model: '', enabled: false }]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
        Provider mappings
        <span className="ml-2 font-normal normal-case tracking-normal text-foreground-subtle">
          upstream model ID per provider
        </span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1.5">
            {targets.map((target, i) => (
              <MappingRow
                key={ids[i]}
                rowId={ids[i]}
                index={i}
                target={target}
                providers={providers}
                availableModels={availableModels}
                cooldowns={cooldowns}
                testState={testStates[`${aliasId}-${i}`]}
                onToggle={(enabled) => update(i, { enabled })}
                onChangeProvider={(provider) => update(i, { provider, model: '' })}
                onChangeModel={(model) => update(i, { model })}
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
        className="inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-border py-2 text-[12px] font-medium text-foreground-muted transition-colors hover:border-accent hover:text-accent"
      >
        <Plus size={13} strokeWidth={2} />
        Add mapping
      </button>
    </div>
  );
};
