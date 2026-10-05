import { FastifyInstance } from 'fastify';
import {
  CustomThemeDefSchema,
  MAX_CUSTOM_THEMES,
  UI_THEMES_SETTING_KEY,
  UiThemesLibrarySchema,
  type CustomThemeDef,
} from '@plexus/shared';
import { ConfigService } from '../../services/configuration/config-service';
import { logger } from '../../utils/logger';
import { requireAdmin } from './_principal';

type Library = { version: 1; themes: CustomThemeDef[] };

/**
 * Load the stored library. A corrupt value (hand-edited DB, older shape) must
 * not break the UI, so fall back to the valid, de-duplicated subset.
 */
async function loadLibrary(): Promise<Library> {
  const raw = await ConfigService.getInstance().getSetting<unknown>(UI_THEMES_SETTING_KEY, null);
  if (raw === null || raw === undefined) return { version: 1, themes: [] };

  const parsed = UiThemesLibrarySchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  logger.warn(`[ui-themes] stored '${UI_THEMES_SETTING_KEY}' failed validation; salvaging themes`);
  const rawThemes = Array.isArray((raw as { themes?: unknown }).themes)
    ? ((raw as { themes: unknown[] }).themes ?? [])
    : [];
  const seen = new Set<string>();
  const themes: CustomThemeDef[] = [];
  for (const candidate of rawThemes) {
    const t = CustomThemeDefSchema.safeParse(candidate);
    if (!t.success || seen.has(t.data.id)) continue;
    seen.add(t.data.id);
    themes.push(t.data);
    if (themes.length >= MAX_CUSTOM_THEMES) break;
  }
  return { version: 1, themes };
}

async function saveLibrary(library: Library): Promise<void> {
  await ConfigService.getInstance().setSetting(UI_THEMES_SETTING_KEY, library);
}

export async function registerUiThemeRoutes(fastify: FastifyInstance) {
  // Readable by any authenticated key so every user sees the shared library.
  fastify.get('/v0/management/ui-themes', async (_request, reply) => {
    return reply.send(await loadLibrary());
  });

  // Writes are admin-only. Read-modify-write on one setting: concurrent edits
  // are last-writer-wins, which is acceptable for a theme library.
  fastify.put(
    '/v0/management/ui-themes/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = CustomThemeDefSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid theme', issues: parsed.error.issues });
      }
      const theme = parsed.data;
      if (theme.id !== id) {
        return reply.code(400).send({ error: 'Theme id mismatch' });
      }

      const library = await loadLibrary();
      const index = library.themes.findIndex((t) => t.id === id);
      if (index >= 0) {
        library.themes[index] = theme;
      } else {
        if (library.themes.length >= MAX_CUSTOM_THEMES) {
          return reply.code(409).send({ error: 'Theme limit reached' });
        }
        library.themes.push(theme);
      }

      await saveLibrary(library);
      logger.info(`[AUDIT] admin saved ui theme '${id}'`);
      return reply.send(theme);
    }
  );

  fastify.delete(
    '/v0/management/ui-themes/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const library = await loadLibrary();
      const next = library.themes.filter((t) => t.id !== id);
      if (next.length === library.themes.length) {
        return reply.code(404).send({ error: 'Theme not found' });
      }
      await saveLibrary({ version: 1, themes: next });
      logger.info(`[AUDIT] admin deleted ui theme '${id}'`);
      return reply.send({ success: true });
    }
  );
}
