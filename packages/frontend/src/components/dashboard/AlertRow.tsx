import React from 'react';
import { cn } from '../../lib/cn';
import { joinAlertMeta } from './alert-rows';

type AlertTone = 'warning' | 'danger';

const TONE_CLASSES: Record<AlertTone, { tint: string; icon: string }> = {
  warning: { tint: 'bg-warning-subtle', icon: 'text-warning-text' },
  danger: { tint: 'bg-danger-subtle', icon: 'text-danger-text' },
};

interface AlertRowProps {
  /** Sets the row tint and the icon colour. */
  tone: AlertTone;
  icon: React.ReactNode;
  title: string;
  /** Right-aligned value (countdown, error rate), centred against both lines. */
  right: React.ReactNode;
  /** Optional control after `right`, inside the tint. */
  action?: React.ReactNode;
  /** Facts for the second line; falsy parts are dropped, the rest joined with " · ". */
  meta: readonly (string | null | undefined)[];
  /** Hover text for the facts line; defaults to its full (untruncated) text. */
  metaTitle?: string;
}

/**
 * Two-line alert row shared by `ServiceAlertsCard` and `ErrorsByProviderCard`:
 * title on line 1, a muted, truncated facts line aligned under it on line 2,
 * and the leading icon and the right-aligned value and action centred against
 * both lines.
 */
export const AlertRow: React.FC<AlertRowProps> = ({
  tone,
  icon,
  title,
  right,
  action,
  meta,
  metaTitle,
}) => {
  const metaText = joinAlertMeta(meta);
  const toneClasses = TONE_CLASSES[tone];

  return (
    <div
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-md px-3 py-2',
        toneClasses.tint
      )}
    >
      {/* The icon and the right slot span the facts line too, so the grid's
          items-center centres them on the two-line block rather than on the title. */}
      <span className={cn('flex shrink-0', toneClasses.icon, metaText && 'row-span-2')}>
        {icon}
      </span>
      <span className="truncate text-sm font-medium text-foreground" title={title}>
        {title}
      </span>
      <div className={cn('flex items-center gap-2', metaText && 'row-span-2')}>
        {right}
        {action}
      </div>
      {metaText && (
        <p
          className="col-start-2 m-0 truncate text-xs text-foreground-muted"
          title={metaTitle ?? metaText}
        >
          {metaText}
        </p>
      )}
    </div>
  );
};
