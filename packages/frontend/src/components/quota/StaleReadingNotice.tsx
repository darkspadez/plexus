import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

export const STALE_READING_MESSAGE = 'Showing last successful reading';
const NO_STALE_READING_MESSAGE = 'Latest check failed; no previous readings are available';

export function getStaleReadingMessage(error?: string, hasReading = true): string {
  const message = hasReading ? STALE_READING_MESSAGE : NO_STALE_READING_MESSAGE;
  return error ? `${message} — ${error}` : message;
}

interface StaleReadingNoticeProps {
  error?: string;
  hasReading?: boolean;
  className?: string;
}

export const StaleReadingNotice: React.FC<StaleReadingNoticeProps> = ({
  error,
  hasReading,
  className,
}) => (
  <div
    className={clsx('flex min-w-0 items-start gap-1.5 text-xs text-warning-text', className)}
    title={error}
  >
    <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
    <span className="line-clamp-2 [overflow-wrap:anywhere]">
      {getStaleReadingMessage(error, hasReading)}
    </span>
  </div>
);
