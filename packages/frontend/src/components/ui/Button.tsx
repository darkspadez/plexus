import React from 'react';
import { cn } from '../../lib/cn';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'soft' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  isLoading,
  leftIcon,
  disabled,
  ...props
}) => {
  return (
    <button
      className={cn(
        // Base — shared across all variants
        'inline-flex items-center justify-center gap-2 font-sans text-sm font-medium',
        'rounded-field whitespace-nowrap select-none cursor-pointer',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:pointer-events-none [&_svg]:shrink-0',
        // Variants — semantic tokens only
        variant === 'primary' && [
          'bg-primary text-primary-foreground',
          'hover:bg-primary/90',
          'border-(length:--theme-border-width) border-transparent',
        ],
        variant === 'secondary' && [
          'bg-secondary text-secondary-foreground',
          'hover:bg-secondary/90',
          'border-(length:--theme-border-width) border-transparent',
        ],
        variant === 'outline' && [
          'bg-surface-elevated text-foreground',
          'border-(length:--theme-border-width) border-border-strong',
          'hover:bg-surface-hover',
        ],
        variant === 'soft' && [
          'bg-primary/10 text-primary-text',
          'border-(length:--theme-border-width) border-primary/40',
          'hover:bg-primary/20 hover:border-primary/60',
        ],
        variant === 'ghost' && [
          'bg-transparent text-foreground-muted',
          'border-(length:--theme-border-width) border-transparent',
          'hover:bg-surface-elevated hover:text-foreground',
        ],
        variant === 'danger' && [
          'bg-danger-subtle text-danger-text',
          'border-(length:--theme-border-width) border-danger/30',
          'hover:bg-danger/20',
        ],
        // Sizes — sm ~28px, md ~32px, lg ~40px, icon square
        size === 'sm' && 'h-7 px-2.5 py-1 text-xs gap-1.5',
        size === 'md' && 'h-8 px-3.5 py-1.5 text-sm gap-1.5',
        size === 'lg' && 'h-10 px-4 py-2 text-sm',
        size === 'icon' && 'h-8 w-8 p-0',
        className
      )}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading && <Loader2 className="animate-spin" size={14} />}
      {!isLoading && leftIcon && <span className="flex items-center">{leftIcon}</span>}
      {children}
    </button>
  );
};
