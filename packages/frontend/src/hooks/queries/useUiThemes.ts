/**
 * useUiThemes - TanStack Query hooks for the shared custom theme library.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CustomThemeDef } from '@plexus/shared';
import { api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { useAppearance } from '../../contexts/AppearanceContext';
import { isActiveReference } from '../../theme/custom';

export const UI_THEMES_KEY = ['ui-themes'] as const;

// Arrays that came from the server (not from setQueryData).
const serverLists = new WeakSet<object>();

/** True for a list returned by the server, false for one written with setQueryData. */
export const isServerList = (list: readonly CustomThemeDef[]): boolean => serverLists.has(list);

export const useUiThemes = ({ enabled }: { enabled: boolean }) =>
  useQuery<CustomThemeDef[]>({
    queryKey: UI_THEMES_KEY,
    queryFn: async () => {
      const list = await api.getUiThemes();
      serverLists.add(list);
      return list;
    },
    // Keep each fetched array's identity so `isServerList` can tell a server
    // result from an optimistic `setQueryData` one.
    structuralSharing: false,
    enabled,
  });

/** Replace the theme with the same id, or append it. */
export function upsertById(list: readonly CustomThemeDef[], theme: CustomThemeDef) {
  return list.some((t) => t.id === theme.id)
    ? list.map((t) => (t.id === theme.id ? theme : t))
    : [...list, theme];
}

export const useSaveUiTheme = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (theme: CustomThemeDef) => api.saveUiTheme(theme),
    onSuccess: (saved) => {
      // Write through before invalidating so the list never lacks a theme the
      // appearance is about to reference (which would read as "deleted").
      qc.setQueryData<CustomThemeDef[]>(UI_THEMES_KEY, (old) =>
        // An unloaded cache stays unloaded: a one-item list would read as "loaded".
        old ? upsertById(old, saved) : old
      );
      qc.invalidateQueries({ queryKey: UI_THEMES_KEY });
      toast.success('Theme saved');
    },
    onError: (err: Error) => toast.error(err.message, 'Failed to save theme'),
  });
};

export const useDeleteUiTheme = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const { appearance, prefersDark } = useAppearance();

  return useMutation({
    mutationFn: (id: string) => api.deleteUiTheme(id),
    onSuccess: (_void, id) => {
      qc.setQueryData<CustomThemeDef[]>(UI_THEMES_KEY, (old) =>
        old ? old.filter((t) => t.id !== id) : old
      );
      qc.invalidateQueries({ queryKey: UI_THEMES_KEY });
      // Deleting the theme on screen gets the (more informative) "switched
      // to ..." toast from CustomThemesSync instead.
      if (!isActiveReference(appearance, prefersDark, id)) toast.success('Theme deleted');
    },
    onError: (err: Error) => toast.error(err.message, 'Failed to delete theme'),
  });
};
