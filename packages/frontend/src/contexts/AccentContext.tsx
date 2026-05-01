import React from 'react';

export const ACCENTS = ['blue', 'green', 'orange', 'violet', 'rose', 'amber'] as const;
export type Accent = (typeof ACCENTS)[number];

interface AccentContextValue {
  accent: Accent;
  setAccent: (accent: Accent) => void;
}

const AccentContext = React.createContext<AccentContextValue | null>(null);

const STORAGE_KEY = 'plexus.accent';

const readStored = (): Accent => {
  if (typeof window === 'undefined') return 'blue';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return (ACCENTS as readonly string[]).includes(raw ?? '') ? (raw as Accent) : 'blue';
};

export const AccentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accent, setAccentState] = React.useState<Accent>(() => readStored());

  const setAccent = React.useCallback((next: Accent) => {
    setAccentState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.dataset.accent = next;
  }, []);

  const value = React.useMemo(() => ({ accent, setAccent }), [accent, setAccent]);

  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
};

export const useAccent = (): AccentContextValue => {
  const ctx = React.useContext(AccentContext);
  if (!ctx) throw new Error('useAccent must be used within AccentProvider');
  return ctx;
};
