/**
 * Legacy Button shim — delegates to the shadcn ui-v2 Button while preserving
 * the legacy API (variant primary/secondary/danger/ghost, size sm/md/lg/icon,
 * leftIcon, isLoading) so unmigrated call sites in Models + Providers keep
 * working unchanged. New code should import the shadcn Button from
 * `components/ui-v2/button` directly.
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button as UiButton } from '../ui-v2/button';

type LegacyVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'destructive'
  | 'outline'
  | 'default';
type LegacySize = 'sm' | 'md' | 'lg' | 'icon' | 'default';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: LegacyVariant;
  size?: LegacySize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
}

const variantMap: Record<LegacyVariant, React.ComponentProps<typeof UiButton>['variant']> = {
  primary: 'default',
  secondary: 'outline',
  ghost: 'ghost',
  danger: 'destructive',
  destructive: 'destructive',
  outline: 'outline',
  default: 'default',
};

const sizeMap: Record<LegacySize, React.ComponentProps<typeof UiButton>['size']> = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
  icon: 'icon',
  default: 'default',
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading,
  leftIcon,
  disabled,
  ...rest
}) => (
  <UiButton
    variant={variantMap[variant] ?? 'default'}
    size={sizeMap[size] ?? 'default'}
    disabled={isLoading || disabled}
    {...rest}
  >
    {isLoading ? <Loader2 className="animate-spin" strokeWidth={1.75} /> : leftIcon}
    {children}
  </UiButton>
);
