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
              className="ml-1 -mr-1 cursor-pointer rounded p-0.5 text-foreground-muted hover:bg-danger-subtle hover:text-danger"
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
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-foreground-muted hover:border-accent hover:text-accent"
          >
            <Plus size={11} strokeWidth={2} />
            Add alias
          </button>
        )}
      </div>
    </div>
  );
};
