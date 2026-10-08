import React from 'react';
import { ChevronUp, Download, Upload } from 'lucide-react';
import { CustomThemeDefSchema, type CustomThemeDef } from '@plexus/shared';
import { useAppearance } from '../../contexts/AppearanceContext';
import { useToast } from '../../contexts/ToastContext';
import { useSaveUiTheme } from '../../hooks/queries/useUiThemes';
import { cn } from '../../lib/cn';
import { copyToClipboard } from '../../lib/clipboard';
import { slugThemeId } from '../../theme/editor';
import { exportThemeDaisyCss, exportThemeJson, importTheme } from '../../theme/interop';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/** Which import/export overlay is open. Owned by the modal so Escape can close it first. */
export type EditorPanel = 'import' | 'export' | null;

interface ThemeEditorFooterProps {
  mode: 'create' | 'edit';
  draft: CustomThemeDef;
  /** Name present and every color valid. */
  valid: boolean;
  panel: EditorPanel;
  onPanelChange: (panel: EditorPanel) => void;
  /** Replace the whole draft (clears typed-but-invalid color text). */
  replaceDraft: (def: CustomThemeDef) => void;
  /** Warnings from the last import, shown as a muted note in the editor body. */
  onImported: (warnings: string[]) => void;
  onCancel: () => void;
  onDone: (savedId: string) => void;
}

/**
 * Import / Export (left) and Cancel / Save (right) for the editor.
 * Create mode generates the id from the name; edit mode keeps it. Only a draft
 * that passes the schema is sent.
 */
export const ThemeEditorFooter: React.FC<ThemeEditorFooterProps> = ({
  mode,
  draft,
  valid,
  panel,
  onPanelChange,
  replaceDraft,
  onImported,
  onCancel,
  onDone,
}) => {
  const { customThemes, brokenCustomThemes, pickTheme, upsertCustomTheme } = useAppearance();
  const toast = useToast();
  const save = useSaveUiTheme();
  const [importText, setImportText] = React.useState('');
  const [importError, setImportError] = React.useState<string | null>(null);
  const exportRef = React.useRef<HTMLDivElement>(null);
  const importRef = React.useRef<HTMLDivElement>(null);
  const focusExportButton = () => exportRef.current?.querySelector<HTMLElement>('button')?.focus();
  const prevPanel = React.useRef<EditorPanel>(null);

  // Focus follows the panel: into the export menu when it opens, back to the
  // button that opened it when it closes by keyboard (not by click-away).
  React.useEffect(() => {
    const previous = prevPanel.current;
    prevPanel.current = panel;
    if (panel === 'export') {
      exportRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    } else if (previous === 'import') {
      importRef.current?.querySelector<HTMLElement>('button')?.focus();
    }
  }, [panel]);

  const onExportKeyDown = (e: React.KeyboardEvent) => {
    if (panel !== 'export') return;
    if (e.key === 'Escape') {
      // Keep the modal's Escape guard out of it.
      e.stopPropagation();
      e.preventDefault();
      onPanelChange(null);
      focusExportButton();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = Array.from(
        exportRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
      );
      const at = items.indexOf(e.target as HTMLElement);
      if (at === -1) return;
      e.preventDefault();
      e.stopPropagation();
      items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    }
  };

  // Click-away for the export menu (Escape is handled by the modal).
  React.useEffect(() => {
    if (panel !== 'export') return;
    const onDown = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) onPanelChange(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [panel, onPanelChange]);

  const openImport = () => {
    setImportText('');
    setImportError(null);
    onPanelChange('import');
  };

  const handleApply = () => {
    const result = importTheme(importText);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    // Edit mode keeps the current name unless the import carries one.
    const keepName = mode === 'edit' && !result.nameFromInput;
    replaceDraft({
      ...result.draft,
      id: draft.id,
      name: keepName ? draft.name : result.draft.name,
    });
    onImported(
      keepName ? result.warnings.filter((w) => !w.startsWith('No name')) : result.warnings
    );
    onPanelChange(null);
  };

  /**
   * Create mode exports with the id Save would generate (a fresh random
   * suffix, so it can differ from the saved id); edit mode exports the real id.
   */
  const exportable = (): CustomThemeDef =>
    mode === 'edit'
      ? draft
      : {
          ...draft,
          id: slugThemeId(draft.name, Math.random, [
            ...customThemes.map((t) => t.id),
            ...brokenCustomThemes.map((t) => t.id),
          ]),
        };

  const handleExport = async (format: 'css' | 'json') => {
    onPanelChange(null);
    focusExportButton();
    const def = exportable();
    const ok = await copyToClipboard(
      format === 'css' ? exportThemeDaisyCss(def) : exportThemeJson(def)
    );
    if (ok) toast.success(format === 'css' ? 'Copied daisyUI CSS' : 'Copied JSON', 'Copied');
    else toast.error('Clipboard is not available in this browser', 'Copy failed');
  };

  const handleSave = async () => {
    const id =
      mode === 'edit'
        ? draft.id
        : slugThemeId(draft.name, Math.random, [
            ...customThemes.map((t) => t.id),
            ...brokenCustomThemes.map((t) => t.id),
          ]);
    const parsed = CustomThemeDefSchema.safeParse({ ...draft, id });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid theme', 'Cannot save theme');
      return;
    }
    try {
      const saved = await save.mutateAsync(parsed.data);
      // Hand the saved theme to the context before the reference changes, so
      // no commit renders an id the context has not heard of yet.
      upsertCustomTheme(saved);
      // Editing keeps the id, so existing references stay valid; only a new
      // theme is applied.
      if (mode === 'create') pickTheme(saved.id, saved.colorScheme);
      onDone(saved.id);
    } catch {
      // useSaveUiTheme already toasted the failure; stay in the editor.
    }
  };

  return (
    <>
      <div className="mr-auto flex gap-2">
        <div ref={importRef}>
          <Button
            variant="outline"
            leftIcon={<Upload size="0.875rem" aria-hidden="true" />}
            onClick={openImport}
          >
            Import
          </Button>
        </div>
        <div ref={exportRef} className="relative" onKeyDown={onExportKeyDown}>
          <Button
            variant="outline"
            leftIcon={<Download size="0.875rem" aria-hidden="true" />}
            aria-haspopup="menu"
            aria-expanded={panel === 'export'}
            onClick={() => onPanelChange(panel === 'export' ? null : 'export')}
          >
            Export
            <ChevronUp size="0.875rem" aria-hidden="true" />
          </Button>
          {panel === 'export' && (
            <div
              role="menu"
              aria-label="Export theme"
              className="absolute bottom-full left-0 z-10 mb-2 flex w-52 flex-col gap-0.5 rounded-box border-(length:--theme-border-width) border-border bg-surface p-1 shadow-modal"
            >
              {(
                [
                  ['css', 'Copy as daisyUI CSS'],
                  ['json', 'Copy as JSON'],
                ] as const
              ).map(([format, label]) => (
                <button
                  key={format}
                  type="button"
                  role="menuitem"
                  onClick={() => handleExport(format)}
                  className="cursor-pointer rounded-field border-0 bg-transparent px-3 py-1.5 text-left font-sans text-sm text-foreground hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={handleSave}
        disabled={!valid || save.isPending}
        isLoading={save.isPending}
      >
        Save
      </Button>
      <Modal
        isOpen={panel === 'import'}
        onClose={() => onPanelChange(null)}
        title="Import theme"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => onPanelChange(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleApply} disabled={!importText.trim()}>
              Apply
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="theme-import-text"
            className="font-sans text-xs font-medium text-foreground-muted"
          >
            Paste a daisyUI theme (CSS) or JSON
          </label>
          <textarea
            id="theme-import-text"
            rows={8}
            data-autofocus
            spellCheck={false}
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportError(null);
            }}
            aria-invalid={importError !== null}
            aria-describedby={importError ? 'theme-import-error' : undefined}
            className={cn(
              'w-full resize-y rounded-field border-(length:--theme-border-width) bg-background p-3 font-mono text-xs text-foreground outline-none',
              'placeholder:text-foreground-muted hover:border-border-strong',
              'focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              importError ? 'border-danger' : 'border-border'
            )}
          />
          {importError && (
            <span id="theme-import-error" role="alert" className="text-xs text-danger-text">
              {importError}
            </span>
          )}
        </div>
      </Modal>
    </>
  );
};
