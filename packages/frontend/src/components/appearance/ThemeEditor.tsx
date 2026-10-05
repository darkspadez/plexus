import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CustomThemeDef, ThemeColorKey } from '@plexus/shared';
import { cn } from '../../lib/cn';
import { parseColor, toHex } from '../../theme/color';
import {
  BORDER_PRESETS,
  MAX_THEME_NAME,
  RADIUS_PRESETS,
  withCurrentOption,
  derivedContentVar,
  type ContentColorKey,
} from '../../theme/editor';
import { Input } from '../ui/Input';
import { Switch } from '../ui/Switch';
import { Tabs } from '../ui/Tabs';
import { ThemePreview } from './ThemePreview';
import type { ThemeDraft } from './useThemeDraft';

interface ColorSpec {
  key: ThemeColorKey;
  label: string;
}

const COLOR_GROUPS: { title: string; rows: ColorSpec[] }[] = [
  {
    title: 'Base',
    rows: [
      { key: 'base-100', label: 'Base 100 (page cards)' },
      { key: 'base-200', label: 'Base 200 (page background)' },
      { key: 'base-300', label: 'Base 300 (sunken areas)' },
      { key: 'base-content', label: 'Base text' },
    ],
  },
  {
    title: 'Brand',
    rows: [
      { key: 'primary', label: 'Primary' },
      { key: 'primary-content', label: 'Primary text on primary' },
      { key: 'secondary', label: 'Secondary' },
      { key: 'secondary-content', label: 'Secondary text on secondary' },
      { key: 'accent', label: 'Accent (links, focus ring)' },
      { key: 'accent-content', label: 'Accent text on accent' },
      { key: 'neutral', label: 'Neutral (tooltips)' },
      { key: 'neutral-content', label: 'Neutral text on neutral' },
    ],
  },
  {
    title: 'Status',
    rows: [
      { key: 'info', label: 'Info' },
      { key: 'info-content', label: 'Info text on info' },
      { key: 'success', label: 'Success' },
      { key: 'success-content', label: 'Success text on success' },
      { key: 'warning', label: 'Warning' },
      { key: 'warning-content', label: 'Warning text on warning' },
      { key: 'error', label: 'Error' },
      { key: 'error-content', label: 'Error text on error' },
    ],
  },
];

const isContentKey = (key: ThemeColorKey): key is ContentColorKey =>
  key.endsWith('-content') && key !== 'base-content';

function pickerValue(css: string | undefined): string {
  if (!css) return '#000000';
  try {
    return toHex(parseColor(css));
  } catch {
    return '#000000';
  }
}

interface SegmentedProps<V extends string> {
  label: string;
  value: V;
  options: readonly V[];
  onChange: (v: V) => void;
  /** The value the editor opened with; offered as "Current (value)" when it is not a preset. */
  initial?: string;
}

/** A row of toggle buttons; the one matching `value` is pressed. */
function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
  initial,
}: SegmentedProps<V>) {
  const items =
    initial !== undefined
      ? withCurrentOption(options, initial)
      : options.map((o) => ({ value: o, label: o }));
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={item.value === value}
          onClick={() => onChange(item.value as V)}
          className={cn(
            'h-7 rounded-field border-(length:--theme-border-width) px-2.5 text-xs font-medium tabular-nums transition-colors duration-150 cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            item.value === value
              ? 'border-primary bg-primary-subtle text-primary-text'
              : 'border-border text-foreground-muted hover:bg-surface-elevated hover:text-foreground'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

interface ColorRowProps {
  spec: ColorSpec;
  state: ThemeDraft;
}

const ColorRow: React.FC<ColorRowProps> = ({ spec, state }) => {
  const { key, label } = spec;
  const { draft, setColor, setColorText, setContentAuto, textFor, errors, compiled } = state;
  const content = isContentKey(key);
  const auto = content && draft.colors[key] === undefined;
  const derivedVar = content ? derivedContentVar(key) : undefined;
  const derived = compiled.ok && derivedVar ? compiled.vars[derivedVar] : undefined;
  const error = errors[key];
  const id = `theme-color-${key}`;

  return (
    <div className="flex flex-col gap-1">
      {auto ? (
        <span className="text-xs text-foreground-muted">{label}</span>
      ) : (
        <label htmlFor={id} className="text-xs text-foreground-muted">
          {label}
        </label>
      )}
      <div className="flex items-start gap-2">
        {auto ? (
          <>
            <span
              role="img"
              aria-label={`${label} (derived)`}
              className="size-8 flex-shrink-0 rounded-field border border-border"
              style={{ background: derived ?? 'transparent' }}
            />
            <span className="flex h-8 min-w-0 flex-1 items-center truncate font-mono text-xs text-foreground-subtle">
              {derived ?? 'derived'}
            </span>
          </>
        ) : (
          <>
            <input
              type="color"
              aria-label={`${label} color picker`}
              value={pickerValue(draft.colors[key])}
              onChange={(e) => setColor(key, e.target.value)}
              className="size-8 flex-shrink-0 cursor-pointer rounded-field border border-border bg-transparent p-0.5"
            />
            <div className="min-w-0 flex-1">
              <Input
                id={id}
                value={textFor(key)}
                error={error}
                onChange={(e) => setColorText(key, e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          </>
        )}
        {content && (
          <label className="flex h-8 flex-shrink-0 cursor-pointer items-center gap-1.5 text-xs text-foreground-muted">
            <input
              type="checkbox"
              aria-label={`Auto ${label}`}
              checked={auto}
              onChange={(e) => setContentAuto(key, e.target.checked, pickerValue(derived))}
            />
            Auto
          </label>
        )}
      </div>
    </div>
  );
};

interface ThemeEditorProps {
  state: ThemeDraft;
  /** Muted note about the seed source (e.g. dropped overrides). */
  note?: string;
}

/** Name, mode, colors and shape on the left; a live preview on the right. */
export const ThemeEditor: React.FC<ThemeEditorProps> = ({ state, note }) => {
  const { draft, setDraft, compiled, initialRadius } = state;
  const patch = (p: Partial<CustomThemeDef>) => setDraft((d) => ({ ...d, ...p }));
  const setRadius = (tier: keyof CustomThemeDef['radius'], v: string) =>
    setDraft((d) => ({ ...d, radius: { ...d.radius, [tier]: v } }));
  const nameMissing = draft.name.trim().length === 0;
  const diagnostics = compiled.ok ? compiled.diagnostics : [];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-5">
        {note && <p className="m-0 text-xs text-foreground-muted">{note}</p>}

        <Input
          label="Name"
          name="theme-name"
          value={draft.name}
          maxLength={MAX_THEME_NAME}
          required
          onChange={(e) => patch({ name: e.target.value })}
          error={nameMissing ? 'A name is required' : undefined}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground-muted">Mode</span>
          <Tabs
            variant="pills"
            aria-label="Color mode"
            value={draft.colorScheme}
            onChange={(v) => patch({ colorScheme: v })}
            items={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            className="self-start"
          />
        </div>

        {COLOR_GROUPS.map((group) => (
          <section key={group.title} className="flex flex-col gap-2.5">
            <h3 className="m-0 text-[11px] font-medium uppercase tracking-wider text-foreground-muted">
              {group.title}
            </h3>
            {group.rows.map((spec) => (
              <ColorRow key={spec.key} spec={spec} state={state} />
            ))}
          </section>
        ))}

        <section className="flex flex-col gap-2.5" aria-label="Contrast notes">
          <h3 className="m-0 text-[11px] font-medium uppercase tracking-wider text-foreground-muted">
            Contrast
          </h3>
          {diagnostics.length === 0 ? (
            <p className="m-0 text-xs text-foreground-muted">All text meets contrast targets</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {diagnostics.map((d) => (
                <li key={d.token} className="flex items-start gap-1.5 text-xs text-warning-text">
                  <AlertTriangle size={13} className="mt-px flex-shrink-0" aria-hidden="true" />
                  <span>
                    {d.token} auto-adjusted for readability (was {d.ratio.toFixed(2)}:1, needs{' '}
                    {d.min}:1)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="m-0 text-[11px] font-medium uppercase tracking-wider text-foreground-muted">
            Shape
          </h3>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-foreground-muted">Boxes (cards, modals)</span>
            <Segmented
              label="Box radius"
              value={draft.radius.box}
              options={RADIUS_PRESETS}
              initial={initialRadius.box}
              onChange={(v) => setRadius('box', v)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-foreground-muted">Fields (buttons, inputs)</span>
            <Segmented
              label="Field radius"
              value={draft.radius.field}
              options={RADIUS_PRESETS}
              initial={initialRadius.field}
              onChange={(v) => setRadius('field', v)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-foreground-muted">Selectors (toggles, badges)</span>
            <Segmented
              label="Selector radius"
              value={draft.radius.selector}
              options={RADIUS_PRESETS}
              initial={initialRadius.selector}
              onChange={(v) => setRadius('selector', v)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-foreground-muted">Border</span>
            <Segmented
              label="Border width"
              value={draft.border}
              options={BORDER_PRESETS}
              onChange={(v) => patch({ border: v })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={draft.depth === 1}
              onChange={(on) => patch({ depth: on ? 1 : 0 })}
              aria-label="Shadows"
            />
            <span className="text-sm text-foreground">Shadows</span>
          </div>
        </section>
      </div>

      <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
        <ThemePreview compiled={compiled} />
      </div>
    </div>
  );
};
