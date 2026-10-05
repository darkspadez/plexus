import * as z from 'zod';

// daisyUI-style theme vocabulary. Themes are plain data; the frontend compiler
// turns them into CSS custom properties.

export const THEME_REQUIRED_COLOR_KEYS = [
  'base-100',
  'base-200',
  'base-300',
  'base-content',
  'primary',
  'secondary',
  'accent',
  'neutral',
  'info',
  'success',
  'warning',
  'error',
] as const;

// Optional - the compiler auto-derives these when absent.
export const THEME_CONTENT_COLOR_KEYS = [
  'primary-content',
  'secondary-content',
  'accent-content',
  'neutral-content',
  'info-content',
  'success-content',
  'warning-content',
  'error-content',
] as const;

export type ThemeColorKey =
  | (typeof THEME_REQUIRED_COLOR_KEYS)[number]
  | (typeof THEME_CONTENT_COLOR_KEYS)[number];

export const CUSTOM_THEME_ID_RE = /^custom-[a-z0-9-]{1,40}$/;
export const THEME_ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
export const UI_THEMES_SETTING_KEY = 'ui.themes';
export const MAX_CUSTOM_THEMES = 50;

// Values are later injected inside a <style> element, so the allowed character
// set deliberately excludes `; { } < > " ' \`.
export const CssColorSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(
    /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\([-+\w.%,/ ]*\))$/i
  );

export const CssLengthRemSchema = z
  .string()
  .max(12)
  .regex(/^(0|\d*\.?\d+rem)$/);

const requiredColors = Object.fromEntries(
  THEME_REQUIRED_COLOR_KEYS.map((k) => [k, CssColorSchema])
) as Record<(typeof THEME_REQUIRED_COLOR_KEYS)[number], typeof CssColorSchema>;
const contentColors = Object.fromEntries(
  THEME_CONTENT_COLOR_KEYS.map((k) => [k, CssColorSchema.optional()])
) as Record<(typeof THEME_CONTENT_COLOR_KEYS)[number], z.ZodOptional<typeof CssColorSchema>>;

export const ThemeDefSchema = z
  .object({
    id: z.string().regex(THEME_ID_RE),
    name: z.string().trim().min(1).max(40),
    colorScheme: z.enum(['light', 'dark']),
    colors: z.object({ ...requiredColors, ...contentColors }).strict(),
    radius: z
      .object({
        box: CssLengthRemSchema,
        field: CssLengthRemSchema,
        selector: CssLengthRemSchema,
      })
      .strict(),
    border: z.enum(['1px', '1.5px', '2px']),
    depth: z.union([z.literal(0), z.literal(1)]),
    overrides: z
      .record(
        z.string().regex(/^[a-z0-9-]{1,40}$/),
        z
          .string()
          .trim()
          .min(1)
          .max(200)
          .regex(/^[-+\w.%,/ ()#]*$/)
      )
      .optional(),
  })
  .strict();
export type ThemeDef = z.infer<typeof ThemeDefSchema>;

export const CustomThemeDefSchema = ThemeDefSchema.extend({
  id: z.string().regex(CUSTOM_THEME_ID_RE),
})
  .omit({ overrides: true })
  .strict();
export type CustomThemeDef = z.infer<typeof CustomThemeDefSchema>;

export const UiThemesLibrarySchema = z
  .object({
    version: z.literal(1),
    themes: z.array(CustomThemeDefSchema).max(MAX_CUSTOM_THEMES),
  })
  .strict()
  .superRefine((lib, ctx) => {
    const seen = new Set<string>();
    lib.themes.forEach((t, i) => {
      if (seen.has(t.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['themes', i, 'id'],
          message: `Duplicate theme id: ${t.id}`,
        });
      }
      seen.add(t.id);
    });
  });
export type UiThemesLibrary = z.infer<typeof UiThemesLibrarySchema>;
