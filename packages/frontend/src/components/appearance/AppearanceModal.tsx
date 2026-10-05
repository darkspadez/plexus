import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useAppearance } from '../../contexts/AppearanceContext';
import { Modal } from '../ui/Modal';
import { SearchInput } from '../ui/SearchInput';
import { Switch } from '../ui/Switch';
import { ThemeTile } from './ThemeTile';
import { useGridKeyboardNav } from './useGridKeyboardNav';

interface AppearanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AppearanceModal: React.FC<AppearanceModalProps> = ({ isOpen, onClose }) => {
  const { appearance, themes, pickTheme, setMode } = useAppearance();
  const [query, setQuery] = React.useState('');
  const gridRef = React.useRef<HTMLDivElement>(null);
  const onGridKeyDown = useGridKeyboardNav(gridRef);

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
    }
  }, [isOpen]);

  const isSystem = appearance.mode === 'system';
  const nameOf = (id: string) => themes.find((t) => t.id === id)?.name ?? id;

  const q = query.trim().toLowerCase();
  const visible = q
    ? themes.filter((t) => t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q))
    : themes;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Appearance"
      subtitle={`${themes.length} themes · saved automatically`}
      size="xl"
    >
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

        <div>
          <h3 className="mb-2 mt-0 text-[11px] font-medium uppercase tracking-wider text-foreground-muted">
            Built-in
          </h3>
          {visible.length === 0 ? (
            <p className="m-0 text-sm text-foreground-muted">No themes match "{query}"</p>
          ) : (
            <div
              ref={gridRef}
              role="group"
              aria-label="Built-in themes"
              onKeyDown={onGridKeyDown}
              className="grid grid-cols-2 sm:grid-cols-3 gap-2"
            >
              {visible.map((theme) => {
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
                    onSelect={() => pickTheme(theme.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
