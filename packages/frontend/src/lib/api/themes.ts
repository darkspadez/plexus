import {
  CustomThemeDefSchema,
  MAX_CUSTOM_THEMES,
  UiThemesLibrarySchema,
  type CustomThemeDef,
} from '@plexus/shared';
import { API_BASE, fetchWithAuth } from './core';

/**
 * Validate a `/ui-themes` payload. If the whole library fails validation, keep
 * the individually valid, de-duplicated themes rather than dropping them all.
 */
export function parseUiThemesPayload(raw: unknown): CustomThemeDef[] {
  const lib = UiThemesLibrarySchema.safeParse(raw);
  if (lib.success) return lib.data.themes;
  const candidates =
    raw !== null && typeof raw === 'object' && Array.isArray((raw as { themes?: unknown }).themes)
      ? (raw as { themes: unknown[] }).themes
      : [];
  const seen = new Set<string>();
  const themes: CustomThemeDef[] = [];
  for (const candidate of candidates) {
    const t = CustomThemeDefSchema.safeParse(candidate);
    if (!t.success || seen.has(t.data.id)) continue;
    seen.add(t.data.id);
    themes.push(t.data);
    if (themes.length >= MAX_CUSTOM_THEMES) break;
  }
  return themes;
}

export async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    // Handlers return `{ error: string }`; the management auth layer returns
    // `{ error: { message, type, code } }`.
    const text =
      typeof body.error === 'object' && body.error !== null
        ? (body.error as { message?: unknown }).message
        : body.error;
    if (typeof text === 'string' && text) return text;
  } catch {
    // non-JSON error body
  }
  return fallback;
}

/** Fetch the shared custom theme library (any authenticated key). */
export const getUiThemes = async (): Promise<CustomThemeDef[]> => {
  const res = await fetchWithAuth(`${API_BASE}/v0/management/ui-themes`);
  if (!res.ok) throw new Error('Failed to fetch themes');
  return parseUiThemesPayload(await res.json());
};

/** Create or replace one custom theme (admin only). */
export const saveUiTheme = async (theme: CustomThemeDef): Promise<CustomThemeDef> => {
  const res = await fetchWithAuth(
    `${API_BASE}/v0/management/ui-themes/${encodeURIComponent(theme.id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(theme),
    }
  );
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to save theme'));
  return CustomThemeDefSchema.parse(await res.json());
};

/** Delete one custom theme (admin only). */
export const deleteUiTheme = async (id: string): Promise<void> => {
  const res = await fetchWithAuth(`${API_BASE}/v0/management/ui-themes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to delete theme'));
};
