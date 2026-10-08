import { useLayoutEffect, useMemo } from 'react';
import { useMonaco } from '@monaco-editor/react';
import { useAppearance } from '../contexts/AppearanceContext';
import { compileTheme } from '../theme/compile';
import { toMonacoColor } from '../theme/color';

/** Theme name -> serialized colors last defined, to skip redundant refreshes. */
const defined = new Map<string, string>();

/**
 * Defines a Monaco theme from the resolved Plexus theme and returns its name.
 * Falls back to the built-in vs / vs-dark theme until monaco has loaded.
 */
export function useMonacoTheme(): string {
  const monaco = useMonaco();
  const { resolvedTheme, resolvedThemeId, colorScheme } = useAppearance();

  const colors = useMemo(() => {
    const v = compileTheme(resolvedTheme).vars;
    // Border-strong at ~50% alpha for the scrollbar thumb.
    const strong = toMonacoColor(v['border-strong']).slice(0, 7) + '80';
    return {
      'editor.background': toMonacoColor(v['surface-sunken']),
      'editor.foreground': toMonacoColor(v['foreground']),
      'editorLineNumber.foreground': toMonacoColor(v['foreground-subtle']),
      'editorLineNumber.activeForeground': toMonacoColor(v['foreground-muted']),
      'editorCursor.foreground': toMonacoColor(v['primary']),
      'editor.selectionBackground': toMonacoColor(v['primary-subtle']),
      'editor.lineHighlightBackground': toMonacoColor(v['surface-hover']),
      'editorWidget.background': toMonacoColor(v['surface-elevated']),
      'editorWidget.border': toMonacoColor(v['border']),
      'scrollbarSlider.background': strong,
    };
  }, [resolvedTheme]);

  const name = `plexus-${resolvedThemeId}`;
  const base = colorScheme === 'dark' ? 'vs-dark' : 'vs';

  // Layout effect: all layout effects run before any passive effect, so the
  // theme exists before @monaco-editor/react's child passive effect calls
  // setTheme(name). Otherwise Monaco falls back to `vs` for an unknown name.
  useLayoutEffect(() => {
    if (!monaco) return;
    const key = `${base}|${JSON.stringify(colors)}`;
    if (defined.get(name) === key) return;
    monaco.editor.defineTheme(name, { base, inherit: true, rules: [], colors });
    defined.set(name, key);
  }, [monaco, name, base, colors]);

  return monaco ? name : base;
}
