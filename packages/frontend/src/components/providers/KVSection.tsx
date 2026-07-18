import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { DebouncedInput } from '../ui/DebouncedInput';
import { Badge } from '../ui/Badge';
import { SectionCard } from '../ui/SectionCard';

export const KV_REMOVE_BUTTON_CLASS =
  'inline-flex items-center justify-center h-8 w-8 flex-shrink-0 rounded-md text-foreground-muted hover:text-danger hover:bg-danger-subtle transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background self-end sm:self-auto';

/** Quiet header text used instead of a zero-count badge. */
export function NotConfigured() {
  return <span className="font-sans text-[11px] italic text-foreground-muted">Not configured</span>;
}

// Custom Headers / Extra Body Fields — same addKV/updateKV/removeKV semantics (including
// the '': '' insert on add), restyled to mirror ui/KeyValueEditor's visual only.
export function KVSection({
  title,
  field,
  entries,
  isOpen,
  setIsOpen,
  addKV,
  updateKV,
  removeKV,
  emptyText,
  keyPlaceholder,
}: {
  title: string;
  field: 'headers' | 'extraBody';
  entries: Record<string, unknown> | undefined;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  addKV: (field: 'headers' | 'extraBody') => void;
  updateKV: (field: 'headers' | 'extraBody', oldKey: string, newKey: string, value: any) => void;
  removeKV: (field: 'headers' | 'extraBody', key: string) => void;
  emptyText: string;
  keyPlaceholder: string;
}) {
  const entryList = Object.entries(entries || {});
  return (
    <SectionCard
      size="sm"
      title={title}
      collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      extra={
        <>
          {entryList.length > 0 ? (
            <Badge status="neutral" noDot>
              {entryList.length}
            </Badge>
          ) : (
            <NotConfigured />
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              addKV(field);
              setIsOpen(true);
            }}
          >
            <Plus size={14} />
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {entryList.length === 0 && (
          <div className="font-sans text-[11px] italic text-foreground-muted">{emptyText}</div>
        )}
        {entryList.map(([key, val], idx) => (
          <div key={idx} className="flex flex-col gap-1.5 sm:flex-row">
            <div className="min-w-0 flex-1">
              <DebouncedInput
                placeholder={keyPlaceholder}
                value={key}
                onChange={(newKey: string) => updateKV(field, key, newKey, val)}
              />
            </div>
            <div className="min-w-0 flex-1">
              <DebouncedInput
                placeholder="Value"
                value={typeof val === 'object' ? JSON.stringify(val) : (val as string)}
                onChange={(v: string) => {
                  try {
                    updateKV(field, key, key, JSON.parse(v));
                  } catch {
                    updateKV(field, key, key, v);
                  }
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => removeKV(field, key)}
              aria-label={`Remove ${key}`}
              className={KV_REMOVE_BUTTON_CLASS}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
