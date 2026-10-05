import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the theme conventions against upstream merges. Upstream still writes
 * the old patterns, which auto-merge, typecheck and render wrong. See
 * "Upstream merges" in docs/DESIGN_MIGRATION.md.
 */

const SRC = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(SRC, full).split(sep).join('/');
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || rel === 'theme/builtin') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

const FILES = walk(SRC).map((rel) => ({
  rel,
  lines: readFileSync(join(SRC, rel), 'utf8').split('\n'),
}));

interface Rule {
  name: string;
  pattern: RegExp;
  message: string;
  allow?: readonly string[];
}

const ROLES = 'primary|secondary|accent|neutral|success|warning|danger|info|critical';

export const SECONDARY_VARIANT = /\bvariant\s*[=:][^;\n]*['"]secondary['"]/;

const RULES: Rule[] = [
  {
    name: 'secondary-variant',
    // `secondary` anywhere in the same single-line `variant=...` / `variant:` / `variant =`
    // expression: literals, `{'secondary'}`, ternaries and default parameters.
    pattern: SECONDARY_VARIANT,
    message:
      "Upstream's `secondary` button is `outline` here; the filled `secondary` variant is the theme's secondary color.",
    allow: ['components/appearance/ThemePreview.tsx', 'components/ui/Button.tsx'],
  },
  {
    name: 'px-text-size',
    pattern: /text-\[\d+px\]/,
    message: 'Hard-coded px text size; use text-label/2xs/3xs/xs/sm (rem-based).',
  },
  {
    name: 'numeric-icon-size',
    pattern: /\bsize=\{\d+\}/,
    message: 'Numeric size={N} is px; use a rem string such as size="0.875rem".',
  },
  {
    name: 'raw-role-text',
    pattern: new RegExp(`(^|[^a-zA-Z-])text-(${ROLES})(\\/\\d+)?(?![a-zA-Z0-9-])`),
    message: 'Raw role text color is not contrast-safe; use text-<role>-text.',
  },
];

function violations(rule: Rule): string[] {
  const found: string[] = [];
  for (const { rel, lines } of FILES) {
    if (rule.allow?.includes(rel)) continue;
    lines.forEach((line, i) => {
      if (rule.pattern.test(line)) found.push(`${rel}:${i + 1} [${rule.name}] ${line.trim()}`);
    });
  }
  return found;
}

describe('secondary-variant pattern', () => {
  it.each([
    `<Button variant="secondary">`,
    `<Button variant={'secondary'}>`,
    `<Button variant={cond ? 'primary' : 'secondary'}>`,
    `<Button variant={cond ? "secondary" : "ghost"}>`,
    `function B({ variant = 'secondary' }) {}`,
    `const props = { variant: 'secondary' };`,
  ])('catches %s', (line) => {
    expect(SECONDARY_VARIANT.test(line)).toBe(true);
  });

  it.each([`<Button variant="outline">`, `<Button variant={cond ? 'primary' : 'outline'}>`])(
    'ignores %s',
    (line) => {
      expect(SECONDARY_VARIANT.test(line)).toBe(false);
    }
  );
});

describe('theme conventions', () => {
  for (const rule of RULES) {
    it(`${rule.name}: ${rule.message}`, () => {
      const found = violations(rule);
      expect(found, `${rule.message}\n${found.join('\n')}`).toEqual([]);
    });
  }
});
