import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useTheme, type ThemeMode } from '../../contexts/ThemeContext';
import { useAccent, ACCENTS, type Accent } from '../../contexts/AccentContext';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui-v2/card';

const ACCENT_HEX: Record<Accent, string> = {
  blue: '#2563EB',
  green: '#16A34A',
  orange: '#EA580C',
  violet: '#7C5CFC',
  rose: '#D6638F',
  amber: '#D97706',
};

const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) => (
  <div
    role="radiogroup"
    aria-label={label}
    className="inline-flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5"
  >
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        role="radio"
        aria-checked={value === opt.value}
        onClick={() => onChange(opt.value)}
        className={cn(
          'inline-flex h-7 items-center rounded px-3 text-xs font-medium transition-colors',
          value === opt.value
            ? 'bg-accent-subtle text-accent'
            : 'text-foreground-muted hover:bg-surface-elevated hover:text-foreground'
        )}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

export const ThemeSection: React.FC = () => {
  const { mode, setMode } = useTheme();
  const { accent, setAccent } = useAccent();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>
          Personalize the appearance of the admin console. Changes save automatically and apply to
          this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">Mode</div>
            <div className="text-xs text-foreground-muted">
              Light, dark, or follow your operating-system preference.
            </div>
          </div>
          <SegmentedControl<ThemeMode>
            label="Theme mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">Accent</div>
            <div className="text-xs text-foreground-muted">
              Used for primary actions, the active nav item, and the first chart series.
            </div>
          </div>
          <div role="radiogroup" aria-label="Accent" className="flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={accent === a}
                aria-label={a}
                onClick={() => setAccent(a)}
                className={cn(
                  'relative grid size-6 place-items-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  accent === a && 'ring-2 ring-offset-2 ring-offset-surface'
                )}
                style={{
                  background: ACCENT_HEX[a],
                  ['--tw-ring-color' as string]: ACCENT_HEX[a],
                }}
              >
                {accent === a && (
                  <Check className="size-3.5 text-white" strokeWidth={3} aria-hidden />
                )}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
