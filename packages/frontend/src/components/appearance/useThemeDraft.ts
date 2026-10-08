import React from 'react';
import {
  THEME_CONTENT_COLOR_KEYS,
  THEME_REQUIRED_COLOR_KEYS,
  type CustomThemeDef,
  type ThemeColorKey,
} from '@plexus/shared';
import { compileTheme, type ContrastIssue } from '../../theme/compile';
import { PLEXUS_LIGHT } from '../../theme/builtin';
import {
  applyContentAuto,
  colorError,
  colorErrorsFor,
  seedFromTheme,
  type ContentColorKey,
  type HeldColors,
} from '../../theme/editor';

/** Scope the editor preview is compiled under (the id never reaches the DOM). */
export const DRAFT_SCOPE_ID = '__draft';
export const DRAFT_SELECTOR = `[data-theme="${DRAFT_SCOPE_ID}"]`;

export type CompiledDraft =
  | { ok: true; css: string; vars: Record<string, string>; diagnostics: ContrastIssue[] }
  | { ok: false; error: string };

const COLOR_KEYS: readonly ThemeColorKey[] = [
  ...THEME_REQUIRED_COLOR_KEYS,
  ...THEME_CONTENT_COLOR_KEYS,
];

const BLANK_DRAFT: CustomThemeDef = seedFromTheme(PLEXUS_LIGHT, 'New theme');

export interface ThemeDraft {
  draft: CustomThemeDef;
  /** Radii the draft started with (set by `replaceDraft`), so a non-preset value stays restorable. */
  initialRadius: CustomThemeDef['radius'];
  setDraft: React.Dispatch<React.SetStateAction<CustomThemeDef>>;
  /** Replace the whole draft (entering the editor) and forget typed-but-invalid text. */
  replaceDraft: (def: CustomThemeDef) => void;
  /** Set a color to a value known to be valid (e.g. from the color picker). */
  setColor: (key: ThemeColorKey, value: string) => void;
  /** Text typed into a color field: applied when valid, otherwise held back with an error. */
  setColorText: (key: ThemeColorKey, text: string) => void;
  /** Toggle Auto on a `-content` color; also drops any held invalid text for it. */
  setContentAuto: (key: ContentColorKey, auto: boolean, derivedHex: string) => void;
  /** What a color field should display: held-back invalid text, else the draft value. */
  textFor: (key: ThemeColorKey) => string;
  /** Per color key problems (typed text, or a bad value in a seeded draft). */
  errors: Partial<Record<ThemeColorKey, string>>;
  /** Name present and no color errors. */
  valid: boolean;
  compiled: CompiledDraft;
}

/**
 * Editor draft state. Invalid color text never reaches the draft, so the draft
 * (and the preview compiled from it) always reflects the last valid input. When
 * `enabled` is false nothing is compiled (the modal is closed or showing the grid).
 */
export function useThemeDraft(enabled: boolean): ThemeDraft {
  const [draft, setDraft] = React.useState<CustomThemeDef>(BLANK_DRAFT);
  const [held, setHeld] = React.useState<HeldColors>({});
  const [initialRadius, setInitialRadius] = React.useState(BLANK_DRAFT.radius);

  const replaceDraft = React.useCallback((def: CustomThemeDef) => {
    setDraft(def);
    setInitialRadius(def.radius);
    setHeld({});
  }, []);

  const dropHeld = (key: ThemeColorKey) =>
    setHeld((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const setColor = (key: ThemeColorKey, value: string) => {
    dropHeld(key);
    setDraft((d) => ({ ...d, colors: { ...d.colors, [key]: value } }));
  };

  const setColorText = (key: ThemeColorKey, text: string) => {
    if (colorError(text) === undefined) {
      setColor(key, text.trim());
    } else {
      setHeld((prev) => ({ ...prev, [key]: text }));
    }
  };

  const setContentAuto = (key: ContentColorKey, auto: boolean, derivedHex: string) => {
    const out = applyContentAuto(draft, held, key, auto, derivedHex);
    setDraft(out.draft);
    setHeld(out.held);
  };

  const textFor = (key: ThemeColorKey) => held[key] ?? draft.colors[key] ?? '';

  const errors: Partial<Record<ThemeColorKey, string>> = colorErrorsFor(
    draft.colors,
    held,
    COLOR_KEYS
  );
  const valid = Object.keys(errors).length === 0 && draft.name.trim().length > 0;

  const compiled = React.useMemo<CompiledDraft>(() => {
    if (!enabled) return { ok: false, error: 'closed' };
    try {
      const out = compileTheme({ ...draft, id: DRAFT_SCOPE_ID }, { selector: DRAFT_SELECTOR });
      return { ok: true, css: out.css, vars: out.vars, diagnostics: out.diagnostics };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, [enabled, draft]);

  return {
    draft,
    initialRadius,
    setDraft,
    replaceDraft,
    setColor,
    setColorText,
    setContentAuto,
    textFor,
    errors,
    valid,
    compiled,
  };
}
