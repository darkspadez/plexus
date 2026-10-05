import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CustomThemeDef } from '@plexus/shared';
import { useAuth } from '../../contexts/AuthContext';
import { useAppearance } from '../../contexts/AppearanceContext';
import { useToast } from '../../contexts/ToastContext';
import { UI_THEMES_KEY, isServerList, useUiThemes } from '../../hooks/queries/useUiThemes';
import {
  THEME_CACHE_STORAGE_KEY,
  confirmsAbsence,
  decideCustomSync,
  planDeletedReplacement,
  referencedCustomIds,
} from '../../theme/custom';
import { getBuiltinTheme } from '../../theme/builtin';

/**
 * Loads the shared custom theme library once a principal exists (so the login
 * page never hits the 401-redirecting endpoint), hands it to AppearanceContext,
 * and swaps any reference to a theme that no longer exists for the Plexus default.
 * A reference missing from the list is only a deletion once a server fetch made
 * after the reference appeared still lacks it; until then the list is refetched
 * (another tab may have just created the theme). Renders nothing.
 */
export const CustomThemesSync: React.FC = () => {
  const { principal } = useAuth();
  const { appearance, prefersDark, setCustomThemes, replaceThemeReferences } = useAppearance();
  const toast = useToast();
  const qc = useQueryClient();
  const enabled = principal !== null;
  const { data } = useUiThemes({ enabled });
  const handled = React.useRef<typeof data>(undefined);
  // The refetch asked for a given missing set, and the list it was asked against.
  const requested = React.useRef<{ key: string; base: readonly CustomThemeDef[] } | null>(null);
  // Display names seen so far, so a deletion toast can name the theme.
  const names = React.useRef<Map<string, string>>(new Map());

  // Another tab saved or edited a theme (it rewrites the boot cache): pick it up.
  React.useEffect(() => {
    if (!enabled) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_CACHE_STORAGE_KEY) return;
      qc.invalidateQueries({ queryKey: UI_THEMES_KEY });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [enabled, qc]);

  // Runs per received list and per appearance change. Picking a theme never
  // reads as a deletion: the list is consulted, and only a fresh server list
  // can confirm one.
  React.useEffect(() => {
    if (!data) return;
    const isNew = handled.current !== data;
    handled.current = data;
    if (isNew) {
      setCustomThemes(data);
      for (const t of data) names.current.set(t.id, t.name);
    }

    const pending = requested.current;
    // Fresh = a server list that replaced the list we explicitly refetched
    // against. Every missing set needs its own refetch first.
    const serverFresh = confirmsAbsence(isServerList(data), data, pending ? pending.base : null);
    const decision = decideCustomSync({
      referenced: referencedCustomIds(appearance),
      loaded: data.map((t) => t.id),
      serverFresh,
    });

    if (decision.action === 'none') {
      requested.current = null;
      return;
    }
    const key = decision.missing.join(',');
    if (decision.action === 'refetch') {
      if (pending?.key === key) return; // already asked for this exact set
      requested.current = { key, base: data };
      qc.invalidateQueries({ queryKey: UI_THEMES_KEY });
      return;
    }

    requested.current = null;
    const { shown } = planDeletedReplacement(appearance, decision.missing, prefersDark);
    replaceThemeReferences(decision.missing);
    // Only a change to the theme on screen is news; the rest is swapped silently
    // (and a delete from this tab already toasts "Theme deleted").
    if (shown) {
      const name = names.current.get(shown.from);
      const to = getBuiltinTheme(shown.to)?.name ?? shown.to;
      toast.info(
        name
          ? `Theme "${name}" was deleted — switched to ${to}`
          : `A custom theme was deleted — switched to ${to}`
      );
    }
  }, [data, appearance, prefersDark, setCustomThemes, replaceThemeReferences, toast, qc]);

  return null;
};
