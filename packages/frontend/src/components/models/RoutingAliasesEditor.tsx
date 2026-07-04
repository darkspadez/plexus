import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Pill } from '../chips/Pill';

interface RoutingAliasesEditorProps {
  /** Additional names clients can call (alias.aliases). */
  aliases: string[];
  /** Fired with the next list whenever an alias is added or removed. */
  onChange: (next: string[]) => void;
}

/**
 * RoutingAliasesEditor — inline pill editor for an alias's alternative names.
 * Used in the Models per-row expand editor. Each change calls onChange so the
 * parent can autosave.
 */
export const RoutingAliasesEditor: React.FC<RoutingAliasesEditorProps> = ({
  aliases,
  onChange,
}) => {
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const commit = () => {
    const value = draft.trim();
    setDraft('');
    setAdding(false);
    if (!value || aliases.includes(value)) return;
    onChange([...aliases, value]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground-subtle">
        Routing aliases
        <span className="ml-2 font-normal normal-case text-foreground-subtle">
          alternative names clients can call
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {aliases.map((a) => (
          <Pill key={a} size="sm" tone="neutral">
            <span className="font-mono">{a}</span>
            <button
              type="button"
              onClick={() => onChange(aliases.filter((x) => x !== a))}
              className="ml-0.5 text-foreground-muted hover:text-danger"
              aria-label={`Remove ${a}`}
            >
              <X size={10} />
            </button>
          </Pill>
        ))}
        {adding ? (
          <input
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
            className="h-6 w-32 rounded border border-border bg-surface px-2 font-mono text-xs text-foreground outline-none focus:border-accent"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-foreground-muted transition-colors hover:border-accent hover:text-foreground"
          >
            <Plus size={11} />
            Add alias
          </button>
        )}
      </div>
    </div>
  );
};
