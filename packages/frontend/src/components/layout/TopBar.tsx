import React from 'react';
import { Sun, Moon, Monitor, Palette, Check, LogOut, UserCircle2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useTheme, type ThemeMode } from '../../contexts/ThemeContext';
import { useAccent, ACCENTS, type Accent } from '../../contexts/AccentContext';
import { useAuth } from '../../contexts/AuthContext';
import { Breadcrumbs } from './Breadcrumbs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui-v2/dropdown-menu';
import { Button } from '../ui-v2/button';

const ACCENT_SWATCH: Record<Accent, string> = {
  blue: 'var(--hue-blue-500)',
  green: 'var(--hue-green-500)',
  orange: 'var(--hue-orange-500)',
  violet: 'var(--hue-violet-500)',
  rose: 'var(--hue-rose-500)',
  amber: 'var(--hue-amber-500)',
};

const ThemeButton: React.FC<{
  mode: ThemeMode;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    className={cn(
      'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
      active
        ? 'bg-accent-subtle text-accent'
        : 'text-foreground-muted hover:bg-surface-elevated hover:text-foreground'
    )}
  >
    {icon}
  </button>
);

const ThemeToggle: React.FC = () => {
  const { mode, setMode } = useTheme();
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border p-0.5">
      <ThemeButton
        mode="light"
        active={mode === 'light'}
        onClick={() => setMode('light')}
        icon={<Sun className="size-3.5" strokeWidth={1.75} />}
        label="Light theme"
      />
      <ThemeButton
        mode="dark"
        active={mode === 'dark'}
        onClick={() => setMode('dark')}
        icon={<Moon className="size-3.5" strokeWidth={1.75} />}
        label="Dark theme"
      />
      <ThemeButton
        mode="system"
        active={mode === 'system'}
        onClick={() => setMode('system')}
        icon={<Monitor className="size-3.5" strokeWidth={1.75} />}
        label="Match system"
      />
    </div>
  );
};

const AccentPicker: React.FC = () => {
  const { accent, setAccent } = useAccent();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-foreground-muted hover:text-foreground"
          aria-label="Change accent color"
        >
          <Palette className="size-3.5" strokeWidth={1.75} />
          <span
            aria-hidden
            className="size-3 rounded-full ring-1 ring-border"
            style={{ background: ACCENT_SWATCH[accent] }}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <DropdownMenuLabel className="text-foreground-subtle">Accent</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACCENTS.map((a) => (
          <DropdownMenuItem key={a} onSelect={() => setAccent(a)} className="capitalize">
            <span
              className="size-4 rounded-full ring-1 ring-border"
              style={{ background: ACCENT_SWATCH[a] }}
            />
            <span className="flex-1">{a}</span>
            {accent === a && <Check className="size-3.5" strokeWidth={2} aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const UserMenu: React.FC = () => {
  const { principal, logout } = useAuth();
  const handleLogout = () => {
    logout();
    window.location.href = '/ui/login';
  };
  if (!principal) return null;
  const label = principal.role === 'admin' ? 'Admin' : (principal.keyName ?? 'User');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-2 px-2 text-foreground-muted hover:text-foreground"
        >
          <UserCircle2 className="size-4" strokeWidth={1.75} />
          <span className="text-xs">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <DropdownMenuLabel className="text-foreground-subtle">Signed in</DropdownMenuLabel>
        <div className="px-2 pb-1.5 text-xs text-foreground-muted">
          {label}
          <span className="ml-2 text-[10px] uppercase tracking-wide text-foreground-subtle">
            {principal.role}
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleLogout} className="text-danger">
          <LogOut className="size-3.5" strokeWidth={1.75} />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const TopBar: React.FC = () => {
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur">
      <div className="flex flex-1 items-center">
        <Breadcrumbs />
      </div>
      <div className="flex items-center gap-1.5">
        <AccentPicker />
        <ThemeToggle />
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <UserMenu />
      </div>
    </header>
  );
};
