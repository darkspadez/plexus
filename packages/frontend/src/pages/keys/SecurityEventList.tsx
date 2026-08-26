import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { KeySecurityEvent } from '../../lib/api/keySecurity';

interface SecurityEventListProps {
  readonly events: readonly KeySecurityEvent[];
  readonly offset: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
  readonly isLoading: boolean;
  readonly onPage: (offset: number) => void;
}

const eventLabel = (kind: string): string =>
  kind
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const evidenceText = (event: KeySecurityEvent): string | null => {
  if (!event.evidence) return null;
  const entries = Object.entries(event.evidence);
  if (entries.length === 0) return null;
  return entries
    .map(([name, value]) => `${name}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' · ');
};

export const SecurityEventList = ({
  events,
  offset,
  pageSize,
  hasMore,
  isLoading,
  onPage,
}: SecurityEventListProps) => (
  <section aria-labelledby="security-history-heading" className="flex flex-col gap-3">
    <h3 id="security-history-heading" className="font-heading text-sm font-semibold text-text">
      Security history
    </h3>
    {isLoading ? (
      <p className="text-xs text-text-muted">Loading security history…</p>
    ) : events.length === 0 ? (
      <p className="rounded-md border border-border-glass bg-bg-subtle p-3 text-xs text-text-muted">
        No security events recorded for this key.
      </p>
    ) : (
      <ol className="flex flex-col gap-2">
        {events.map((event) => {
          const evidence = evidenceText(event);
          return (
            <li key={event.id} className="rounded-md border border-border-glass bg-bg-subtle p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-text">
                  {eventLabel(event.eventKind)}
                </span>
                <time className="text-[11px] text-text-muted">
                  {new Date(event.createdAt).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                Source: {event.source}
                {event.actor ? ` · Actor: ${event.actor}` : ''}
              </p>
              {event.reason && <p className="mt-1 text-xs text-text-secondary">{event.reason}</p>}
              {evidence && (
                <p className="mt-1 break-words text-[11px] text-text-muted">{evidence}</p>
              )}
            </li>
          );
        })}
      </ol>
    )}
    <div className="flex items-center justify-between gap-3">
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<ChevronLeft size={14} />}
        disabled={offset === 0 || isLoading}
        onClick={() => onPage(Math.max(0, offset - pageSize))}
      >
        Previous
      </Button>
      <span className="text-[11px] text-text-muted">Page {Math.floor(offset / pageSize) + 1}</span>
      <Button
        variant="ghost"
        size="sm"
        disabled={!hasMore || isLoading}
        onClick={() => onPage(offset + pageSize)}
      >
        Next <ChevronRight size={14} />
      </Button>
    </div>
  </section>
);
