import React from 'react';
import { clsx } from 'clsx';

type BadgeStatus =
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'error'
  | 'neutral'
  | 'warning'
  | 'success'
  | 'danger'
  | 'info'
  | 'violet'
  | 'cyan';

interface BadgeProps {
  status: BadgeStatus;
  children: React.ReactNode;
  secondaryText?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  style?: React.CSSProperties;
  /** Hide the leading status dot (default shows when secondaryText absent). */
  noDot?: boolean;
}

// Semantic-token-based status classes — work in light + dark + all 6 accents.
// success/connected → success tokens; danger/error → danger tokens;
// info/connecting → info tokens; warning → warning tokens;
// neutral/disconnected → foreground-muted + surface-elevated;
// violet/cyan → still hard-coded hues because no semantic token exists for them,
// but these are stable palette values that don't vary by theme or accent.
const statusClasses: Record<BadgeStatus, string> = {
  connected: 'text-success bg-success-subtle border-success/25',
  success: 'text-success bg-success-subtle border-success/25',
  connecting: 'text-info bg-info-subtle border-info/25',
  info: 'text-info bg-info-subtle border-info/25',
  disconnected: 'text-foreground-muted bg-surface-elevated border-border',
  neutral: 'text-foreground-muted bg-surface-elevated border-border',
  error: 'text-danger bg-danger-subtle border-danger/28',
  danger: 'text-danger bg-danger-subtle border-danger/28',
  warning: 'text-warning bg-warning-subtle border-warning/28',
  violet: 'text-[#7C5CFC] bg-[rgba(124,92,252,0.12)] border-[rgba(124,92,252,0.25)]',
  cyan: 'text-[#0891B2] bg-[rgba(8,145,178,0.12)] border-[rgba(8,145,178,0.25)]',
};

export const Badge: React.FC<BadgeProps> = ({
  status,
  children,
  secondaryText,
  className,
  onClick,
  title,
  style,
  noDot,
}) => {
  return (
    <div
      onClick={onClick}
      title={title}
      style={style}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border whitespace-nowrap tabular-nums',
        secondaryText ? 'px-2.5 py-1 text-[11px]' : 'px-2.5 py-0.5 text-xs font-medium',
        onClick && 'cursor-pointer hover:opacity-80 transition-opacity duration-150',
        statusClasses[status],
        className
      )}
    >
      {!noDot && <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />}
      {secondaryText ? (
        <div className="flex flex-col items-start leading-tight">
          <span className="font-medium">{children}</span>
          <span className="text-[9px] opacity-70 mt-0.5">{secondaryText}</span>
        </div>
      ) : (
        <span className="font-medium">{children}</span>
      )}
    </div>
  );
};
