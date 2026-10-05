import React from 'react';
import { Copy, Moon, Pencil, Plus, Sun, Trash2 } from 'lucide-react';
import type { CustomThemeDef, ThemeDef } from '@plexus/shared';
import { useAppearance, type AppearanceContextValue } from '../../contexts/AppearanceContext';
import { useAuth } from '../../contexts/AuthContext';
import { useDeleteUiTheme } from '../../hooks/queries/useUiThemes';
import { normalizeRadius, seedFromTheme, seedNoteFor } from '../../theme/editor';
import { ConfirmDeleteModal } from '../models/ConfirmDeleteModal';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { SearchInput } from '../ui/SearchInput';
import { Switch } from '../ui/Switch';
import { ThemeEditor } from './ThemeEditor';
import { ThemeEditorFooter, type EditorPanel } from './ThemeEditorFooter';
import { ThemeTile, type ThemeTileMenuItem } from './ThemeTile';
import { useGridKeyboardNav } from './useGridKeyboardNav';
import { useThemeDraft } from './useThemeDraft';

type View = { kind: 'grid' } | { kind: 'editor'; mode: 'create' | 'edit'; note?: string };

/** Focus target for the "+ New theme" button when no saved tile applies. */
const NEW_THEME_TARGET = 'new-theme-button';

interface ThemeSectionProps {
  title: string;
  themes: readonly ThemeDef[];
  /** Custom themes that failed to compile (admin only): listed, not selectable. */
  brokenThemes?: readonly CustomThemeDef[];
  appearance: AppearanceContextValue['appearance'];
  onPick: (id: string) => void;
  action?: React.ReactNode;
  /** Shown instead of the grid when there is nothing to list. */
  emptyText?: string;
  menuItemsFor?: (theme: ThemeDef, broken: boolean) => ThemeTileMenuItem[];
  menuFor: string | null;
  onMenuChange: (id: string | null) => void;
}

/** A titled grid of theme tiles with its own arrow-key navigation. */
const ThemeSection: React.FC<ThemeSectionProps> = ({
  title,
  themes,
  brokenThemes = [],
  appearance,
  onPick,
  action,
  emptyText,
  menuItemsFor,
  menuFor,
  onMenuChange,
}) => {
  const gridRef = React.useRef<HTMLDivElement>(null);
  const onGridKeyDown = useGridKeyboardNav(gridRef);
  const isSystem = appearance.mode === 'system';
  const isEmpty = themes.length === 0 && brokenThemes.length === 0;
  const menuProps = (theme: ThemeDef, broken: boolean) => {
    const items = menuItemsFor?.(theme, broken);
    return items
      ? {
          menuItems: items,
          menuOpen: menuFor === theme.id,
          onMenuOpenChange: (open: boolean) => onMenuChange(open ? theme.id : null),
        }
      : {};
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="m-0 text-[11px] font-medium uppercase tracking-wider text-foreground-muted">
          {title}
        </h3>
        {action}
      </div>
      {isEmpty && emptyText && <p className="m-0 text-sm text-foreground-muted">{emptyText}</p>}
      <div
        ref={gridRef}
        role="group"
        aria-label={`${title} themes`}
        onKeyDown={onGridKeyDown}
        className="grid grid-cols-2 sm:grid-cols-3 gap-2"
      >
        {brokenThemes.map((theme) => (
          <ThemeTile
            key={theme.id}
            theme={theme}
            broken
            active={false}
            showScheme={false}
            onSelect={() => {}}
            {...menuProps(theme, true)}
          />
        ))}
        {themes.map((theme) => {
          const slotBadge = isSystem
            ? theme.id === appearance.light
              ? 'light'
              : theme.id === appearance.dark
                ? 'dark'
                : undefined
            : undefined;
          const active = isSystem ? slotBadge !== undefined : theme.id === appearance.theme;
          return (
            <ThemeTile
              key={theme.id}
              theme={theme}
              active={active}
              slotBadge={slotBadge}
              showScheme={isSystem}
              onSelect={() => onPick(theme.id)}
              {...menuProps(theme, false)}
            />
          );
        })}
      </div>
    </div>
  );
};

interface AppearanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AppearanceModal: React.FC<AppearanceModalProps> = ({ isOpen, onClose }) => {
  const {
    appearance,
    themes,
    builtinThemes,
    customThemes,
    brokenCustomThemes,
    resolvedTheme,
    pickTheme,
    setMode,
  } = useAppearance();
  const { isAdmin } = useAuth();
  const deleteTheme = useDeleteUiTheme();
  const [query, setQuery] = React.useState('');
  const [view, setView] = React.useState<View>({ kind: 'grid' });
  const [menuFor, setMenuFor] = React.useState<string | null>(null);
  // Import dialog / export menu inside the editor footer.
  const [editorPanel, setEditorPanel] = React.useState<EditorPanel>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null);
  // Where focus goes when the editor hands back to the grid (a tile id, or NEW_THEME_TARGET).
  const returnFocus = React.useRef<string | null>(null);
  // View kind seen by the previous hand-off effect run (mutated only in the effect).
  const prevKind = React.useRef<View['kind']>('grid');
  const draftState = useThemeDraft(isOpen && view.kind === 'editor');

  React.useEffect(() => {
    if (isOpen) {
      const dialog = document.querySelector<HTMLElement>(
        '[role="dialog"][aria-label="Appearance"]'
      );
      const target =
        dialog?.querySelector<HTMLElement>('[aria-pressed="true"]') ??
        dialog?.querySelector<HTMLElement>('[aria-pressed]') ??
        dialog?.querySelector<HTMLElement>('input[type="search"]');
      target?.focus();
    } else {
      setQuery('');
      setView({ kind: 'grid' });
      setMenuFor(null);
      setDeleteTarget(null);
      setEditorPanel(null);
      returnFocus.current = null;
    }
  }, [isOpen]);

  // Grid <-> editor focus handoff. Re-runs when the custom list changes so a
  // just-created theme's tile can take focus once it exists.
  React.useEffect(() => {
    if (!isOpen) {
      prevKind.current = 'grid';
      return;
    }
    const previous = prevKind.current;
    prevKind.current = view.kind;
    if (view.kind === 'editor') {
      // Only on entering the editor; a list refresh while editing must not move focus.
      if (previous !== 'editor') {
        document.querySelector<HTMLElement>('input[name="theme-name"]')?.focus();
      }
      return;
    }
    const want = returnFocus.current;
    if (!want) return;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Appearance"]');
    const newButton = dialog?.querySelector<HTMLElement>('[data-new-theme]');
    let el: HTMLElement | null | undefined = newButton;
    if (want !== NEW_THEME_TARGET) {
      const tile = dialog?.querySelector<HTMLElement>(`[data-tile-id="${CSS.escape(want)}"]`);
      if (tile) el = tile;
      // A just-saved theme's tile appears once the list refreshes; wait for it
      // unless the theme is already listed (filtered out by the search).
      else if (![...customThemes, ...brokenCustomThemes].some((t) => t.id === want)) return;
    }
    if (el) {
      el.focus();
      returnFocus.current = null;
    }
  }, [isOpen, view.kind, customThemes, brokenCustomThemes]);

  const openEditor = (mode: 'create' | 'edit', initial: CustomThemeDef, note?: string) => {
    draftState.replaceDraft({ ...initial, radius: normalizeRadius(initial.radius) });
    setMenuFor(null);
    setEditorPanel(null);
    returnFocus.current = null;
    setView({ kind: 'editor', mode, note });
  };

  const backToGrid = (focusId?: string) => {
    returnFocus.current = focusId ?? NEW_THEME_TARGET;
    setEditorPanel(null);
    setView({ kind: 'grid' });
  };

  const duplicate = (theme: ThemeDef) =>
    openEditor('create', seedFromTheme(theme, `${theme.name} copy`), seedNoteFor(theme));

  const menuItemsFor = (theme: ThemeDef, broken: boolean): ThemeTileMenuItem[] => {
    const isCustom = broken || customThemes.some((t) => t.id === theme.id);
    const remove: ThemeTileMenuItem = {
      label: 'Delete',
      icon: <Trash2 size={14} aria-hidden="true" />,
      danger: true,
      onSelect: () => setDeleteTarget({ id: theme.id, name: theme.name }),
    };
    const edit: ThemeTileMenuItem = {
      label: 'Edit',
      icon: <Pencil size={14} aria-hidden="true" />,
      onSelect: () => openEditor('edit', theme as CustomThemeDef),
    };
    const dup: ThemeTileMenuItem = {
      label: 'Duplicate',
      icon: <Copy size={14} aria-hidden="true" />,
      onSelect: () => duplicate(theme),
    };
    if (!isCustom) return [dup];
    return broken ? [edit, remove] : [edit, dup, remove];
  };

  const handleClose = () => {
    // A nested confirm or open menu owns this Escape (the dialog also hears it
    // on `document`).
    if (deleteTarget) return;
    // An open import dialog or export menu owns this Escape; the editor stays.
    if (editorPanel) {
      setEditorPanel(null);
      return;
    }
    if (menuFor) {
      // Focus may have left the menu (Tab), so its own Escape handler never ran.
      setMenuFor(null);
      return;
    }
    if (view.kind === 'editor') {
      backToGrid(view.mode === 'edit' ? draftState.draft.id : undefined);
      return;
    }
    onClose();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTheme.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      returnFocus.current = NEW_THEME_TARGET;
      setMenuFor(null);
    } catch {
      // useDeleteUiTheme already toasted; keep the confirm open.
    }
  };

  const isSystem = appearance.mode === 'system';
  const nameOf = (id: string) => themes.find((t) => t.id === id)?.name ?? id;

  const q = query.trim().toLowerCase();
  const matches = (t: ThemeDef) =>
    !q || t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
  const visibleCustom = customThemes.filter(matches);
  const visibleBroken = isAdmin ? brokenCustomThemes.filter(matches) : [];
  const visibleBuiltin = builtinThemes.filter(matches);
  const showCustom = isAdmin || visibleCustom.length > 0;
  const nothingMatches =
    visibleCustom.length === 0 && visibleBroken.length === 0 && visibleBuiltin.length === 0;

  const editing = view.kind === 'editor';

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={editing ? (view.mode === 'create' ? 'New theme' : 'Edit theme') : 'Appearance'}
        subtitle={editing ? undefined : `${themes.length} themes · saved automatically`}
        size={editing ? '2xl' : 'xl'}
        footer={
          editing ? (
            <ThemeEditorFooter
              mode={view.mode}
              draft={draftState.draft}
              valid={draftState.valid}
              panel={editorPanel}
              onPanelChange={setEditorPanel}
              replaceDraft={draftState.replaceDraft}
              onImported={(warnings) =>
                setView((v) =>
                  v.kind === 'editor'
                    ? {
                        ...v,
                        note: warnings.length ? `Imported. ${warnings.join('. ')}.` : undefined,
                      }
                    : v
                )
              }
              onCancel={() => backToGrid(view.mode === 'edit' ? draftState.draft.id : undefined)}
              onDone={(id) => backToGrid(id)}
            />
          ) : undefined
        }
      >
        {editing ? (
          <ThemeEditor state={draftState} note={view.note} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <Switch
                  checked={isSystem}
                  onChange={(on) => setMode(on ? 'system' : 'single')}
                  aria-label="Match system"
                />
                <span className="text-sm font-medium text-foreground">Match system</span>
              </div>
              {isSystem ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Sun size={12} aria-hidden="true" />
                    Light: {nameOf(appearance.light)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Moon size={12} aria-hidden="true" />
                    Dark: {nameOf(appearance.dark)}
                  </span>
                </div>
              ) : (
                <p className="m-0 text-xs text-foreground-muted">
                  Using {nameOf(appearance.theme)} everywhere
                </p>
              )}
            </div>

            <SearchInput value={query} onChange={setQuery} placeholder="Search themes..." />

            {nothingMatches && !isAdmin && (
              <p className="m-0 text-sm text-foreground-muted">No themes match "{query}"</p>
            )}
            {showCustom && (
              <ThemeSection
                title="Custom"
                themes={visibleCustom}
                brokenThemes={visibleBroken}
                appearance={appearance}
                onPick={pickTheme}
                emptyText={q ? 'No custom themes match' : 'No custom themes yet'}
                action={
                  isAdmin ? (
                    <Button
                      variant="outline"
                      size="sm"
                      data-new-theme=""
                      leftIcon={<Plus size={12} aria-hidden="true" />}
                      onClick={() =>
                        openEditor(
                          'create',
                          seedFromTheme(resolvedTheme, `${resolvedTheme.name} copy`),
                          seedNoteFor(resolvedTheme)
                        )
                      }
                    >
                      New theme
                    </Button>
                  ) : undefined
                }
                menuItemsFor={isAdmin ? menuItemsFor : undefined}
                menuFor={menuFor}
                onMenuChange={setMenuFor}
              />
            )}
            {visibleBuiltin.length > 0 && (
              <ThemeSection
                title="Built-in"
                themes={visibleBuiltin}
                appearance={appearance}
                onPick={pickTheme}
                menuItemsFor={isAdmin ? menuItemsFor : undefined}
                menuFor={menuFor}
                onMenuChange={setMenuFor}
              />
            )}
          </div>
        )}
      </Modal>
      <ConfirmDeleteModal
        isOpen={isOpen && deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete theme"
        question="Delete this theme?"
        message={deleteTarget ? `"${deleteTarget.name}" will be removed for everyone.` : ''}
        onConfirm={confirmDelete}
        isLoading={deleteTheme.isPending}
      />
    </>
  );
};
