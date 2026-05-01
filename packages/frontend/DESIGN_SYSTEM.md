# Plexus Design System

> **Status**: v0.3 — most decisions locked in. Working hex values present for all theme tokens, all six accent options, all provider chips, and all API format chips. Remaining TODOs require real screens to refine, not more discussion.
>
> **Audience**: This document is the source of truth for the Plexus admin UI. It is read by both human contributors and AI coding agents (Claude Code, etc.). Anything that lands in `packages/frontend` (or whatever the admin UI package is named at time of reading) MUST conform to it. When this document and `AGENTS.md` disagree, this document wins for visual / interaction decisions; `AGENTS.md` wins for repo-wide engineering rules.
>
> **Scope**: The Plexus admin dashboard. Not the public marketing site, not API docs (handled by `piai-docs`), not the OpenAI-compatible response payloads themselves.

---

## 0. Why this document exists

The current admin UI was built incrementally as features landed. That worked while the surface area was small, but it has produced visible inconsistencies: mixed spacing, inconsistent table styles, ad-hoc empty states, multiple ways to render the same primitive (status badge, provider pill, model chip), and a sometimes-different interaction model per page.

This redesign has one job: **make every screen look and behave like it was drawn by the same hand**. New features should fall out of the system, not require new visual decisions each time.

Concretely, the redesign must:

1. Establish a single token system (color, type, spacing, radius, motion) and refuse one-off values.
2. Standardize the four or five layout templates every page reuses.
3. Replace every bespoke status / pill / chip / badge with one canonical component.
4. Normalize how tabular, time-series, and JSON data are presented across the app.
5. Support light, dark, and system-following themes equally — neither is a second-class citizen.

---

## 1. Aesthetic direction

Plexus is a power-user observability and routing tool. People who run it are reading dense logs, reasoning about provider health, and debugging request traces at 11 PM. The UI should feel like a tool, not a marketing site.

**Design tone**: *Expressive utilitarian.* Information-dense and operator-first, but with confident color and a distinctive identity that sets it apart from blue-tinted, generic-shadcn admin dashboards.

The character is built from four moves:

1. **A single rationed accent, user-selectable, defaulting to blue.** Each user picks an accent from a fixed palette (see §3.4); the choice persists. Whatever the choice, the accent is rationed — it appears on primary actions, the active nav item, the focus ring, and the primary chart series, and almost nowhere else. Because it's rationed, it reads as confident rather than loud, regardless of which hue the user picked.
2. **Two equally-considered themes, each with a distinct surface character.** The dark theme is near-black with a slight cool cast — not slate, not charcoal. The light theme is paper-white — a warm off-white, not a clinical pure white — with soft card surfaces separated by subtle 1px borders rather than drop shadows. Both themes are first-class.
3. **Pill-shaped chips and status indicators.** Where a chip exists — provider, model, API format, quota status, request status, role tag — it's rounded-full, tinted-fill, and the dominant secondary visual element. This is the "if you saw a screenshot, you'd recognize Plexus" detail.
4. **Capsule-ended chart bars and a fixed multi-series palette.** Bars in any chart taller than 12px get fully rounded ends. Series colors are assigned in a fixed order — accent first, then a violet, then green, then cyan — never reshuffled per chart. The first series follows the user's accent, so the same chart looks blue for one user and orange for another.

Inspirations: closer to Linear, Vercel, Posthog, and Resend in density and operator-first ergonomics; closer to expressive product UIs in color usage. Not Stripe-soft. Not Notion-rounded everywhere. Not generic-shadcn-purple-on-white.

**Anti-brief**:

- Hero-style oversized headings on internal pages
- Decorative gradients used as backgrounds rather than as semantic accents
- Soft pastel "friendly admin" palettes
- Stock shadcn out-of-the-box look without typographic and color customization
- Whitespace so generous that a 27" monitor shows only six rows of a request log
- Multi-color decoration where a single accent would carry the meaning
- Pill nav at the top of the app (pills are for chips, not navigation)
- Giant hero numbers as the focal point of every page (only the Dashboard earns those)

**Density default**: Comfortable-dense. A 1440×900 viewport should comfortably show a full sidebar, a primary header, a filter row, and 18–25 rows of tabular data without scrolling, with no row feeling cramped.

---

## 2. Stack & dependencies

### 2.1 Required

- **React 19+**, TypeScript strict mode
- **Tailwind CSS v4** (CSS-first config; tokens declared as CSS variables in `@theme`)
- **shadcn/ui** as the component foundation, installed via the CLI into `src/components/ui/` so every component is owned in-tree and can be themed
- **lucide-react** for iconography (single icon library — do not mix with Heroicons, Tabler, etc.)
- **TanStack Table** for data tables (the request log, providers list, model aliases list all use this)
- **TanStack Query** for server state (already implied by the existing API layer; if it isn't there, add it before adding new fetch calls)
- **Recharts** for charts (dashboard sparklines, cost/volume trendlines)
- **date-fns** for time formatting (no `moment`, no `dayjs` — pick one and stick with it)
- **clsx** / **tailwind-merge** via the shadcn-provided `cn()` utility

### 2.2 Forbidden / discouraged

- No additional UI kits (Radix is fine because shadcn is built on it; no Material UI, Chakra, Mantine, Ant Design)
- No CSS-in-JS runtime libraries (styled-components, Emotion). Tailwind only.
- No new icon libraries
- No animation libraries beyond what shadcn pulls in (Radix transitions + Tailwind `transition-*`). If a complex animation is genuinely needed, justify it in the PR.

### 2.3 Build / runtime

The admin UI is built into static assets and served by the Bun/Hono backend. Whatever the bundler is at time of reading (currently Vite per `bun.lock`), do not introduce a second one.

---

## 3. Theming (light, dark, accent)

### 3.1 The three theme modes

All three are first-class:

- `light` — explicit light
- `dark` — explicit dark (the default for new visitors)
- `system` — follow `prefers-color-scheme`

The toggle is a three-way control (icon button → menu, or a segmented control in Settings). Selection persists in `localStorage` under `plexus.theme`. The initial render must avoid FOUC: a synchronous inline `<script>` in `index.html` reads the stored value and sets `data-theme` on `<html>` before React hydrates.

The mechanism is `data-theme="light"` / `data-theme="dark"` on `<html>`, not a `class="dark"`. This makes it easier to query in DevTools and to attach non-color tokens (e.g. shadow elevation curves) to the same selector.

### 3.2 Color tokens

Tokens are declared once in `src/styles/tokens.css` and referenced everywhere via Tailwind's `@theme` indirection. **No raw hex values in component code.** If you need a color that isn't in the token set, add it to the token set first.

The token set is split into four layers:

**Layer 1 — Primitive scale.** Neutral 50–950, plus dedicated scales for each pickable accent hue (`blue`, `green`, `orange`, `violet`, `rose`, `amber` — see §3.4), plus dedicated scales for `success`, `warning`, `danger`, `info`, plus dedicated scales for the secondary chart hues (`violet`, `teal`/`cyan`). These are flat values, the same in both themes.

**Layer 2 — Semantic tokens.** What components actually consume. These remap per theme.

```
--background         page background
--surface            cards, popovers, dialogs
--surface-elevated   nested surface (e.g. table row hover, code block)
--surface-sunken     inset areas (e.g. log viewer, JSON tree)
--border             default border
--border-strong      emphasized border / focus ring base
--foreground         primary text
--foreground-muted   secondary text, table headers
--foreground-subtle  tertiary text, captions, timestamps
--accent             interactive primary (resolved from user's accent choice)
--accent-foreground  text on --accent
--accent-subtle      ~12% tinted fill on --accent (used by primary-tinted pills)
--success / --warning / --danger / --info  (and matching -foreground / -subtle)
```

**Layer 3 — Accent indirection.** `--accent` is not a fixed color; it's an alias that points at one of the Layer-1 accent scales based on the user's preference (see §3.4). At runtime, `--accent` is set on `<html>` to the chosen hue's mid-step (e.g. `blue-500`), `--accent-foreground` to its appropriate contrast partner, and `--accent-subtle` to the same hue at low opacity. Components only ever reference the semantic name.

**Layer 4 — Chart series tokens.** A fixed, ordered palette consumed by Recharts. Reused across charts so the same series color always means the same thing within a single context.

```
--chart-1   = --accent           primary series, "ours"
--chart-2   violet               secondary series, "compare against"
--chart-3   success (green)      positive deltas
--chart-4   info (cyan/teal)     fourth series
--chart-5   foreground-subtle    "other" / inactive / catch-all
```

**Theme-specific surface values:**

These are the working hex values. Treat them as a starting baseline that may shift ±2–4 lightness steps during implementation, not as gospel; they are concrete enough that Claude Code can scaffold real CSS today.

*Light theme (paper-warm):*

```
--background         #F6F4EE   warm off-white page
--surface            #FFFFFF   white cards
--surface-elevated   #FAF8F2   row hover, code block
--surface-sunken     #EFEDE5   inset (log viewer, JSON tree)
--border             #E5E1D6   soft warm-gray
--border-strong      #C9C2B0
--foreground         #1A1815   warm near-black
--foreground-muted   #6B6557   warm gray
--foreground-subtle  #A09887   warm light gray
```

Card separation in light theme uses `--border` lines. Drop shadows are reserved for popovers, dropdowns, and dialogs.

*Dark theme (true near-black):*

```
--background         #0A0B0E   near-black with slight cool cast
--surface            #16181D   cards
--surface-elevated   #1F2127   row hover, code block
--surface-sunken     #06070A   inset (log viewer, JSON tree)
--border             #22252C
--border-strong      #3A3E47
--foreground         #E8EAED
--foreground-muted   #9DA1AA
--foreground-subtle  #5C616B
```

Shadows are nearly invisible in dark theme; rely on borders. The `--surface-sunken` step is *darker* than `--background` on purpose — code blocks and log viewers should feel like wells, not raised cards.

> **Iteration note**: the warm vs. cool balance is the most likely thing to need adjustment once these are rendered together in real screens. If the warm cast in light theme fights the chosen accent (especially a cool blue), nudge `--background` toward `#F5F5F2` and `--foreground` toward `#181818`.

### 3.3 What the accent hue carries

The accent — whatever the user has set it to — is reserved for **interactive intent and primary actions**:

- Primary buttons
- Active sidebar item (left bar + tinted background)
- Selected tab underline
- Focus rings
- Active link in body text
- Currently-selected row indicator
- The line / first bar / first donut segment in any chart

The accent does **not** decorate. It is not used for headings, for borders on inactive cards, or as a generic "make it pop" color. If a screen has more than three accent-tinted elements at rest, something is wrong.

Because the accent is user-configurable, the design must look correct with any of the §3.4 options. If a layout only works because the accent is blue (or only works because it's orange), the layout is wrong.

### 3.4 Accent selection (user preference)

Each user picks an accent from a fixed palette. The choice is stored in `localStorage` under `plexus.accent` and exposed in **Settings → Theme**.

The palette — three vivid options for the most-likely-picked colors, three muted options for the rest:

| Token name | Default? | Saturation | Mid-step (`--accent`) | Subtle (`--accent-subtle`) | Notes                                                          |
| ---------- | -------- | ---------- | --------------------- | -------------------------- | -------------------------------------------------------------- |
| `blue`     | **Yes**  | Vivid      | `#2563EB`             | `rgba(37,99,235,0.12)`     | The default. Calm, conventional for ops tools, high legibility |
| `green`    |          | Vivid      | `#16A34A`             | `rgba(22,163,74,0.12)`     | Strong alternative — pairs well with the dark theme            |
| `orange`   |          | Vivid      | `#EA580C`             | `rgba(234,88,12,0.12)`     | Energetic, distinctive; pairs particularly well with light     |
| `violet`   |          | Muted      | `#7C5CFC`             | `rgba(124,92,252,0.12)`    | Clashes with `--chart-2`; if picked, chart-2 swaps to `rose`   |
| `rose`     |          | Muted      | `#D6638F`             | `rgba(214,99,143,0.12)`    | Warm, low-saturation; readable against both themes             |
| `amber`    |          | Muted      | `#D97706`             | `rgba(217,119,6,0.12)`     | Use sparingly — close to `warning`, can feel like an alert     |

`--accent-foreground` is `#FFFFFF` for `blue`, `green`, `orange`, `violet`, `amber`; `#FFFFFF` for `rose` as well at the values given. Verify per-accent contrast against `surface` and `accent` mid-step in implementation; nudge mid-step ±1 lightness step if AA fails.

Mechanism:

- A synchronous `<script>` in `index.html` reads `plexus.accent` (alongside `plexus.theme`) and sets `data-accent="<name>"` on `<html>` before React hydrates. This avoids an accent flash on load.
- CSS rules in `tokens.css` keyed off `[data-accent="blue"]`, `[data-accent="green"]`, etc. set `--accent`, `--accent-foreground`, and `--accent-subtle` to the appropriate Layer-1 scale steps.
- The chart palette token `--chart-1` is `var(--accent)`, so charts follow the user's choice without per-chart code changes.
- If the picked accent collides with another fixed semantic color (e.g. user picks `violet` while `--chart-2` is also violet), CSS swaps the colliding token to its alternate (e.g. `--chart-2` becomes `rose`). These swaps are declared once in `tokens.css`, not handled component-side.

The accent picker UI itself is six small `rounded-full` swatches in **Settings → Theme**, each `24px`, with a check-mark overlay on the active one and a focus ring on hover. Live preview — picking a color updates `data-accent` immediately, no save button.

### 3.4 Status colors

| Token       | Meaning                                              | Examples                                          |
| ----------- | ---------------------------------------------------- | ------------------------------------------------- |
| `success`   | Healthy, completed, enabled, within quota            | Provider green dot, 2xx response, request succeeded |
| `warning`   | Degraded, near limit, deprecated, about to fail over | Quota at 80%+, provider on its first cooldown     |
| `danger`    | Failed, errored, exhausted, blocked                  | 5xx, provider in long cooldown, quota exceeded    |
| `info`      | Informational, in-progress, neutral attention        | Background job running, OAuth refreshing          |

A status color is **always paired with a non-color cue** (icon, label, or shape) so colorblind users and grayscale prints survive.

---

## 4. Typography

### 4.1 Families

Three families, no more:

- **Sans** (UI body, headings): **Geist**, weights 400/500/600. Loaded via `geist/font` package or self-hosted woff2. Tabular numerals and stylistic alternates enabled globally.
- **Mono** (IDs, model names, tokens, JSON, code, latencies, request IDs): **Geist Mono**, weights 400/500.
- **Display**: none. Headings use Geist at heavier weights — no separate display face.

Global font feature settings: `font-feature-settings: "tnum", "ss01"` so numerals align by column in tables.

### 4.2 Type scale

A six-step scale, no in-betweens:

| Token     | Size / line-height | Use                                       |
| --------- | ------------------ | ----------------------------------------- |
| `text-xs`   | 12 / 16            | Captions, timestamps, table meta, tooltips |
| `text-sm`   | 13 / 20            | **Default body**, table cells, form labels |
| `text-base` | 15 / 22            | Card titles, primary text in detail panes |
| `text-lg`   | 17 / 24            | Section headings inside a page            |
| `text-xl`   | 22 / 28            | Page title (H1)                           |
| `text-2xl`  | 28 / 32            | Reserved — empty states, splash, login    |

Note: default body is `text-sm`. This is a tool, not a marketing page. If something needs to be `text-base`, justify it.

### 4.3 Weights

`400` body, `500` for medium-emphasis labels and table headers, `600` for headings and active nav. Never `700+` in the UI; reserve true bold for the login screen and 404.

### 4.4 Numerals

All numeric values in tables, charts, and metrics use **tabular figures**. This is non-negotiable. The metric "1,234,567 tokens" must align with "987,654 tokens" beneath it, decimal under decimal.

---

## 5. Spacing, radius, sizing

### 5.1 Spacing scale

Use the Tailwind 4-pixel scale. Do not introduce custom values. Common rhythms:

- Inside-component gap: `gap-1.5` (6px) or `gap-2` (8px)
- Form field vertical: `space-y-3` (12px)
- Section vertical: `space-y-6` (24px)
- Page padding: `p-6` (24px) on small viewports, `p-8` (32px) on `lg+`

### 5.2 Radius

A four-step radius scale plus full-round, used deliberately:

- `rounded-sm` (4px) — inputs, table cell highlights, inline code
- `rounded-md` (8px) — **default** for buttons, small cards, table-row selection ring
- `rounded-lg` (12px) — popovers, dropdowns, dialogs, sheets
- `rounded-xl` (16px) — featured surfaces only: dashboard metric cards, dashboard chart cards, the login card. Reserved.
- `rounded-full` — chips, status pills, status dots, avatars, chart bar caps. **The signature radius for secondary visuals.** Used liberally on chips, never on tables, never on inputs, never on buttons.

If a value falls between these (`14px`, `20px`, `rounded-2xl`, etc.), the scale is wrong — extend it here, do not inline.

### 5.3 Borders

`1px` borders, always. No `2px` borders for emphasis — use color or weight instead. Border tokens, not `border-gray-200` etc.

### 5.4 Shadows

Two elevations, both very restrained:

- `shadow-sm` — popovers, dropdowns, hovered cards
- `shadow-md` — dialogs, floating panels

Dark mode shadows are nearly invisible; rely on borders for separation in dark mode rather than shadows.

---

## 6. Layout & app shell

### 6.1 The shell

Every authenticated page renders inside a single shell:

```
┌─────────────────────────────────────────────────────────────┐
│ TopBar  (logo · env badge · search · theme · user menu)     │
├──────────┬──────────────────────────────────────────────────┤
│ Sidebar  │ Page                                             │
│          │ ┌──────────────────────────────────────────────┐ │
│          │ │ Page header (title · subtitle · actions)     │ │
│          │ ├──────────────────────────────────────────────┤ │
│          │ │ Content                                      │ │
│          │ └──────────────────────────────────────────────┘ │
└──────────┴──────────────────────────────────────────────────┘
```

- TopBar is `48px` tall, sticky.
- Sidebar is `224px` wide expanded, `56px` collapsed (icon-only). State persists in `localStorage` under `plexus.sidebar`.
- Page region scrolls; TopBar and Sidebar do not.
- `lg+` is the supported viewport. `md` collapses the sidebar to icon-only by default. `sm` slides it out as a sheet — but most operator workflows are not optimized for sm and we do not pretend otherwise.

**Logo**: a small geometric mark plus the `Plexus` wordmark when the sidebar is expanded; mark only when the sidebar is collapsed. The mark and wordmark sit in the top-left corner, **inside the sidebar's column** rather than in the TopBar — this keeps the logo's left edge aligned with sidebar items below it. The wordmark is set in Geist 600. The mark is monochrome (uses `--foreground`) — it does **not** use the accent, so the brand identity stays stable when users change accent color.

### 6.2 Page templates

Every page uses one of these four templates. If a new page does not fit, the template list is wrong — extend this document, do not invent a new layout in component code.

1. **List** — filters row, then a single full-width data table. Used by Request Logs, Providers, Model Aliases, Quotas, OAuth providers, MCP servers, API keys.
2. **Dashboard** — grid of metric cards above a 2-column chart row, optionally followed by a recent-activity list. Used by the Dashboard view.
3. **Detail** — left rail of metadata + right pane of tabbed content. Used by "view a single request", "view a single provider", "view a single alias".
4. **Form** — single-column form, max width `640px`, sectioned. Used by Settings sub-pages, "new alias", "new provider", "new quota".

### 6.3 Navigation (sidebar)

Sidebar groups, in order:

1. **Observability** — Dashboard, Request Logs
2. **Routing** — Model Aliases, Providers
3. **Access** — API Keys, Quotas, OAuth Providers
4. **Integrations** — MCP Servers
5. **Settings** — at the bottom, slightly separated

Group headers are `text-xs uppercase tracking-wide foreground-subtle`. Items are `text-sm`. Active item: accent-tinted background + accent left-bar (3px).

---

## 7. Components

All primitives come from shadcn. The rules below are about how we use them. **Do not** build a custom Button, Input, Dialog, etc. when the shadcn one exists.

### 7.1 Buttons

- **Variants**: `default` (accent-filled), `outline`, `ghost`, `destructive`, `link`. No others.
- **Sizes**: `sm` (28px), `default` (32px), `lg` (40px). `lg` is reserved for empty-state CTAs and the login screen.
- One primary button per page region. If two actions are equally weighted, both are `outline`.
- Destructive actions (delete provider, revoke API key, delete response) **always** go through a confirm dialog. No inline destructive buttons in tables; put them in the row's overflow menu.

### 7.2 Forms

- shadcn `Form` + `react-hook-form` + `zod`. Schema lives next to the component.
- Labels above inputs, never floating, never inline.
- Help text below the input, `text-xs foreground-subtle`.
- Errors below the help text, `text-xs danger`.
- Required fields marked with a subtle `*` after the label, never with a "required" word.
- Submit button bottom-right of a form section. Cancel/secondary to its left.

### 7.3 Tables

This is the most-touched surface in Plexus. Get it right.

- Built on TanStack Table + shadcn `Table`.
- Header row: `text-xs uppercase tracking-wide font-medium foreground-muted`, `32px` tall.
- Body row: `text-sm`, `40px` tall comfortable, `32px` compact (user toggle, persisted).
- Zebra striping: **off**. Rely on borders for row separation — striping fights status colors and badges.
- Hover: row gets `surface-elevated` background.
- Selected: row gets `accent/10` background + a 2px accent left-bar.
- Numeric columns right-aligned, with mono font and tabular numerals.
- ID/UUID columns: monospaced, truncated with a copy-on-click affordance.
- Timestamps: relative ("3m ago") with the absolute time in a tooltip; user can flip to absolute via a toolbar toggle.
- Empty state: centered, with a one-line explanation and (when relevant) a single primary CTA.
- Loading state: skeleton rows that match the actual row height. No spinners replacing the whole table.
- Pagination: cursor-based ("Newer" / "Older") for time-series data (request logs); page-numbered for static lists (providers, aliases).
- Filters live in a sticky bar above the table, never inside the table header.

### 7.4 Status indicators

There is **one** status component. Two visual variants:

- **Dot + label** (preferred for table rows): `●` colored dot followed by a short word in `foreground` weight 500.
- **Pill** (preferred for detail panes, headers, and anywhere a chip-style affordance is wanted): `rounded-full`, tinted background at ~12% of the status hue, foreground text at the full status hue, `text-xs font-medium`, `px-2.5 py-0.5`. No border. These pills are deliberately prominent — they are part of the visual identity.

Vocabulary, fixed:

| State        | Used for                                       |
| ------------ | ---------------------------------------------- |
| `Healthy`    | Provider up and recently successful            |
| `Degraded`   | Provider on first/short cooldown               |
| `Cooldown`   | Provider in active cooldown (show duration)    |
| `Disabled`   | Provider explicitly disabled                   |
| `Active`     | Quota / alias / key currently in use           |
| `Idle`       | Configured but unused                          |
| `Exceeded`   | Quota over its limit                           |
| `Expired`    | OAuth token expired                            |
| `Refreshing` | OAuth token refresh in flight                  |
| `Error`      | Last request errored                           |

Do not invent new states without adding them here first.

### 7.5 Badges & chips

All chips are `rounded-full` (see §5.2). They share padding (`px-2 py-0.5` for size sm, `px-2.5 py-0.5` for default) and weight (`font-medium`).

- **Provider chip**: small pill, monospace label, tinted background in the provider's assigned hue, with a 12px provider logo when we have one. Provider hues are assigned in the token set, not chosen per chip.
- **Model name chip**: monospace, sized to content, neutral `surface-elevated` background, no logo.
- **API format chip**: tiny pill — `OpenAI`, `Anthropic`, `Gemini`, `Responses`. Stable colors used consistently anywhere a request format appears (table column, detail header, log filter).
- **Numeric delta chip**: used on dashboard metric cards. `+4.2%` in `success` tint, `-1.8%` in `danger` tint, with a small chevron up/down. Always paired with the metric it belongs to.

#### 7.5.1 Provider chip color assignments

Hybrid approach: the hue *leans* toward what each provider is associated with, but everything is desaturated to fit the token system rather than matching any provider's actual brand color. This keeps the request log scannable without visually shouting any one vendor.

| Provider               | Hue family      | Mid-step  | Notes                                           |
| ---------------------- | --------------- | --------- | ----------------------------------------------- |
| OpenAI                 | desaturated teal | `#2A9D8F` | Recognizable without being the actual OpenAI green |
| Anthropic              | warm tan        | `#C58A5A` | Warm but not orange; orange is reserved for accent |
| Gemini / Google        | desaturated blue | `#5B7FB8` | Distinct from accent blue; cooler / grayer      |
| DeepSeek               | indigo          | `#6B6BC4` |                                                 |
| Groq                   | desaturated red | `#C5635B` |                                                 |
| OpenRouter             | neutral         | `#7A7468` | Logo carries the identification                 |
| Ollama / local         | desaturated green | `#6B9968` |                                                 |
| OAuth: GitHub Copilot  | neutral charcoal | `#4A4E58` |                                                 |
| OAuth: Codex / Codex CLI | neutral charcoal | `#4A4E58` |                                                 |
| OAuth: Gemini CLI      | desaturated blue | `#5B7FB8` | Inherits Gemini hue                             |
| OAuth: Antigravity     | neutral charcoal | `#4A4E58` |                                                 |
| Custom / unknown       | neutral         | `--foreground-muted` | Fallback                              |

These colors are stable across both themes — provider identity should not shift when the user toggles the theme. Backgrounds use the same hue at low opacity (`~12%`); foreground text uses the mid-step itself.

#### 7.5.2 API format chip color assignments

Format hues are tied to the source brand of each API shape, since the format is what's actually being negotiated by Plexus. This makes a row's "in format" and "out format" columns scan-readable at a glance.

| Format      | Hue     | Mid-step  | Subtle fill              |
| ----------- | ------- | --------- | ------------------------ |
| `OpenAI`    | green   | `#2F9F6A` | `rgba(47,159,106,0.12)`  |
| `Anthropic` | orange  | `#E07A3E` | `rgba(224,122,62,0.12)`  |
| `Gemini`    | blue    | `#4A7FCF` | `rgba(74,127,207,0.12)`  |
| `Responses` | violet  | `#7C5CFC` | `rgba(124,92,252,0.12)`  |

Format chips intentionally do not change with the user's accent — format identity has to be stable across users.

### 7.6 Dialogs, sheets, popovers

- **Dialog** for destructive confirms and small modal forms (≤ 4 fields).
- **Sheet** (right-side, 480–640px) for create/edit flows that have more than 4 fields. Sheets do not block the rest of the page from being read.
- **Popover** for transient actions (filter, column picker, copy options).
- **Tooltip** for short labels only — never for content the user must read carefully.

### 7.7 Toasts

- One toast library: shadcn's `sonner`-based `Toaster`.
- Position: bottom-right.
- Success toasts auto-dismiss in 4s. Error toasts persist until dismissed.
- Never use a toast for primary action confirmation when the action's effect is visible on screen (e.g. don't toast "Provider saved" when the provider list updates in front of the user).

### 7.8 Code & JSON

- Inline code: `font-mono text-[0.9em]` with `surface-elevated` background and `rounded-sm` padding.
- Code blocks (request bodies, response bodies, config snippets): `surface-sunken` background, no border, monospace, `text-xs` line height `1.55`. With a header bar that contains the format label and a copy button.
- JSON viewer: collapsible tree (use a small library or build with `@radix-ui/react-collapsible` primitives). Keys are `foreground`, strings are `success`, numbers are `info`, booleans/null are `warning`. Same key/value coloring in light and dark.

### 7.9 Charts

- Recharts only.
- **Series colors are drawn from the chart palette tokens (§3.2 Layer 3) in fixed order.** Never random per chart, never hand-picked per chart.
- The primary series is always `--chart-1` (orange). If a chart has only one series, that's the only color used.
- **Bars are capsule-rounded.** In any vertical bar chart, the top of every bar is a half-circle (effectively `rx`/`ry` equal to half the bar width, applied via Recharts `radius`). For horizontal bars, the right end. This is a signature element — do not flatten the caps to "match a more subdued chart library."
- A "compare-against" series (e.g. previous period) renders as a **muted, diagonally-hatched bar** sitting behind or beside the primary bar at lower opacity. SVG pattern fill. This is the convention for any "this period vs last period" comparison.
- Donut charts: `8–10px` stroke width, full-rounded segment ends where two segments meet. Center label is the total or primary metric, `text-2xl mono tabular`.
- Line series: `2px` stroke for primary, `1.5px` for secondary, optional fill at ~10% opacity under the primary line only.
- Grid lines: `border` token, dashed, very low opacity. Horizontal grid only — no vertical grid lines.
- Axis labels: `text-xs foreground-subtle`. Y-axis labels right-padded to align by digit (tabular numerals).
- Tooltip is custom (the default Recharts tooltip looks like a default Recharts tooltip): a small `rounded-full` or `rounded-lg` pill on `foreground` / `surface-elevated` background depending on theme, anchored to the active data point with a thin `1px` guide line dropping from the pill to the point. For multi-series tooltips, fall back to a `rounded-lg` card with a colored leading dot per series.
- Charts are `200–280px` tall on dashboards. Anything taller earns its space.

### 7.10 Empty states

A title (one line, `text-base`), a one-sentence explanation, an optional single primary CTA, and an optional small line drawing. **Not** a giant illustration. **Not** marketing copy. Examples:

```
No requests yet
Once a client hits /v1/chat/completions, you'll see them here.
[ View setup guide ]
```

### 7.11 Errors

- Inline form errors: see §7.2.
- Page-level errors (API call failed, 500 from backend): a `danger`-tinted bordered card with the error message, the request ID if available, and a Retry button. Never a blank page or just a toast.
- Auth errors: redirect to login, do not error-card.

---

## 8. Data display conventions

These rules are the difference between "looks consistent" and "looks hacked together":

| Data type     | Format                                                                                  | Example                                  |
| ------------- | --------------------------------------------------------------------------------------- | ---------------------------------------- |
| Latency       | `ms` for < 1000, `s` with one decimal otherwise                                         | `342 ms`, `1.4 s`                        |
| Throughput    | `tok/s`, integer                                                                        | `87 tok/s`                               |
| Cost          | USD, dollar sign, four decimals under \$1, two decimals over                            | `$0.0042`, `$1.27`                       |
| Tokens        | Localized integer with thousands separator                                              | `1,247,332`                              |
| Bytes         | Binary units to two decimals                                                            | `4.21 MiB`                               |
| Counts        | Integer, thousands separator, no abbreviation under 100k                                | `42`, `12,847`                           |
| Big counts    | `1.2k` / `4.7M` only in metric cards, never in tables                                   | `1.2k`                                   |
| Timestamps    | Relative in tables (`3m ago`), absolute in detail views (`2026-04-28 14:32:09 UTC`)      | —                                        |
| Durations     | Compact: `2m 14s`, `4h 12m`, `3d 2h`. No `00:` padding.                                  | `2m 14s`                                 |
| Request IDs   | Monospace, truncated to last 8 chars in tables, full in detail, click to copy           | `…a1b2c3d4`                              |
| Model names   | Monospace, full name, never abbreviated                                                  | `claude-sonnet-4-6`                      |
| Provider name | Sans, with logo when available, color-coded chip (see §7.5)                              | `OpenAI`                                 |
| Booleans      | `Yes` / `No` in user-facing copy. `true` / `false` only inside JSON viewers              | —                                        |
| Empty cell    | `—` (em dash), `foreground-subtle`. Never `null`, never `N/A`, never blank.              | `—`                                      |

---

## 9. Iconography & motion

### 9.1 Icons

- lucide-react, default stroke `1.75`, default size `16px` in body, `14px` in tight rows, `20px` in headers.
- No filled icons. No mixing icon sets.
- Icons accompany labels in primary nav; icon-only is fine in row actions and the collapsed sidebar (always with a tooltip).

### 9.2 Motion

Restrained. Motion is for orientation and feedback, not for delight on this product.

- Standard duration: `150ms` for state changes, `200ms` for layout, `250ms` for sheets/dialogs.
- Standard easing: `cubic-bezier(0.16, 1, 0.3, 1)` (Radix's default).
- Honor `prefers-reduced-motion`. When set, disable all transitions except opacity ones under 100ms.
- No bounce. No spring. No staggered list reveals on a tool used eight hours a day.

---

## 10. Accessibility

Non-optional.

- Color contrast: all foreground/background pairings meet WCAG AA. Status colors meet AA when paired with their `*-foreground` token.
- Focus rings: 2px accent ring with 2px offset, visible on every interactive element. Never `outline: none` without a replacement.
- Every icon-only button has an `aria-label`.
- Every form field has a programmatic label.
- Every dialog traps focus and returns it to the trigger on close (shadcn handles this — don't break it).
- Tables have a caption or `aria-label` describing what they list.
- Keyboard: every action reachable, including row overflow menus and filter pills.

---

## 11. Density modes

A user-toggleable density preference, persisted, applied by setting `data-density="compact"` on `<html>`. Components consume this through CSS variables for row height and padding. Two modes only — `comfortable` (default) and `compact`. No third mode.

---

## 12. View-specific guidance

The pages below are the existing surfaces. The redesign does not introduce new views; it standardizes these.

### 12.1 Dashboard

Template: §6.2 Dashboard.

This is the one page where the design's expressive side gets to breathe. Metric cards are `rounded-xl` (the only place that radius appears in the regular UI), generously padded, and the numbers are large.

Top row, four metric cards: **Requests (24h)**, **Tokens (24h)**, **Cost (24h)**, **Avg latency (24h)**. Each card:

- Card label `text-xs foreground-muted uppercase tracking-wide` top-left.
- Time-window pill `rounded-full` top-right, mirroring the page-level window selector.
- Large value `text-3xl font-medium mono tabular foreground` (this is the only place `text-3xl` appears in the app).
- Delta chip beneath the value (`+4.2%` etc., see §7.5).
- A **capsule-bar sparkline** running across the bottom of the card: a series of small capsule-rounded bars in the user's accent, no axes, no labels. ~20–24 bars covering the time window. Reads at a glance and visually rhymes with the chart bars used elsewhere.

Below the metric row, a `2 col` chart row:

- **Request volume over time** (left, takes `2/3` width on `xl+`): line chart, primary accent series. With a "Compare to previous period" toggle in the chart header that overlays a thin violet line at lower opacity for the prior window. Time-range matches the page selector.
- **Cost by provider** (right, `1/3`): donut chart with provider chips (§7.5) listed beside it as a legend, each with its 24h dollar figure.

Below that, a third row split:

- **Top models (24h)**: capsule-bar chart, horizontal, sorted by request count, top 5 only, with the bar value (token count or cost — toggleable) printed at the right end of each bar in mono. Includes a "Compare to previous period" toggle that overlays a hatched diagonal-stripe bar (§7.9) behind each primary bar. Bar charts use the hatched-overlay pattern for compare; line charts use the secondary-line pattern.
- **Recent errors**: list of the last 5 failed requests, each row showing time, model, provider chip, status (`Error` pill), and a one-line error reason. Click → request detail (opens as Sheet per §12.2).

Page header: title `Dashboard`, time-window selector on the right (`24h` / `7d` / `30d` segmented control), a "Compare to previous period" toggle (the global default that the per-chart toggles inherit from), and a manual refresh icon button. Auto-refresh: TanStack Query polls at 15s while the tab is foregrounded, pauses when not.

### 12.2 Request Logs

Template: §6.2 List.

Primary table. Columns, in order: Time, Status, Model, Provider, In format, Out format, Tokens (in/out), Cost, Latency, ID. Default sort: time desc.

Filters (sticky bar): time range (preset chips: `15m` / `1h` / `24h` / `7d` / custom), status (multi-select), model (multi-select with search), provider (multi-select), API format (chips).

**Detail view**: clicking a row opens the request detail. The display rule is responsive but the route is constant:

- The route is always `/logs/:id` — deep-linkable, shareable, browser-back works correctly.
- On `lg+` viewports (≥ 1024px), the detail renders as a right-side **Sheet** (640–720px wide) overlaying the list, leaving the table visible. This optimizes the core triage workflow: clicking down a list of failed requests without losing place. Closing the sheet returns to `/logs`.
- On smaller viewports the same route renders the detail full-page (template: §6.2 Detail), since there isn't room to overlay.
- "Open in full page" link in the sheet header switches modes manually.
- Detail tabs: **Request**, **Response**, **Trace** (provider hops), **Metadata**.
- Keyboard: `j`/`k` navigate to next/previous row's detail without closing the sheet; `esc` closes.

This is the page where the JSON viewer (§7.8) earns its keep.

### 12.3 Providers

Template: §6.2 List.

Columns: Name, Type, Status (§7.4), Cooldown (if any, with countdown), Models served (count, hover for list), Last used, Success rate (24h), Actions.

Row click → provider Detail. Detail rail shows config; tabs are **Models**, **Recent requests**, **Cooldown history**, **Settings**.

"New provider" is a Sheet (§7.6), not a separate page.

### 12.4 Model Aliases

Template: §6.2 List.

Columns: Alias, Type (chat/embed/transcribe), Targets (count + small stacked provider chips), Selector (random/cost/latency/in_order), Last used, Status.

Detail tabs: **Targets** (reorderable list with weights for cost/latency selectors), **Usage**, **Settings**.

The Targets editor is the single most error-prone screen in the current app — it deserves the most care. Drag-to-reorder, in-row edit of weights, an "add target" search-input that types-ahead from existing providers, and a live preview on the right showing which target a synthetic request would route to.

### 12.5 Quotas

Template: §6.2 List, with progress bars in the table.

Columns: Name, Scope (key / global), Limit type, Limit, Window, Used (with progress bar — `success` under 70%, `warning` 70–95%, `danger` over 95%), Resets, Status.

### 12.6 OAuth Providers

Template: §6.2 List.

Columns: Provider, Account, Status (§7.4), Expires, Last refresh, Actions (refresh, revoke).

Adding a new OAuth provider is a multi-step Sheet: choose provider → display device code / paste login URL → poll for completion. The polling step has a clear visual: monospace device code, a "copy" button, a countdown to expiry, and a manual "I've finished" cancel.

### 12.7 MCP Servers

Template: §6.2 List.

Columns: Name, URL, Tools (count), Status, Last connection.

Detail tabs: **Tools** (introspected tool list), **Recent invocations**, **Settings**.

### 12.8 API Keys

Template: §6.2 List.

Columns: Name, Prefix (mono, e.g. `pk_live_a1b2…`), Quotas (chips), Created, Last used, Actions.

Creating a key: Sheet → on success, the full secret is shown **once** in a copy-to-clipboard surface with a visible warning that it will not be shown again. This is the only place in the app where a primary action's result is communicated through a full-screen-ish surface and not a toast.

### 12.9 Settings

Template: §6.2 Form, with a sub-nav (left rail) of sections: **General**, **Authentication**, **Encryption**, **Database**, **Theme**, **About**.

The **Theme** section is where the three-way mode (§3.1) lives, alongside the accent picker (§3.4) and the density toggle (§11). Layout: theme mode at top (segmented control: Light / Dark / System), accent picker beneath (six rounded-full swatches with the active one check-marked), density toggle at the bottom (segmented control: Comfortable / Compact). All three update live with no save button — the change is the save.

The **Encryption** section makes it visible whether `ENCRYPTION_KEY` is set; if not, a `warning`-tinted card explains the consequence.

---

## 13. What to remove from the current UI

Carrying these into the redesign would re-introduce the inconsistency this document exists to prevent:

- Any one-off page header pattern that isn't one of the four templates in §6.2
- Any custom Button, Input, Select, or Modal not derived from shadcn
- Inline destructive controls in table rows
- Toasts that confirm actions whose effects are already visible on screen
- Any color used outside the token set
- Any font outside the three families in §4.1
- Spinners in place of skeletons for table loading
- "N/A" / blank cells where `—` belongs
- Mixed icon libraries

---

## 14. How agents should use this document

When Claude Code or any AI assistant builds a frontend change in this repo:

1. Read this file first. If the change affects multiple files, re-read the relevant section before each substantive edit.
2. Read the matching page section in §12 if a page is being touched.
3. Reach for shadcn primitives before writing custom JSX. If the primitive doesn't exist, run `bunx shadcn add <component>` rather than hand-rolling.
4. If a token does not exist for a value being introduced, **stop and add the token**. Do not inline a one-off value and "come back to it."
5. If a request requires deviating from this document, surface that explicitly in the PR description with a proposed amendment to this file. Don't quietly diverge.

---

## 15. Open questions / TODO

Decided:

- Default accent: **blue** (`#2563EB`). User-selectable from a fixed palette of six (blue / green / orange — vivid; violet / rose / amber — muted). See §3.4 for hexes.
- Accent is implemented as a CSS-variable indirection driven by `data-accent` on `<html>`; the chart palette's primary series follows the accent automatically, with a documented swap rule when the accent collides with the secondary chart hue.
- Light theme is paper-warm (`--background` = `#F6F4EE`); dark theme is true near-black with a slight cool cast (`--background` = `#0A0B0E`). Concrete hexes for both themes are in §3.2.
- Card separation in light theme uses 1px borders; shadows are reserved for popovers, dropdowns, dialogs.
- Chart palette: accent → violet → green → cyan → muted, fixed order.
- Pills: `rounded-full`, tinted-fill, prominent. Confirmed signature secondary visual.
- Chart bars: capsule-ended.
- Chart tooltip: connected-callout (pill anchored to data point with a guide line) for single-series; card-with-dots for multi-series.
- Both light and dark themes are first-class.
- Fonts: **Geist** (sans) and **Geist Mono** (mono). Tabular numerals globally enabled.
- Logo: small geometric mark + `Plexus` wordmark in Geist 600 when sidebar expanded; mark only when collapsed. Mark stays monochrome (uses `--foreground`), independent of accent.
- Provider chip colors: hybrid — desaturated hues that lean toward each provider's brand identity but remain stable across themes. See §7.5.1.
- API format chip colors: tied to the source brand of each API shape (OpenAI=green, Anthropic=orange, Gemini=blue, Responses=violet). Stable across users and themes. See §7.5.2.
- Request-log Detail: route is always `/logs/:id`; renders as right-side Sheet on `lg+`, full page on smaller. Keyboard `j`/`k` navigation, `esc` to close.
- Dashboard compare-against pattern: secondary-line overlay for line charts, hatched-bar overlay for bar charts, with both a global toggle in the page header and per-chart toggles that inherit from it.
- Metric-card sparkline style: capsule bars (matches the chart-bar identity used elsewhere).

Still open — these need real screens to settle:

- [ ] **Hex refinement.** The values in §3.2 and §3.4 are working baselines. Once the first three pages exist (Dashboard, Request Logs, Providers) in both themes with each accent option, audit contrast and warmth and adjust ±2–4 lightness steps as needed.
- [ ] **Logo mark design.** A geometric mark exists in concept (see §6.1) but has not been drawn. Brief: monochrome, recognizable at 16px, suggestive of routing/multiplexing without being literal. Out of scope for the redesign PR; can be temporarily a typeset glyph or a placeholder shape.
- [ ] **Provider hue verification.** The §7.5.1 mid-step hexes work in isolation; verify they hold up when several provider chips appear together in a single row of the request log.

Future / parking lot:

- [ ] Wallpaper-derived accent on platforms that expose accent color (macOS, Windows). Low priority.
- [ ] A "high-contrast" theme variant for accessibility, separate from light/dark. Out of scope for v1.

---

*Last updated: initial draft. Edit history lives in git.*
