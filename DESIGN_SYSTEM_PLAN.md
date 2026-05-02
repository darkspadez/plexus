# Plexus Design System — Implementation Plan

## Implementation status (live)

- [x] **Phase 0** — Foundation: tokens, themes, accent, density, FOUC boot
      script, Geist fonts, providers (Theme, Accent, Density, TanStack
      Query, Sonner), shadcn `components.json`, new deps installed.
- [x] **Phase 1** — App shell: new `TopBar` (theme/accent/density/user
      menu), `AppSidebar` (design-doc nav grouping with active accent
      bar, collapse persistence, monochrome logo, tooltips), `PageShell`,
      `MainLayout` rewired.
- [x] **Phase 2** — Primitives + chips + charts: 21 shadcn primitives
      vendored (with `cn` import retargeted and tokens remapped from
      shadcn defaults to design-doc names), project chips
      (`Pill`/`StatusPill`/`StatusDot`/`ProviderChip`/`ApiFormatChip`/
      `ModelChip`/`DeltaChip`), chart wrappers (`Sparkline`/`LineChart`/
      `BarChart`/`DonutChart`) with capsule bars and chart-palette
      tokens, page templates (`ListPage`/`DashboardPage`/`DetailPage`/
      `FormPage`), `format-design.ts` formatters, `/dev/sandbox` route.
- [x] **Phase 3** — Quotas migrated as the canonical recipe (TanStack
      Query, TanStack Table, status pills, threshold-colored progress
      bars, sonner, design-doc empty/error/loading states).
- [x] **Phase 4 (partial)** — Dashboard fully migrated to the new
      design (DashboardPage template, capsule-bar metric cards with
      sparklines, time-window pills with localStorage persistence,
      LineChart for request volume, RecentErrors panel with
      provider/model chips and StatusPill, TanStack Query polling).
      MyKey fully migrated to FormPage + shadcn Dialog/Switch/Card +
      sonner. SystemLogs wrapped with ListPage chrome. Errors and Debug
      retain their custom edge-aligned layouts (full-width detail
      panels) but render under the new shell.
- [x] **Phase 5** — Logs fully migrated per §12.2: TanStack Query +
      TanStack Table with the design-doc columns, time-window filter
      chips, cursor-style Newer/Older pagination, `/logs/:id` Sheet on
      lg+ / DetailPage on smaller, `j`/`k`/`esc` keyboard nav, JsonTree
      viewer with §7.8 coloring, Request/Response/Trace/Metadata tabs.
- [x] **Phases 6–7 (chrome only)** — Keys, MCP, Models, Providers
      wrapped in the new ListPage template so they sit consistently
      under the new app shell. Their internal logic (cards/modals/
      tables) still uses legacy `components/ui/*` primitives that
      render correctly through the legacy token aliases. **Full
      content migrations are pending** — see "Remaining" below.
- [x] **Errors / Debug fixes** — replaced the negative-margin tricks
      that were left over from the old MainLayout's outer padding so
      content no longer overflows the viewport edge.
- [x] **Partial cleanup** — deleted legacy `components/layout/AppBar.tsx`
      and `components/layout/Sidebar.tsx` (replaced by TopBar +
      AppSidebar in Phases 1-2).
- [x] **Theme settings UI** added to `Config` page (`ThemeSection`).
- [x] **Agent docs** — root `AGENTS.md` and `packages/frontend/AGENTS.md`
      both point at `DESIGN_SYSTEM.md` and describe the migration recipe.

Remaining (legacy aliases keep these rendering until migrated):

- [ ] **Phase 6 content** — Keys: split into `pages/keys/` subdir, use
      shadcn Table + react-hook-form/zod schemas, Sheet-based create
      flow, one-time-secret display per §12.8. MCP: detail tabs (Tools,
      Recent invocations, Settings), provider chip integration. Models:
      split into `pages/models/`, refresh the Targets editor with
      drag-to-reorder + weight inputs + live preview pane (most
      important sub-feature per §12.4).
- [ ] **Phase 7 content** — Providers: split into 4–6 files, full
      migration of the OAuth multi-step Sheet (device-code flow,
      countdown, manual cancel), restyled quota config sub-components
      under new tokens.
- [ ] **Phase 8** — Delete `src/components/ui/` legacy dir (currently
      blocked by Errors/Debug/Keys/MCP/Models/Providers usage), drop
      legacy token aliases at the bottom of `tokens.css`, retire
      `ToastContext`, trim `lib/api.ts` TTL cache.

The `Quotas` migration (`src/pages/Quotas.tsx` + `src/pages/quotas/*`)
is the recipe for List pages; the `Logs` migration (`src/pages/Logs.tsx`
+ `src/pages/logs/*`) is the recipe for List + Detail Sheet pages with
keyboard navigation. Copy their shape for any pending content migration.

---

## Context

The Plexus admin UI (`packages/frontend`) was built incrementally and is visibly inconsistent — mixed spacings, ad-hoc table styles, multiple ways to render the same primitive (status, provider chip, model tag), and one-off page headers. The design-doc author has produced a v0.3 spec (the `# Plexus Design System` doc the user pasted) that locks in: a four-layer token system with light/dark/system themes and a six-option user-selectable accent; pill-shaped chips and capsule-ended chart bars as signature visuals; four page templates (List, Dashboard, Detail, Form); and a shadcn/ui-based component foundation with TanStack Query, TanStack Table, react-hook-form + zod, sonner, Recharts, lucide, Geist + Geist Mono.

The current frontend is materially different from that spec on every axis: single dark theme only, 23 bespoke `components/ui/*` primitives (no shadcn), Space Grotesk + DM Sans fonts, raw `fetch()` with manual TTL caches, hardcoded chart colors. All 12 pages exist but none conform to a template system. The build is Bun's native bundler (not Vite) compiling Tailwind v4 via `@tailwindcss/cli` — the design doc's mention of Vite is incorrect; we keep Bun's bundler per `AGENTS.md` ("do not introduce a second one").

This plan migrates all of it: foundation first, then shell, then page-by-page. Critical mechanism: legacy token aliases let unmigrated pages keep rendering during the transition, so the app stays shippable between phases and individual page migrations can land as separate PRs.

**User decisions confirmed:**
- Full implementation across all 8 phases.
- Off-spec pages (Debug, Errors, MyKey, SystemLogs) get redesigned too; they conform to the standard templates rather than being left on legacy styling or deleted.

---

## Land the design doc itself first

The design doc is the source of truth for every later decision. Before any code changes:

- **Save the doc to `packages/frontend/DESIGN_SYSTEM.md`** verbatim. This is the file future agents read.
- **Update `packages/frontend/AGENTS.md`** with a short pointer block at the top: "All visual/interaction decisions for this package are governed by `DESIGN_SYSTEM.md`. When that doc and this one disagree on look/feel, the design doc wins; this file wins for engineering rules (build, deps, file layout)."
- **Update root `AGENTS.md`** with one line under the frontend section pointing to the same file.

This is non-negotiable infrastructure — every later phase references this file, and the design doc explicitly requires that "agents read this file first."

---

## Phase 0 — Land bridges (no UI changes visible)

Goal: every later phase depends on these. The app must look pixel-identical after Phase 0 completes.

1. **`index.html` boot script.** Edit `packages/frontend/index.html` to add a synchronous inline `<script>` *before* the bundler `<script src="main.js">` tag. It reads `localStorage.getItem('plexus.theme')` (default `dark`), resolves `system` to `prefers-color-scheme`, then sets `document.documentElement.dataset.theme`. Same pattern for `localStorage.getItem('plexus.accent')` (default `blue`) → `dataset.accent`. This is the only FOUC-prevention strategy that works under Bun's bundler.

2. **Token CSS rewrite at `src/styles/tokens.css`** (new file, imported from `globals.css`). Declare the four-layer token set from §3.2/§3.4 of the design doc:
   - `:root` declares Layer 1 primitives (neutrals, named accent scales, status scales, chart secondary hues).
   - `[data-theme="light"]` and `[data-theme="dark"]` set Layer 2 semantics (`--background`, `--surface`, `--surface-elevated`, `--surface-sunken`, `--border`, `--border-strong`, `--foreground`, `--foreground-muted`, `--foreground-subtle`).
   - `[data-accent="blue"]` … `[data-accent="amber"]` set Layer 3 (`--accent`, `--accent-foreground`, `--accent-subtle`).
   - Layer 4 (`--chart-1` … `--chart-5`) is declared once with `--chart-1: var(--accent)`. Add the §3.4 collision-swap rule (`[data-accent="violet"] { --chart-2: <rose-500>; }`).
   - **Crucial:** at the end of the file, alias every legacy token name from the existing `globals.css` to its closest semantic equivalent (`--color-primary: var(--accent)`, `--color-bg-card: var(--surface)`, `--color-text: var(--foreground)`, `--color-text-secondary: var(--foreground-muted)`, etc.). These aliases are the bridge that keeps unmigrated pages rendering. They get deleted in Phase 8.

3. **`src/globals.css`** keeps its `@theme` block but the values are rewritten to read from the semantic tokens (`--color-background: var(--background)` etc.) so Tailwind v4 utilities like `bg-background`, `text-foreground`, `bg-accent` resolve at build time to `var(...)` references that flip per-theme at runtime. This is the highest-risk technical step — verify with a one-element page that switching `data-theme` on `<html>` changes a `bg-background` element with no rebuild.

4. **`src/lib/cn.ts`**: trivially `import { clsx } from 'clsx'; import { twMerge } from 'tailwind-merge'; export const cn = (...inputs) => twMerge(clsx(inputs));`. Add `tailwind-merge` to deps.

5. **Geist + Geist Mono.** Add the `geist` package, configure self-hosted via `@font-face` in `tokens.css`. Confirm `build.ts` already copies `src/assets`. Set `font-feature-settings: "tnum", "ss01"` on `body` in `globals.css` for tabular numerals.

6. **`ThemeProvider` + `AccentProvider`** at `src/contexts/ThemeContext.tsx` and `AccentContext.tsx`. Each exposes a hook + a setter that updates `dataset` and `localStorage`. **Hydrate from existing `dataset` value, do not re-set on mount** (FOUC defence — the boot script already set the right value).

7. **shadcn install path: vendor manually, no CLI `init`.** Create `components.json` minimally (paths to `~/components/ui-v2`, style `default`, base color `neutral`, css var indirection), then for each later component `bunx shadcn@latest add <name>` (which only writes that file's source). Components land in `src/components/ui-v2/` so the legacy `src/components/ui/` keeps working unchanged. Replace each shadcn import path of `@/lib/utils` → `~/lib/cn` (or set up a tsconfig alias and conform).

8. **TanStack Query provider** wired in `src/main.tsx` with a `QueryClient` (sane defaults: 30s `staleTime`, retry 1, refetchOnWindowFocus disabled). `lib/api.ts` keeps working untouched — Phase 0 does not migrate any data hooks.

9. **`<Toaster />`** (sonner) mounted once in `App.tsx`. Existing `ToastContext` stays for legacy callers; new code uses `toast()` directly.

10. **New deps to add (Bun, verify each builds):** `tailwind-merge`, `geist`, `@tanstack/react-query`, `@tanstack/react-table`, `react-hook-form`, `zod`, `@hookform/resolvers`, `sonner`, `date-fns`, `class-variance-authority` (shadcn dep).

**Critical files in Phase 0:**
- `packages/frontend/index.html` (boot script)
- `packages/frontend/src/globals.css` (rewire to semantic tokens)
- `packages/frontend/src/styles/tokens.css` (new)
- `packages/frontend/src/lib/cn.ts` (new)
- `packages/frontend/src/contexts/ThemeContext.tsx` (new)
- `packages/frontend/src/contexts/AccentContext.tsx` (new)
- `packages/frontend/src/main.tsx` (QueryClientProvider, ThemeProvider, AccentProvider)
- `packages/frontend/src/App.tsx` (Toaster mount)
- `packages/frontend/components.json` (new)
- `packages/frontend/package.json` (new deps)

**Verification for Phase 0:** `bun run dev`; (1) DevTools shows `<html data-theme="dark" data-accent="blue">` set before any paint; (2) every existing page renders pixel-identically to before; (3) toggling `dataset.theme` manually in DevTools flips the page colors without a reload; (4) `bunx shadcn@latest add button` succeeds and the resulting `components/ui-v2/button.tsx` builds.

---

## Phase 1 — App shell

Replace `src/components/layout/{MainLayout,AppBar,Sidebar}.tsx` with the new shell from §6.

1. **TopBar** (48px, sticky, full width minus sidebar): logo+wordmark sits inside the sidebar column per §6.1, NOT in the TopBar. TopBar contains: env badge, search (placeholder for now), theme toggle (segmented Light/Dark/System), accent picker dropdown, user menu.
2. **Sidebar** (224px expanded / 56px collapsed; persist in `localStorage` under `plexus.sidebar`): groups per §6.3 — Observability, Routing, Access, Integrations, Settings. Active item: accent-tinted background + 3px accent left-bar. Group headers `text-xs uppercase tracking-wide foreground-subtle`.
3. **`PageShell` component** wraps children, handles the responsive sidebar collapse on `md`, slide-out sheet on `sm`.
4. **Logo mark stays monochrome** (uses `--foreground`), wordmark in Geist 600. Keep the existing PNG as a placeholder for the geometric mark — the design doc explicitly notes the mark hasn't been drawn (§15 TODO).
5. **Theme + accent controls** wire to the Phase 0 contexts. Live preview, no save button.

**Critical files:** `src/components/layout/{TopBar,Sidebar,PageShell}.tsx` (rewrites), `src/App.tsx` (wraps routes in `PageShell`).

**Verification:** every existing route still loads inside the new shell; sidebar collapse persists across reloads; theme toggle flips all three modes correctly; accent picker swaps all six accents and the active sidebar item color follows; nothing in console; manually visit every nav item.

---

## Phase 2 — Page templates + shadcn primitives + project chips

Build the parts depot. No page is migrated yet; demonstrated on a hidden `/dev/sandbox` route.

1. **Vendor shadcn primitives** into `src/components/ui-v2/`: `button`, `input`, `card`, `badge`, `tabs`, `dialog`, `sheet`, `dropdown-menu`, `select`, `tooltip`, `skeleton`, `form`, `label`, `separator`, `table`, `popover`, `command`, `checkbox`, `switch`, `progress`, `alert`. Each: shadcn source, with `@/lib/utils` retargeted to project's `cn`.
2. **Page-template wrappers** at `src/components/templates/{ListPage,DashboardPage,DetailPage,FormPage}.tsx`. Each takes `title`, `subtitle`, `actions`, optional `filters`, and `children`. They enforce §6.2 layout — page padding (`p-6` / `p-8` on `lg+`), section vertical rhythm (`space-y-6`), max-width on form pages (640px).
3. **Project-specific components** (not shadcn — they're convention enforcement):
   - `src/components/chips/Pill.tsx` — `rounded-full`, tinted-fill, accepts `tone` (`neutral|accent|success|warning|danger|info`), `size` (`sm|default`).
   - `src/components/chips/StatusDot.tsx` and `StatusPill.tsx` — fixed vocab from §7.4 as a literal-union type.
   - `src/components/chips/ProviderChip.tsx` — takes a provider id, looks up hue from a fixed `providerColors` map (see §7.5.1), renders pill with optional 12px logo from `src/assets/providers/`.
   - `src/components/chips/ApiFormatChip.tsx` — fixed map from §7.5.2.
   - `src/components/chips/ModelChip.tsx`, `DeltaChip.tsx`.
4. **Chart palette wrapper** at `src/components/charts/`: `<LineChart>`, `<BarChart>` (with capsule-rounded radius), `<DonutChart>`, `<Sparkline>` (capsule-bar). Each defaults series colors to `var(--chart-1)`…`var(--chart-5)` via inline style — Recharts reads colors at render so this works. Custom tooltip per §7.9 (connected-callout pill for single-series; card-with-dots for multi).
5. **`/dev/sandbox`** route renders one of every primitive in both themes, all six accents, comfortable + compact density. Used as the visual review surface for later phases.

**Critical files:** `src/components/ui-v2/*` (vendored), `src/components/templates/*` (new), `src/components/chips/*` (new), `src/components/charts/*` (new), `src/pages/Sandbox.tsx` (new), `src/App.tsx` (sandbox route).

**Verification:** sandbox shows every primitive correctly across all theme × accent combos; no Recharts default colors visible; capsule bar caps render; pill colors match design doc tables; bundle builds.

---

## Phase 3 — First page migration: Quotas (recipe page)

Migrate `src/pages/Quotas.tsx` (~352 LOC) end-to-end as the canonical recipe future migrations copy. Goal: discover everything missing from Phases 0–2 and circle back.

The recipe to establish:
1. **Data**: replace `lib/api.ts` calls with TanStack Query hooks at `src/hooks/queries/useQuotas.ts`. Old `api.ts` functions stay; new code uses Query.
2. **List**: TanStack Table + shadcn `Table`. Implement column rules from §7.3 — header `text-xs uppercase`, body `text-sm`, no zebra, hover `surface-elevated`, selected `accent/10` + 2px accent left-bar, comfortable/compact density toggle reading from `data-density` on `<html>`.
3. **Form** (create/edit quota): shadcn `Form` + `react-hook-form` + `zod`. Schema co-located in `src/pages/quotas/quota-form-schema.ts`. Render in a `Sheet` (>4 fields).
4. **Status**: status pills using §7.4 vocab. Map backend `ok|warning|critical|exhausted` → `Active|Active|Exceeded|Exceeded` (verify with backend); map quota-progress thresholds per §12.5.
5. **Empty state** per §7.10. **Loading** = skeleton rows. **Error** = `danger`-tinted card.
6. **Toasts** via sonner. Per §7.7, do NOT toast successful saves whose effect is visible on screen.

**Critical files:** `src/pages/Quotas.tsx` (rewrite), `src/pages/quotas/{quota-form-schema.ts, QuotaForm.tsx, QuotaTable.tsx}` (new), `src/hooks/queries/useQuotas.ts` (new).

**Verification:** all CRUD operations work; theme/accent switch live without reload; both densities render correctly; keyboard navigation reaches every action; status pills use correct vocab; empty/loading/error states each visible by forcing them.

---

## Phase 4 — Read-mostly pages

Migrate the simple display pages in this order: **Dashboard → MyKey → SystemLogs → Errors → Debug**. They build muscle on the recipe and retire chunks of the legacy `components/ui/*` (replace `Card`, `Badge`, `EmptyState`, `Skeleton`, `DataTable` usages).

Per page:
- **Dashboard** (§12.1): four metric cards with capsule-bar sparklines (`text-3xl mono tabular`), 2-col chart row (Request volume line chart + Cost-by-provider donut), bottom row (Top models bar + Recent errors list). Page header has time-window segmented control + global compare toggle + manual refresh. TanStack Query polls at 15s while foregrounded.
- **MyKey**: a Form template page; show user's API key fingerprint, usage charts, regenerate flow.
- **SystemLogs**: List template, table of system events. Status pills. Sticky filter bar.
- **Errors**: List template, error log with one-line reason + provider/model chips. Click → detail Sheet on `lg+`.
- **Debug**: List or Detail depending on current usage; standardize whatever it does.

**Critical files:** `src/pages/{Dashboard,MyKey,SystemLogs,Errors,Debug}.tsx` (rewrites), associated `hooks/queries/*`, dashboard subcomponents under `src/pages/dashboard/`.

**Verification per page:** matches its template, both themes look correct under all six accents, data loads via TanStack Query (no more `lib/api.ts` raw calls in migrated code), capsule bar caps visible, status vocab correct.

---

## Phase 5 — Logs (with `/logs/:id` Sheet pattern)

Migrate `src/pages/Logs.tsx` (1,277 LOC). This phase lands the keyboard-nav Sheet pattern that other detail surfaces reuse.

1. **List view** at `/logs` per §12.2: columns Time, Status, Model, Provider, In format, Out format, Tokens (in/out), Cost, Latency, ID. Sticky filter bar with preset chips (`15m`/`1h`/`24h`/`7d`/custom).
2. **Detail route** `/logs/:id`: on `lg+` (≥1024px) renders as right-side `Sheet` (640–720px) overlaying the list, leaving the table visible behind. On smaller viewports the same route renders full-page using the Detail template. "Open in full page" link in sheet header.
3. **Tabs**: Request, Response, Trace, Metadata.
4. **JSON viewer** at `src/components/code/JsonTree.tsx` — collapsible tree on `--surface-sunken`, key/value coloring per §7.8.
5. **Keyboard**: `j`/`k` next/prev row's detail without closing sheet; `esc` closes. Scoped to the `/logs` page.
6. **Cursor pagination** ("Newer"/"Older") per §7.3.

**Critical files:** `src/pages/Logs.tsx`, `src/pages/logs/{LogTable,LogDetailSheet,LogDetailPage,JsonTree,*Tab}.tsx`, `src/hooks/queries/useLogs.ts`, `src/App.tsx` (route for `/logs/:id`).

**Verification:** click a row → sheet slides in, table still visible; refreshing on `/logs/:id` reproduces sheet state on `lg+`, full page on narrow; `j`/`k`/`esc` work; JSON tree renders with correct value coloring in both themes; deep-link share works; back button returns to `/logs`.

---

## Phase 6 — Mid-size form-heavy pages: Keys, MCP, Models

Migrate in order, each its own PR.

- **Keys** (§12.8, ~999 LOC): list with prefix mono, quotas chips, last-used. Create-key Sheet → on success show full secret in a copy-to-clipboard surface with "shown only once" warning per §12.8 (the only place a primary action's result is full-screen rather than toast).
- **MCP** (§12.7, ~871 LOC): list of MCP servers, detail tabs (Tools, Recent invocations, Settings).
- **Models** (§12.4, ~2,415 LOC): the Targets editor is the highest-care surface. Drag-to-reorder via existing `@dnd-kit/*` integration (already in deps), in-row weight edit, type-ahead "add target" search, live preview pane showing which target a synthetic request would route to. Split the file during migration — do not migrate as one monolith. Subdir `src/pages/models/` with `{ModelsList,AliasDetail,TargetsEditor,*}.tsx`.

**Critical files:** `src/pages/Keys.tsx`, `src/pages/Mcp.tsx`, `src/pages/Models.tsx` (split into `src/pages/models/*`), associated form schemas + queries.

**Verification per page:** matches design doc §12 page sections; the API-key one-time-display flow works (key only visible once); Targets editor's drag, weight edit, type-ahead, live preview all function; bundle size delta acceptable.

---

## Phase 7 — Providers (the boss)

`src/pages/Providers.tsx` (3,857 LOC) is the largest surface and contains the OAuth subflow. Plan to split into 4–6 files. Treat each major tab/section as its own PR landing.

1. **List** (§12.3): name, type, status (with cooldown countdown when applicable), models served (count + hover list), last used, success rate (24h), actions overflow.
2. **Detail Sheet → Detail page** with tabs Models, Recent requests, Cooldown history, Settings.
3. **New provider** = Sheet with the existing 22 provider-specific quota config components from `src/components/quota/*` (verify each renders correctly inside the new Sheet — they're not deleted, but their styling needs to read from new tokens).
4. **OAuth subflow** (§12.6) is the trickiest piece: multi-step Sheet (choose provider → display device code / paste login URL → poll for completion). Monospace device code, copy button, expiry countdown, manual cancel. This was historically a separate page; it now lives inside Providers per the design doc treating OAuth as a provider type.

**Critical files:** `src/pages/Providers.tsx` (split into `src/pages/providers/*` with `{ProvidersList,ProviderDetail,ProviderForm,OAuthFlow,*}.tsx`).

**Verification:** every provider type creatable; OAuth flow completes end-to-end (device code → polling → success); cooldown countdown updates live; the 22 quota config subcomponents render correctly under new tokens.

---

## Phase 8 — Cleanup

Once all pages are migrated:

1. **Delete `src/components/ui/`** (the legacy bespoke components). grep first to confirm zero imports remain.
2. **Delete legacy token aliases** from `tokens.css`. Run a build — any compile errors point to lingering legacy callers; fix or migrate them.
3. **Remove `src/contexts/ToastContext.tsx`** if all callers have moved to `toast()` from sonner.
4. **Trim `src/lib/api.ts`** — keep functions still in use by anything outside React (e.g. auth bootstrap). The TTL cache maps are removed (TanStack Query owns caching).
5. **Update `packages/frontend/AGENTS.md`** to state: "All UI components are in `src/components/ui-v2/` (shadcn) or `src/components/{chips,charts,templates}/` (project conventions). The legacy `components/ui/` has been removed. New components must follow `DESIGN_SYSTEM.md` §7 conventions."
6. **Bundle-size delta** logged in PR description for visibility.

**Verification:** `grep -r "from.*components/ui[/'\"]"` returns zero hits in `src/`; `grep -r "color-primary\|color-bg-card\|color-text-secondary"` (legacy token names) returns zero hits in `src/`; `bun run build` produces a working `dist/`; manual smoke test of every page in both themes and at least two accents.

---

## Reused existing assets

- **Recharts** is already a dep — keep it. Wrap with chart palette per Phase 2.
- **`lucide-react`** already in deps — keep it as the single icon library.
- **`@dnd-kit/*`** already in deps — keep for the Targets editor in Phase 6.
- **Logo PNG** at `src/assets/plexus_logo_transparent.png` — keep as placeholder for the §15-TODO geometric mark; render monochrome via CSS filter or SVG conversion in Phase 1.
- **Favicons** at `src/assets/{favicon.ico,…}` — unchanged.
- **22 provider quota config components** at `src/components/quota/*` — keep, restyle via new tokens, render inside new Provider creation Sheet in Phase 7.
- **`useToast`** existing context — keep through Phase 4 for legacy pages, retire in Phase 8.
- **Backend `lib/api.ts`** — keep functions, gradually wrap each in a TanStack Query hook during page migrations.

## Status-vocab mapping (frontend-only translation)

The backend returns `ok|warning|critical|exhausted` for meters and `connected|disconnected|connecting|error|neutral|warning` for badges. The design doc fixes the vocab to `Healthy|Degraded|Cooldown|Disabled|Active|Idle|Exceeded|Expired|Refreshing|Error`. Translation lives at `src/lib/status-vocab.ts` (new) — a pure function from backend literal → design-doc literal. Do not change backend semantics.

## Risks / failure modes (carry forward into execution)

1. **Tailwind v4 `@theme` × `[data-theme]` interplay** — verify in Phase 0 with a one-element test before building anything else.
2. **FOUC** — single subtle bug in the boot script equals every reload flashing the wrong theme. Test under throttled network.
3. **shadcn `cn()` import paths** — every vendored file imports `@/lib/utils`. Pick a strategy (tsconfig alias OR sed-replace on copy) and apply consistently across all vendored components.
4. **Recharts CSS-variable colors** — pass `var(--chart-1)` via inline `style`/props, not Tailwind class names; default Recharts colors are easy to leak.
5. **Models.tsx and Providers.tsx** — budget 2× initial estimates. Plan to split files during migration, not after.
6. **Bun bundler + new deps** — verify each new dep (`react-hook-form`, `zod`, `@tanstack/react-query`, `@tanstack/react-table`, `tailwind-merge`, `sonner`, `date-fns`, `geist`, `class-variance-authority`) builds cleanly under Bun before relying on them in Phase 1.
7. **Backend status-field semantics drifting** from the frontend's mapping — keep `src/lib/status-vocab.ts` exhaustive (TS literal-union exhaustiveness check) so a new backend status fails the type-check rather than silently rendering "Error".

## End-to-end verification (post-Phase-8)

- Open every route. In both themes, on at least three accents (blue, orange, violet — picks a vivid, a vivid that contrasts with light, and a muted that triggers the chart-2 swap rule). No console errors.
- Toggle density. Sidebar collapse persists.
- Create + edit + delete in each CRUD surface (Quotas, Keys, Providers, Models, MCP).
- Logs `/logs/:id` deep-link from a fresh tab → sheet renders on `lg+`, full page on a narrow window.
- OAuth flow end-to-end with a real provider.
- Backend smoke: hit `/v0/management/usage` etc.; nothing 500s.
- Bundle built by `bun run build` works when served by the Bun/Hono backend at `/ui/`.
- `bun test` (existing tests in `src/lib/normalize.test.ts`) still passes.
- grep confirms no legacy token names, no legacy `components/ui/` imports.
- Visual review across all 12 pages in `/dev/sandbox` companion.

---

## Critical files (consolidated reference)

**Foundation (Phase 0):**
- `packages/frontend/index.html`
- `packages/frontend/src/globals.css`
- `packages/frontend/src/styles/tokens.css` (new)
- `packages/frontend/src/lib/cn.ts` (new)
- `packages/frontend/src/lib/status-vocab.ts` (new)
- `packages/frontend/src/contexts/{ThemeContext,AccentContext}.tsx` (new)
- `packages/frontend/src/main.tsx`
- `packages/frontend/src/App.tsx`
- `packages/frontend/components.json` (new)
- `packages/frontend/package.json`

**Shell (Phase 1):**
- `packages/frontend/src/components/layout/{TopBar,Sidebar,PageShell}.tsx`

**Templates + primitives (Phase 2):**
- `packages/frontend/src/components/ui-v2/*` (shadcn vendored)
- `packages/frontend/src/components/templates/{ListPage,DashboardPage,DetailPage,FormPage}.tsx`
- `packages/frontend/src/components/chips/{Pill,StatusPill,StatusDot,ProviderChip,ApiFormatChip,ModelChip,DeltaChip}.tsx`
- `packages/frontend/src/components/charts/{LineChart,BarChart,DonutChart,Sparkline}.tsx`
- `packages/frontend/src/pages/Sandbox.tsx`

**Page migrations (Phases 3–7):**
- `packages/frontend/src/pages/Quotas.tsx` + `src/pages/quotas/*`
- `packages/frontend/src/pages/Dashboard.tsx` + `src/pages/dashboard/*`
- `packages/frontend/src/pages/{MyKey,SystemLogs,Errors,Debug}.tsx`
- `packages/frontend/src/pages/Logs.tsx` + `src/pages/logs/*`
- `packages/frontend/src/pages/Keys.tsx`, `Mcp.tsx`
- `packages/frontend/src/pages/Models.tsx` → `src/pages/models/*`
- `packages/frontend/src/pages/Providers.tsx` → `src/pages/providers/*`
- `packages/frontend/src/hooks/queries/*` (new, one file per resource)

**Documentation:**
- `packages/frontend/DESIGN_SYSTEM.md` (the design doc, verbatim)
- `packages/frontend/AGENTS.md` (pointer to design doc + engineering rules)
- `AGENTS.md` (root, one-line pointer)

**Cleanup deletions (Phase 8):**
- `packages/frontend/src/components/ui/` (entire directory)
- Legacy token aliases at the bottom of `src/styles/tokens.css`
- `src/contexts/ToastContext.tsx` if no callers remain
