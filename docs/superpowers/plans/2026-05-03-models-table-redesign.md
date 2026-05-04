# Models Table Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Models page row to be a slim summary that expands inline to reveal an editable Routing Aliases chip group and a drag-reorderable Provider Mappings list, with all inline edits persisting immediately.

**Architecture:** Decompose `AliasTableRow.tsx` (currently mixes summary + targets) into a thin summary row plus a separate `<tr colSpan>` expanded row. Build small focused sub-components (`ActiveDots`, `AliasIdentityCell`, `RoutingAliasesEditor`, `MappingRow`, `MappingsList`, `AliasExpandedRow`). Add one new hook method `handleUpdateAlias(alias)` that wraps `api.saveAlias` with the same optimistic-update pattern already used by `handleToggleTarget` (`hooks/useModels.ts:113`). Use `@dnd-kit/sortable` (already a dependency) instead of HTML5 native DnD for the inline drag.

**Tech Stack:** React 19, shadcn/Radix primitives in `components/ui-v2/`, `@dnd-kit/core` + `@dnd-kit/sortable`, Tailwind v4 with design tokens, `lucide-react` icons. No new dependencies required.

**Behavior summary (from clarifications):**
- No grouping; flat list.
- Drop columns: `Aliases`, `Metadata`, `Targets` (and the Provider column from the mock — it's redundant once mappings are inline).
- Keep columns: `Alias` (now with chevron + inline alias chips), `Type`, `Selector`, `Active` (dots + count), `Actions`.
- Alias chip rendering next to the name: 0 → nothing; 1–2 → render inline; 3+ → render first 2 then a `+N` chip whose tooltip lists the rest.
- Active indicator: filled dots = enabled targets, empty dots = disabled targets, dots left-justified, `X/Y active` text right-justified.
- Multi-row expand (no accordion).
- Expanded view contains: Routing Aliases editor (chips with `×` + `+ Add alias` input), then Provider Mappings (drag-reorderable list, immediate persist; per-row toggle, per-row delete, per-row test/play; inline `+ Add mapping` adds a new blank row at the bottom).
- All inline edits PATCH immediately via `api.saveAlias` with optimistic state.
- Modal Edit (existing) stays untouched and is still used for type, selector, metadata, advanced behaviors etc.

---

## File Plan

**New files** (all under `packages/frontend/src/components/models/`):
- `ActiveDots.tsx` — visual indicator: dots row + count text.
- `AliasIdentityCell.tsx` — renders `alias.id` with the inline-chip + `+N` overflow tooltip pattern; also accepts a chevron toggle button on its left.
- `RoutingAliasesEditor.tsx` — chips (each with `×`) + `+ Add alias` inline input. Pure controlled UI; emits `onChange(aliases: string[])`.
- `MappingRow.tsx` — single mapping row using `useSortable`. Renders drag handle, priority `#`, toggle, provider name, `→`, model id, test button, delete button.
- `MappingsList.tsx` — wraps the rows in `DndContext` + `SortableContext`; renders an inline `+ Add mapping` button that pushes a blank target.
- `AliasExpandedRow.tsx` — composition: a `<tr>` that spans all columns and renders `RoutingAliasesEditor` + `MappingsList`.

**Modified files:**
- `packages/frontend/src/components/models/AliasTableRow.tsx` — replace mixed-content row with new column layout (chevron + identity + chips, type, selector, active dots, actions). Add `isExpanded` and `onToggleExpand` props.
- `packages/frontend/src/pages/Models.tsx` — update `<thead>` columns; track `expandedAliases: Set<string>`; render `<AliasExpandedRow>` after each `<AliasTableRow>` when expanded; wire new handlers.
- `packages/frontend/src/hooks/useModels.ts` — add `handleUpdateAlias(alias: Alias)` (optimistic, calls `api.saveAlias(updated, alias.id)`), expose it from the hook.

**Out of scope (do not change):**
- The existing Edit Modal in `Models.tsx` and its HTML5-DnD targets section — left alone.
- `Providers.tsx` — already has Edit + Delete actions; nothing to do here.
- API surface in `lib/api.ts` — `api.saveAlias` is the persistence path; no schema changes.

---

## Task 0: Baseline + dev server

**Files:** none modified

- [ ] **Step 1: Confirm baseline typecheck passes**

Run: `cd packages/frontend && bun x tsc --noEmit`
Expected: clean (or pre-existing errors — record them now to distinguish from later regressions).

- [ ] **Step 2: Start dev server in background for visual verification**

Run from repo root: `bun run dev` (background)
Expected: backend on `:4000`, frontend bundle rebuilt on file change. Confirm by curling `http://localhost:4000/admin` (or whatever the dev URL is in this repo) and seeing HTML.

- [ ] **Step 3: Open the Models page in Chrome DevTools MCP** (`new_page` → navigate to admin Models route) and capture a screenshot to baseline against.

---

## Task 1: Add `handleUpdateAlias` to useModels

**Files:**
- Modify: `packages/frontend/src/hooks/useModels.ts:113-126` (add new handler beside `handleToggleTarget`); update return object at `:178-202`.

- [ ] **Step 1: Add the handler**

Edit `useModels.ts`. After the `handleToggleTarget` function (ends at line 126), insert:

```ts
  const handleUpdateAlias = async (updated: Alias) => {
    const previous = aliases;
    setAliases((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    try {
      await api.saveAlias(updated, updated.id);
    } catch (e) {
      console.error('Update alias error', e);
      toast.error('Failed to update model: ' + e);
      setAliases(previous);
    }
  };
```

- [ ] **Step 2: Expose it from the hook**

In the `return` block (around line 178), add `handleUpdateAlias,` before `loadData,`.

- [ ] **Step 3: Verify typecheck**

Run: `cd packages/frontend && bun x tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/hooks/useModels.ts
git commit -m "feat(frontend): add handleUpdateAlias to useModels for inline edits"
```

---

## Task 2: ActiveDots component

**Files:**
- Create: `packages/frontend/src/components/models/ActiveDots.tsx`

- [ ] **Step 1: Create the component**

```tsx
// packages/frontend/src/components/models/ActiveDots.tsx
import React from 'react';
import { cn } from '../../lib/cn';

interface ActiveDotsProps {
  total: number;
  active: number;
  className?: string;
}

export const ActiveDots: React.FC<ActiveDotsProps> = ({ total, active, className }) => {
  if (total === 0) {
    return (
      <span className="text-xs text-foreground-subtle">no targets</span>
    );
  }
  return (
    <div
      className={cn(
        'flex w-full items-center justify-between gap-3 text-[11px] text-foreground-muted',
        className,
      )}
    >
      <div className="flex items-center gap-1" aria-label={`${active} of ${total} active`}>
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'inline-block size-1.5 rounded-full',
              i < active ? 'bg-success' : 'bg-border',
            )}
          />
        ))}
      </div>
      <span className="font-medium tabular-nums">
        {active}/{total} active
      </span>
    </div>
  );
};
```

- [ ] **Step 2: Verify typecheck**

Run: `cd packages/frontend && bun x tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/models/ActiveDots.tsx
git commit -m "feat(frontend): add ActiveDots indicator for model rows"
```

---

## Task 3: AliasIdentityCell component

**Files:**
- Create: `packages/frontend/src/components/models/AliasIdentityCell.tsx`

- [ ] **Step 1: Create the component**

```tsx
// packages/frontend/src/components/models/AliasIdentityCell.tsx
import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Pill } from '../chips/Pill';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui-v2/tooltip';

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
                    <Pill size="sm" tone="neutral">+{overflow.length}</Pill>
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
```

- [ ] **Step 2: Verify typecheck**

Run: `cd packages/frontend && bun x tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/models/AliasIdentityCell.tsx
git commit -m "feat(frontend): add AliasIdentityCell with inline alias chips and overflow tooltip"
```

---

## Task 4: RoutingAliasesEditor

**Files:**
- Create: `packages/frontend/src/components/models/RoutingAliasesEditor.tsx`

This is the chip editor used inside the expanded row. Stateless w.r.t. persistence — emits `onChange(next)` and the parent calls `handleUpdateAlias`.

- [ ] **Step 1: Create the component**

```tsx
// packages/frontend/src/components/models/RoutingAliasesEditor.tsx
import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Pill } from '../chips/Pill';
import { Input } from '../ui-v2/input';

interface RoutingAliasesEditorProps {
  aliases: string[];
  onChange: (next: string[]) => void;
}

export const RoutingAliasesEditor: React.FC<RoutingAliasesEditorProps> = ({
  aliases,
  onChange,
}) => {
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const commit = () => {
    const value = draft.trim();
    if (!value) {
      setAdding(false);
      setDraft('');
      return;
    }
    if (aliases.includes(value)) {
      setDraft('');
      setAdding(false);
      return;
    }
    onChange([...aliases, value]);
    setDraft('');
    setAdding(false);
  };

  const remove = (a: string) => {
    onChange(aliases.filter((x) => x !== a));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
        Routing aliases
        <span className="ml-2 font-normal normal-case tracking-normal text-foreground-subtle">
          alternative names clients can call
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {aliases.map((a) => (
          <Pill key={a} size="sm" tone="neutral">
            <span className="font-mono">{a}</span>
            <button
              type="button"
              onClick={() => remove(a)}
              className="ml-1 -mr-1 rounded p-0.5 text-foreground-muted hover:bg-danger-subtle hover:text-danger"
              aria-label={`Remove alias ${a}`}
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </Pill>
        ))}
        {adding ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft('');
                setAdding(false);
              }
            }}
            placeholder="alias name"
            className="h-6 w-40 px-2 py-0 text-xs"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-foreground-muted hover:border-accent hover:text-accent"
          >
            <Plus size={11} strokeWidth={2} />
            Add alias
          </button>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify import path for `Input` exists**

Confirm `packages/frontend/src/components/ui-v2/input.tsx` exists. If not, the path is `../forms/Input` instead. Adjust the import.

Run: `ls packages/frontend/src/components/ui-v2/input.tsx`

- [ ] **Step 3: Verify typecheck**

Run: `cd packages/frontend && bun x tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/models/RoutingAliasesEditor.tsx
git commit -m "feat(frontend): add RoutingAliasesEditor chip editor for alias routing names"
```

---

## Task 5: MappingRow with @dnd-kit/sortable

**Files:**
- Create: `packages/frontend/src/components/models/MappingRow.tsx`

Each mapping row is a sortable item. Uses `useSortable` from `@dnd-kit/sortable`.

- [ ] **Step 1: Create the component**

```tsx
// packages/frontend/src/components/models/MappingRow.tsx
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CheckCircle,
  Clock,
  GripVertical,
  Loader2,
  Play,
  Trash2,
  XCircle,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui-v2/select';
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
  rowId: string; // stable id for dnd-kit (e.g. `${alias.id}::${index}`)
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rowId });

  const provider = providers.find((p) => p.id === target.provider);
  const isProviderDisabled = provider?.enabled === false;
  const isTargetDisabled = target.enabled === false;
  const isDisabled = isProviderDisabled || isTargetDisabled;

  const cooldown = cooldowns.find(
    (c) => c.provider === target.provider && c.model === target.model && !c.accountId,
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
        isDisabled && 'opacity-70',
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
```

- [ ] **Step 2: Verify Select import path**

Confirm `packages/frontend/src/components/ui-v2/select.tsx` exists.

Run: `ls packages/frontend/src/components/ui-v2/select.tsx`
Expected: file exists. (`Models.tsx` already imports `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` — find that line and mirror the path.)

- [ ] **Step 3: Verify typecheck**

Run: `cd packages/frontend && bun x tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/models/MappingRow.tsx
git commit -m "feat(frontend): add MappingRow sortable item with inline provider/model selects"
```

---

## Task 6: MappingsList with DndContext + add button

**Files:**
- Create: `packages/frontend/src/components/models/MappingsList.tsx`

- [ ] **Step 1: Create the component**

```tsx
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
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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
    onChange([...targets, { provider: '', model: '', enabled: true }]);
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
```

- [ ] **Step 2: Verify typecheck**

Run: `cd packages/frontend && bun x tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/models/MappingsList.tsx
git commit -m "feat(frontend): add MappingsList with @dnd-kit sortable + inline add"
```

---

## Task 7: AliasExpandedRow

**Files:**
- Create: `packages/frontend/src/components/models/AliasExpandedRow.tsx`

This is a `<tr>` that spans the table width and contains the routing aliases editor + mappings list. It receives the alias and emits a single `onUpdateAlias(next)` per change.

- [ ] **Step 1: Create the component**

```tsx
// packages/frontend/src/components/models/AliasExpandedRow.tsx
import React from 'react';
import { Alias, Cooldown, Model, Provider } from '../../lib/api';
import { MappingsList } from './MappingsList';
import { RoutingAliasesEditor } from './RoutingAliasesEditor';

interface TestState {
  loading: boolean;
  result?: 'success' | 'error';
  message?: string;
  showResult: boolean;
}

interface AliasExpandedRowProps {
  alias: Alias;
  providers: Provider[];
  availableModels: Model[];
  cooldowns: Cooldown[];
  testStates: Record<string, TestState>;
  columnCount: number;
  onUpdateAlias: (next: Alias) => void;
  onTestTarget: (
    aliasId: string,
    index: number,
    provider: string,
    model: string,
    apiTypes: string[],
  ) => void;
}

export const AliasExpandedRow: React.FC<AliasExpandedRowProps> = ({
  alias,
  providers,
  availableModels,
  cooldowns,
  testStates,
  columnCount,
  onUpdateAlias,
  onTestTarget,
}) => {
  const aliasTestApiTypes = (() => {
    if (alias.type === 'embeddings') return ['embeddings'];
    if (alias.type === 'image') return ['images'];
    if (alias.type === 'responses') return ['responses'];
    return ['chat'];
  })();

  return (
    <tr className="bg-surface-subtle">
      <td colSpan={columnCount} className="border-b border-border px-6 py-4">
        <div className="flex flex-col gap-4">
          <RoutingAliasesEditor
            aliases={alias.aliases ?? []}
            onChange={(next) => onUpdateAlias({ ...alias, aliases: next })}
          />
          <MappingsList
            aliasId={alias.id}
            targets={alias.targets}
            providers={providers}
            availableModels={availableModels}
            cooldowns={cooldowns}
            testStates={testStates}
            onChange={(next) => onUpdateAlias({ ...alias, targets: next })}
            onTest={(index, provider, model) =>
              onTestTarget(alias.id, index, provider, model, aliasTestApiTypes)
            }
          />
        </div>
      </td>
    </tr>
  );
};
```

- [ ] **Step 2: Verify typecheck**

Run: `cd packages/frontend && bun x tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/models/AliasExpandedRow.tsx
git commit -m "feat(frontend): add AliasExpandedRow composing routing aliases + mappings"
```

---

## Task 8: Refactor AliasTableRow to the new layout

**Files:**
- Modify: `packages/frontend/src/components/models/AliasTableRow.tsx` (full rewrite — current file is `1-200`)

The new row has cells: Identity (chevron + id + chips) | Type | Selector | ActiveDots | Actions.

- [ ] **Step 1: Replace AliasTableRow.tsx**

Overwrite the entire file with:

```tsx
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
```

Note: this drops the `providers`, `cooldowns`, `testStates`, `onToggleTarget`, `onTestTarget` props from `AliasTableRow`'s public API. The expanded row will own those concerns. The next task updates `Models.tsx` to match.

- [ ] **Step 2: Verify typecheck — expect failures in Models.tsx**

Run: `cd packages/frontend && bun x tsc --noEmit`
Expected: errors in `packages/frontend/src/pages/Models.tsx` due to changed `AliasTableRow` props. Do NOT commit yet — fix in Task 9.

---

## Task 9: Update Models.tsx — header columns, expand state, render expanded rows

**Files:**
- Modify: `packages/frontend/src/pages/Models.tsx` (specifically the `<thead>` block at lines `1011-1041` and the `<tbody>` block at lines `1042-1056`)

- [ ] **Step 1: Add expanded-row state and pull `handleUpdateAlias` from the hook**

Find the destructure of `useModels()` near the top of the `Models` component (search for `const {` on the same line as `useModels`). Add `handleUpdateAlias,` to the destructured names.

In the same component, add expand state (place this near other `useState` calls):

```ts
const [expandedAliases, setExpandedAliases] = useState<Set<string>>(new Set());

const toggleExpanded = useCallback((id: string) => {
  setExpandedAliases((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}, []);
```

Make sure `useState` and `useCallback` are imported at the top of the file (they already are — `Models.tsx:1` should show `import React, { useState, ... } from 'react'`; verify).

- [ ] **Step 2: Add the import for `AliasExpandedRow`**

At the top of `Models.tsx`, alongside the existing `import { AliasTableRow } from '../components/models/AliasTableRow';` (search for that import), add:

```ts
import { AliasExpandedRow } from '../components/models/AliasExpandedRow';
```

- [ ] **Step 3: Replace the `<thead>` columns**

Find the `<thead>` block (currently lines `1011-1041`). Replace its entire contents with:

```tsx
<thead>
  <tr>
    <th
      className="px-4 py-3 text-left border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider"
      style={{ paddingLeft: '24px' }}
    >
      Alias
    </th>
    <th className="px-4 py-3 text-left border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider">
      Type
    </th>
    <th className="px-4 py-3 text-left border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider">
      Selector
    </th>
    <th className="px-4 py-3 text-left border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider">
      Active
    </th>
    <th
      className="px-4 py-3 border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider"
      style={{ paddingRight: '24px', textAlign: 'right' }}
    >
      Actions
    </th>
  </tr>
</thead>
```

Define a constant near the top of the JSX return for column count (used by the expanded row's colSpan):

```tsx
const COLUMN_COUNT = 5;
```

(Place this above the `<table>` element or as a module constant outside the component — module constant preferred.)

- [ ] **Step 4: Replace the `<tbody>` rendering**

Find the `<tbody>` block (currently lines `1042-1056`). Replace its contents with:

```tsx
<tbody>
  {filteredAliases.map((alias) => {
    const isExpanded = expandedAliases.has(alias.id);
    return (
      <React.Fragment key={alias.id}>
        <AliasTableRow
          alias={alias}
          isExpanded={isExpanded}
          onToggleExpand={() => toggleExpanded(alias.id)}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
        />
        {isExpanded && (
          <AliasExpandedRow
            alias={alias}
            providers={providers}
            availableModels={availableModels}
            cooldowns={cooldowns}
            testStates={testStates}
            columnCount={COLUMN_COUNT}
            onUpdateAlias={handleUpdateAlias}
            onTestTarget={handleTestTarget}
          />
        )}
      </React.Fragment>
    );
  })}
</tbody>
```

Confirm `availableModels` and `handleTestTarget` are already destructured from `useModels()` at the top of the component. They should be — search for them; if missing add to the destructure.

- [ ] **Step 5: Verify typecheck**

Run: `cd packages/frontend && bun x tsc --noEmit`
Expected: clean. If errors mention missing `availableModels` or similar, add them to the `useModels()` destructure.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/models/AliasTableRow.tsx packages/frontend/src/pages/Models.tsx
git commit -m "feat(frontend): redesign Models row to expand inline with mappings + routing aliases"
```

---

## Task 10: Visual verification with Chrome DevTools MCP

**Files:** none modified

- [ ] **Step 1: Navigate to Models page**

Use Chrome DevTools MCP `navigate_page` to the dev URL of the Models page. Capture a screenshot.

- [ ] **Step 2: Verify collapsed-row layout**

Confirm visually:
- Chevron on the left, model id in mono font, alias chips inline (1–2 visible) with `+N` if more.
- Type badge, selector text, active dots (filled green up to enabled count, hollow for the rest), `X/Y active` right-justified.
- Edit and Delete icon buttons in the last cell (no 3-dot menu).
- Aliases / Metadata / Targets columns are gone.

- [ ] **Step 3: Verify expand interaction**

Click the chevron. Expanded panel should slide in below the row showing:
- "Routing aliases" header + chips with `×` + `+ Add alias` button.
- "Provider mappings" header + drag-handle rows with priority `1`, `2`, …, toggle, provider select, `→`, model select, test play, trash.
- `+ Add mapping` dashed button at the bottom.

Click another row's chevron — both stay open (no accordion).

- [ ] **Step 4: Verify drag persists immediately**

Drag a mapping row up. Watch the network tab (`list_network_requests`) — confirm a `PUT/POST` to the alias save endpoint fires immediately, not on a save click.

- [ ] **Step 5: Verify alias chip overflow tooltip**

Find or create a model with 3+ routing aliases. Hover over the `+N` chip. Tooltip should list the overflow alias names in mono font.

- [ ] **Step 6: Verify add/remove routing alias**

In the expanded view, click `+ Add alias`, type a value, press Enter. Chip appears. Network call fires. Click `×` on a chip — chip disappears, network call fires.

- [ ] **Step 7: Verify add/remove mapping**

Click `+ Add mapping` — a blank row with empty Provider/Model selects appears. Pick a provider; the model select unlocks; pick a model. Network call fires after each selection. Trash icon on a row removes it.

- [ ] **Step 8: Verify toggle**

Toggle a mapping's switch. Optimistic state updates instantly; the active dot count updates on the collapsed row when re-collapsed.

- [ ] **Step 9: Capture before/after screenshots**

Use `take_screenshot` for the final state. Store paths in the PR description.

---

## Self-Review Checklist (run before declaring done)

- [ ] **Spec coverage check:**
  - Alias chip rendering: 0/1–2/3+ behavior — covered by `AliasIdentityCell` (Task 3).
  - `+N` overflow with tooltip — covered by `AliasIdentityCell` (Task 3).
  - Routing aliases editable in expanded view, immediate persist — `RoutingAliasesEditor` (Task 4) + `AliasExpandedRow` (Task 7) + `handleUpdateAlias` (Task 1).
  - Provider mappings list with drag-reorder, immediate persist — `MappingsList` (Task 6).
  - Per-mapping toggle / test / delete — `MappingRow` (Task 5).
  - Inline `+ Add mapping` adds blank row — `MappingsList` (Task 6).
  - Active dots indicator (left dots, right text) — `ActiveDots` (Task 2).
  - Edit + Delete in Actions column — preserved in `AliasTableRow` rewrite (Task 8).
  - No grouping, multi-expand — Task 9 expand-state is a `Set` and renders inline regardless.
  - Removed columns Aliases / Metadata / Targets — Task 9 thead/tbody changes.

- [ ] **Type consistency:**
  - `Target` is derived from `Alias['targets'][number]` everywhere — no parallel definition that could drift.
  - `handleUpdateAlias` signature matches what `AliasExpandedRow` expects (`(next: Alias) => void`).
  - `MappingRow`'s `rowId` is `${aliasId}::${index}` and matches the id list `MappingsList` registers with `SortableContext` — both compute it the same way.
  - `columnCount` literal `5` matches the actual `<thead>` column count in Task 9.

- [ ] **No placeholders / TODOs in code.**

- [ ] **No new dependencies added** (verify `package.json` is unchanged).

- [ ] **Typecheck:** `cd packages/frontend && bun x tsc --noEmit` is clean.

- [ ] **Format:** `bun run format` from repo root, commit any formatting changes separately.

---

## Notes & gotchas for the implementer

- **Don't touch the existing Edit Modal** in `Models.tsx` (the one that uses HTML5 native DnD on `editingAlias.targets`, lines ~1062 onward). It still owns full edits (type, selector, metadata, advanced behaviors). Inline editing in this plan is purely additive.
- **`api.saveAlias(updated, alias.id)`** is the persistence path — it's also what the existing `handleToggleTarget` uses (`hooks/useModels.ts:113-126`). The optimistic-update + rollback pattern in `handleUpdateAlias` mirrors that handler intentionally.
- **`@dnd-kit/sortable`** is already a dependency. The existing modal uses HTML5 native DnD; we're not unifying them in this plan to keep scope tight.
- **Tooltip primitive** lives at `components/ui-v2/tooltip.tsx` and exports `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider`. Always wrap with `TooltipProvider` (the component does this locally).
- **Do not add new filter dropdowns** ("All providers" / "Type" / "Status" from the mock). Search + Vision Fall Through + Refresh + Add Model stay as-is (`Models.tsx:927-980`).
- **Disabled mappings stay in the same list** (no "Show N disabled" link). Disabled state is conveyed by switch position and `opacity-70` on the row.
- **Empty dots for disabled targets** (chosen over red) — matches the look of the reference image.
- **Chevron lives inside the first cell**, not a separate column. Keeps `colSpan` math simple (5 cells).
- **Don't write React unit tests** — the frontend has no React testing infra (no jsdom, no testing-library; only `lib/normalize.test.ts` exists, and it's pure logic). Verify visually + typecheck.
- **Per AGENTS.md:** never commit without explicit user request, never use `--no-verify`, no emoji in code, only errors matter (ignore warnings).
