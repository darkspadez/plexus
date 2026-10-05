import React from 'react';
import { cn } from '../../lib/cn';

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
  | 'secondary'
  | 'accent';

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

// Semantic-token-based status classes - they follow the active theme.
// success/connected -> success; danger/error -> danger; info/connecting -> info;
// warning -> warning; secondary/accent -> those theme roles;
// neutral/disconnected -> foreground-muted + surface-elevated.
const statusClasses: Record<BadgeStatus, string> = {
  connected: 'text-success-text bg-success-subtle border-success/25',
  success: 'text-success-text bg-success-subtle border-success/25',
  connecting: 'text-info-text bg-info-subtle border-info/25',
  info: 'text-info-text bg-info-subtle border-info/25',
  disconnected: 'text-foreground-muted bg-surface-elevated border-border',
  neutral: 'text-foreground-muted bg-surface-elevated border-border',
  error: 'text-danger-text bg-danger-subtle border-danger/28',
  danger: 'text-danger-text bg-danger-subtle border-danger/28',
  warning: 'text-warning-text bg-warning-subtle border-warning/28',
  secondary: 'text-secondary-text bg-secondary-subtle border-secondary/25',
  accent: 'text-accent-text bg-accent-subtle border-accent/25',
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
      className={cn(
        'inline-flex items-center gap-1.5 rounded-selector border-(length:--theme-border-width) whitespace-nowrap tabular-nums',
        secondaryText ? 'px-2.5 py-1 text-label' : 'px-2.5 py-0.5 font-medium text-xs',
        onClick && 'cursor-pointer hover:opacity-80 transition-opacity duration-150',
        statusClasses[status],
        className
      )}
    >
      {!noDot && <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />}
      {secondaryText ? (
        <div className="flex flex-col items-start leading-tight">
          <span className="font-medium">{children}</span>
          <span className="text-3xs opacity-70 mt-0.5">{secondaryText}</span>
        </div>
      ) : (
        <span className="font-medium">{children}</span>
      )}
    </div>
  );
};
