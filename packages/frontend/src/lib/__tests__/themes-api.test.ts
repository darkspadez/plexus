import { describe, expect, it } from 'vitest';
import { BUILTIN_THEMES } from '../../theme/builtin';
import { errorMessage, parseUiThemesPayload } from '../api/themes';

const { overrides: _o, ...base } = BUILTIN_THEMES.find((t) => t.id === 'cupcake')!;
const theme = (id: string) => ({ ...base, id, name: id });

describe('parseUiThemesPayload', () => {
  it('returns the themes of a valid library', () => {
    const out = parseUiThemesPayload({
      version: 1,
      themes: [theme('custom-a'), theme('custom-b')],
    });
    expect(out.map((t) => t.id)).toEqual(['custom-a', 'custom-b']);
  });

  it('keeps the individually valid themes when the library is invalid', () => {
    const out = parseUiThemesPayload({
      version: 1,
      themes: [theme('custom-a'), { id: 'custom-bad' }, theme('custom-a'), theme('not-custom')],
    });
    expect(out.map((t) => t.id)).toEqual(['custom-a']);
  });

  it('returns an empty list for junk', () => {
    expect(parseUiThemesPayload(null)).toEqual([]);
    expect(parseUiThemesPayload({ themes: 'x' })).toEqual([]);
    expect(parseUiThemesPayload('x')).toEqual([]);
  });
});

describe('errorMessage', () => {
  const res = (body: unknown) => new Response(JSON.stringify(body), { status: 403 });

  it('reads a string error', async () => {
    expect(await errorMessage(res({ error: 'Bad theme' }), 'fallback')).toBe('Bad theme');
  });

  it('reads the management auth error shape', async () => {
    const body = { error: { message: 'Admin required', type: 'auth', code: 403 } };
    expect(await errorMessage(res(body), 'fallback')).toBe('Admin required');
  });

  it('falls back for non-JSON or empty bodies', async () => {
    expect(await errorMessage(new Response('nope', { status: 500 }), 'fallback')).toBe('fallback');
    expect(await errorMessage(res({ error: { code: 1 } }), 'fallback')).toBe('fallback');
  });
});
