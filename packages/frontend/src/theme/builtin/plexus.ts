import type { ThemeDef } from '@plexus/shared';

const SHARED = {
  radius: { box: '0.75rem', field: '0.5rem', selector: '2rem' },
  border: '1px',
  depth: 1,
} as const;

// Today's look. Deliberately no foreground-subtle / *-foreground / *-subtle / *-text
// overrides: the previous values fail the contrast floors, so the compiler derives them.
export const PLEXUS_LIGHT: ThemeDef = {
  id: 'plexus-light',
  name: 'Plexus Light',
  colorScheme: 'light',
  colors: {
    'base-100': '#FFFFFF',
    'base-200': '#F6F4EE',
    'base-300': '#EFEDE5',
    'base-content': '#1A1815',
    primary: '#D97706',
    'primary-content': '#09090B',
    'secondary-content': '#FFFFFF',
    secondary: '#7857FC',
    accent: '#0891B2',
    neutral: '#3F3F46',
    'neutral-content': '#FAFAFA',
    info: '#2563EB',
    success: '#16A34A',
    warning: '#D97706',
    error: '#DC2626',
  },
  ...SHARED,
  overrides: {
    background: '#F6F4EE',
    surface: '#FFFFFF',
    'surface-elevated': '#FAF8F2',
    'surface-hover': '#ECE8DD',
    'surface-sunken': '#EFEDE5',
    border: '#E5E1D6',
    'border-strong': '#C9C2B0',
    foreground: '#1A1815',
    'foreground-muted': '#6B6557',
    critical: '#EA580C',
  },
};

export const PLEXUS_DARK: ThemeDef = {
  id: 'plexus-dark',
  name: 'Plexus Dark',
  colorScheme: 'dark',
  colors: {
    'base-100': '#16181D',
    'base-200': '#0A0B0E',
    'base-300': '#06070A',
    'base-content': '#E8EAED',
    primary: '#D97706',
    'primary-content': '#09090B',
    'secondary-content': '#FFFFFF',
    secondary: '#7857FC',
    accent: '#0891B2',
    neutral: '#27272A',
    'neutral-content': '#F4F4F5',
    info: '#3B82F6',
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
  },
  ...SHARED,
  overrides: {
    background: '#0A0B0E',
    surface: '#16181D',
    'surface-elevated': '#1F2127',
    'surface-hover': '#2C2F37',
    'surface-sunken': '#06070A',
    border: '#22252C',
    'border-strong': '#3A3E47',
    foreground: '#E8EAED',
    'foreground-muted': '#9DA1AA',
    critical: '#EA580C',
  },
};
