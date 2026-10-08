import React from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Switch } from '../ui/Switch';
import { Badge } from '../ui/Badge';
import { Pill, type PillTone } from '../chips/Pill';
import { DRAFT_SCOPE_ID, type CompiledDraft } from './useThemeDraft';

const PILL_TONES: PillTone[] = [
  'neutral',
  'primary',
  'secondary',
  'accent',
  'success',
  'warning',
  'danger',
  'info',
];
const BAR_HEIGHTS = [72, 48, 90, 36, 60];

const noop = () => {};

/**
 * Live sample of the draft. The compiled CSS targets `[data-theme=DRAFT_SCOPE_ID]`,
 * so the wrapper (and only the wrapper) renders in the draft theme.
 */
export const ThemePreview: React.FC<{ compiled: CompiledDraft }> = ({ compiled }) => {
  if (!compiled.ok) {
    return (
      <div className="rounded-box border border-border bg-surface-sunken p-4 text-sm text-foreground-muted">
        Fix the highlighted colors to see the preview
      </div>
    );
  }

  return (
    <div
      data-theme={DRAFT_SCOPE_ID}
      aria-label="Theme preview"
      role="group"
      className="bg-background text-foreground rounded-box border-(length:--theme-border-width) border-border p-4 flex flex-col gap-3"
    >
      <style>{compiled.css}</style>

      <Card dense>
        <h4 className="m-0 mb-1 font-sans text-base font-medium text-foreground">Sample card</h4>
        <p className="m-0 text-sm text-foreground-muted">Muted text explains what a card is for.</p>
        <p className="m-0 mt-1 text-xs text-foreground-subtle">
          Subtle text for hints and metadata.{' '}
          <span className="text-accent-text underline">Accent link</span>
        </p>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm">
          Primary
        </Button>
        <Button variant="secondary" size="sm">
          Secondary
        </Button>
        <Button variant="soft" size="sm">
          Soft
        </Button>
        <Button variant="outline" size="sm">
          Outline
        </Button>
        <Button variant="ghost" size="sm">
          Ghost
        </Button>
        <Button variant="danger" size="sm">
          Danger
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Plain input" aria-label="Sample input" readOnly />
        <input
          readOnly
          aria-label="Sample focused input"
          defaultValue="Focused input"
          className="w-full h-8 px-3 py-1.5 font-sans text-sm text-foreground bg-background border-(length:--theme-border-width) border-border rounded-field outline-none ring-2 ring-focus ring-offset-2 ring-offset-background"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Switch checked onChange={noop} aria-label="Sample switch" />
        <input type="checkbox" checked readOnly aria-label="Sample checkbox" />
        <input type="radio" checked readOnly aria-label="Sample radio" />
        <span className="rounded-field bg-neutral px-2 py-1 text-xs text-neutral-foreground">
          Tooltip
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PILL_TONES.map((tone) => (
          <Pill key={tone} tone={tone}>
            {tone}
          </Pill>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge status="success">Success</Badge>
        <Badge status="warning">Warning</Badge>
        <Badge status="danger">Danger</Badge>
        <Badge status="info">Info</Badge>
      </div>

      <div
        className="flex h-24 items-end justify-around gap-2 rounded-field border border-border bg-surface p-2"
        aria-hidden="true"
      >
        {BAR_HEIGHTS.map((h, i) => (
          <div
            key={i}
            className="w-6 rounded-t-sm"
            style={{ height: `${h}%`, background: `var(--chart-${i + 1})` }}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-box border border-border bg-surface text-sm">
        <div className="grid grid-cols-3 bg-surface-sunken px-3 py-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
          <span>Model</span>
          <span>Requests</span>
          <span>Status</span>
        </div>
        <div className="grid grid-cols-3 items-center border-t border-border px-3 py-2">
          <span>gpt-4o</span>
          <span className="tabular-nums text-foreground-muted">1,204</span>
          <Pill tone="success" size="sm">
            ok
          </Pill>
        </div>
        <div className="grid grid-cols-3 items-center border-t border-border px-3 py-2">
          <span>claude-sonnet</span>
          <span className="tabular-nums text-foreground-muted">872</span>
          <Pill tone="warning" size="sm">
            slow
          </Pill>
        </div>
      </div>
    </div>
  );
};
