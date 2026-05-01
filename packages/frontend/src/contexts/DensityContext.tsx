import React from 'react';

export type Density = 'comfortable' | 'compact';

interface DensityContextValue {
  density: Density;
  setDensity: (d: Density) => void;
}

const DensityContext = React.createContext<DensityContextValue | null>(null);

const STORAGE_KEY = 'plexus.density';

const readStored = (): Density => {
  if (typeof window === 'undefined') return 'comfortable';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === 'compact' ? 'compact' : 'comfortable';
};

export const DensityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [density, setDensityState] = React.useState<Density>(() => readStored());

  React.useEffect(() => {
    if (density === 'compact') {
      document.documentElement.dataset.density = 'compact';
    } else {
      delete document.documentElement.dataset.density;
    }
  }, [density]);

  const setDensity = React.useCallback((next: Density) => {
    setDensityState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = React.useMemo(() => ({ density, setDensity }), [density, setDensity]);

  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
};

export const useDensity = (): DensityContextValue => {
  const ctx = React.useContext(DensityContext);
  if (!ctx) throw new Error('useDensity must be used within DensityProvider');
  return ctx;
};
