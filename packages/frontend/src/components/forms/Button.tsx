import React from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
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
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium leading-normal border-0 rounded-md cursor-pointer transition-all duration-fast whitespace-nowrap select-none outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-deep disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0',
        {
          'text-black bg-gradient-to-br from-primary to-secondary shadow-sm hover:-translate-y-0.5 hover:shadow-md':
            variant === 'primary',
          'bg-surface-elevated text-foreground border border-border backdrop-blur-md hover:bg-surface-elevated hover:border-primary':
            variant === 'secondary',
          'bg-transparent text-foreground hover:bg-amber-500/10': variant === 'ghost',
          'bg-danger text-white shadow-md hover:bg-red-700 hover:-translate-y-0.5':
            variant === 'danger',
          'py-1.5 px-3.5 text-xs': size === 'sm',
          'py-2.5 px-5 text-sm': size === 'md',
          'py-3 px-6 text-base': size === 'lg',
          'h-9 w-9 p-0': size === 'icon',
        },
        className
      )}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading && <Loader2 className="animate-spin" size={16} />}
      {!isLoading && leftIcon && <span className="flex items-center">{leftIcon}</span>}
      {children}
    </button>
  );
};
