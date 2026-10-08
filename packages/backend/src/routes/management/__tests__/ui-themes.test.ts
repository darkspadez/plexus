import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { MAX_CUSTOM_THEMES, UI_THEMES_SETTING_KEY } from '@plexus/shared';

const store = vi.hoisted(() => ({ settings: new Map<string, unknown>() }));

vi.mock('../../../services/configuration/config-service', () => ({
  ConfigService: {
    getInstance: vi.fn(() => ({
      getSetting: vi.fn(async (key: string, def: unknown) =>
        store.settings.has(key) ? structuredClone(store.settings.get(key)) : def
      ),
      setSetting: vi.fn(async (key: string, value: unknown) => {
        store.settings.set(key, structuredClone(value));
      }),
    })),
  },
}));

import { setConfigForTesting } from '../../../config';
import { authenticate, ManagementAuthError } from '../_principal';
import { registerUiThemeRoutes } from '../ui-themes';

const ADMIN = 'admin-secret-for-themes';
const LIMITED = 'sk-limited-themes';
const originalAdminKey = process.env.ADMIN_KEY;

function makeTheme(id: string, name = 'Mine') {
  return {
    id,
    name,
    colorScheme: 'dark',
    colors: {
      'base-100': '#101010',
      'base-200': '#181818',
      'base-300': '#202020',
      'base-content': '#eeeeee',
      primary: '#3366ff',
      secondary: '#ff6633',
      accent: '#33ffaa',
      neutral: '#444444',
      info: '#3399ff',
      success: '#33cc66',
      warning: '#ffcc33',
      error: '#ff3333',
    },
    radius: { box: '0.5rem', field: '0.25rem', selector: '0.25rem' },
    border: '1px',
    depth: 0,
  };
}

describe('ui-themes routes', () => {
  let fastify: FastifyInstance;

  // Real authenticate + requireAdmin (mirrors the limited-user scope in
  // management.ts) so the admin/limited gating is genuinely exercised.
  beforeEach(async () => {
    store.settings.clear();
    process.env.ADMIN_KEY = ADMIN;
    setConfigForTesting({
      providers: {},
      models: {},
      keys: { limited: { secret: LIMITED } },
    } as any);

    fastify = Fastify();
    fastify.setErrorHandler(async (error, _req, reply) => {
      if (error instanceof ManagementAuthError) {
        return reply.code(error.statusCode).send(error.authBody);
      }
      throw error;
    });
    await fastify.register(async (scoped) => {
      scoped.addHook('preHandler', authenticate);
      await registerUiThemeRoutes(scoped);
    });
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    if (originalAdminKey === undefined) delete process.env.ADMIN_KEY;
    else process.env.ADMIN_KEY = originalAdminKey;
  });

  const call = (method: 'GET' | 'PUT' | 'DELETE', url: string, payload?: unknown, key = ADMIN) =>
    fastify.inject({ method, url, headers: { 'x-admin-key': key }, payload: payload as object });

  it('GET on an empty store returns an empty library', async () => {
    const res = await call('GET', '/v0/management/ui-themes');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ version: 1, themes: [] });
  });

  it('PUT valid theme saves it and GET returns it', async () => {
    const theme = makeTheme('custom-one');
    const put = await call('PUT', '/v0/management/ui-themes/custom-one', theme);
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual(theme);

    const get = await call('GET', '/v0/management/ui-themes');
    expect(get.json()).toEqual({ version: 1, themes: [theme] });
  });

  it('PUT again replaces in place preserving order', async () => {
    await call('PUT', '/v0/management/ui-themes/custom-a', makeTheme('custom-a'));
    await call('PUT', '/v0/management/ui-themes/custom-b', makeTheme('custom-b'));
    const res = await call(
      'PUT',
      '/v0/management/ui-themes/custom-a',
      makeTheme('custom-a', 'Renamed')
    );
    expect(res.statusCode).toBe(200);

    const { themes } = (await call('GET', '/v0/management/ui-themes')).json();
    expect(themes.map((t: any) => t.id)).toEqual(['custom-a', 'custom-b']);
    expect(themes[0].name).toBe('Renamed');
  });

  it('PUT with id mismatch is 400', async () => {
    const res = await call('PUT', '/v0/management/ui-themes/custom-x', makeTheme('custom-y'));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Theme id mismatch' });
  });

  it('PUT with an invalid color is 400 with issues', async () => {
    const theme = makeTheme('custom-bad');
    theme.colors.primary = 'red; } x';
    const res = await call('PUT', '/v0/management/ui-themes/custom-bad', theme);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Invalid theme');
    expect(Array.isArray(res.json().issues)).toBe(true);
  });

  it('PUT with a non-custom id is 400', async () => {
    const res = await call('PUT', '/v0/management/ui-themes/plexus-dark', makeTheme('plexus-dark'));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Invalid theme');
  });

  it('PUT of the 51st new theme is 409, but replacing an existing one still works', async () => {
    const themes = Array.from({ length: MAX_CUSTOM_THEMES }, (_, i) => makeTheme(`custom-t${i}`));
    store.settings.set(UI_THEMES_SETTING_KEY, { version: 1, themes });

    const res = await call(
      'PUT',
      '/v0/management/ui-themes/custom-extra',
      makeTheme('custom-extra')
    );
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'Theme limit reached' });

    const replace = await call(
      'PUT',
      '/v0/management/ui-themes/custom-t0',
      makeTheme('custom-t0', 'X')
    );
    expect(replace.statusCode).toBe(200);
  });

  it('DELETE removes an existing theme', async () => {
    await call('PUT', '/v0/management/ui-themes/custom-gone', makeTheme('custom-gone'));
    const del = await call('DELETE', '/v0/management/ui-themes/custom-gone');
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ success: true });
    expect((await call('GET', '/v0/management/ui-themes')).json().themes).toEqual([]);
  });

  it('DELETE of a missing theme is 404', async () => {
    const res = await call('DELETE', '/v0/management/ui-themes/custom-nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Theme not found' });
  });

  it('limited key can GET but gets 403 on PUT and DELETE', async () => {
    const get = await call('GET', '/v0/management/ui-themes', undefined, LIMITED);
    expect(get.statusCode).toBe(200);

    const put = await call(
      'PUT',
      '/v0/management/ui-themes/custom-l',
      makeTheme('custom-l'),
      LIMITED
    );
    expect(put.statusCode).toBe(403);

    const del = await call('DELETE', '/v0/management/ui-themes/custom-l', undefined, LIMITED);
    expect(del.statusCode).toBe(403);
    expect(store.settings.has(UI_THEMES_SETTING_KEY)).toBe(false);
  });

  it('unauthenticated request is 401', async () => {
    const res = await call('GET', '/v0/management/ui-themes', undefined, 'wrong');
    expect(res.statusCode).toBe(401);
  });

  it('GET salvages valid unique themes from a corrupt stored library', async () => {
    const good = makeTheme('custom-good');
    const bad = makeTheme('custom-bad');
    bad.colors.primary = 'red; } x';
    store.settings.set(UI_THEMES_SETTING_KEY, {
      version: 1,
      themes: [good, bad, makeTheme('custom-good', 'Dup')],
    });

    const res = await call('GET', '/v0/management/ui-themes');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ version: 1, themes: [good] });
  });
});
