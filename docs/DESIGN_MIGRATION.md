# Design System Migration

Tracks pages migrated to the post-refresh design system (semantic background/surface/foreground/accent tokens, rebuilt Button/Input/Card/DataTable/Modal/Tabs/EmptyState/Badge primitives).

| Page | Date | Commit | Notes |
|---|---|---|---|
| Requests | 2026-07-04 | `3d6faf66` | Ledger redesign — dense multi-icon table replaced with a two-line ledger and an expandable dossier panel. |
| Foundation | 2026-08-16 | `f56bc25a` | Token layers in `styles/tokens.css`, `@theme` bridge in `globals.css`, primitives under `components/ui/` and chips under `components/chips/`. |
| MCP | 2026-08-16 | `f56bc25a` | Server table on `DataTable`, editor moved to a `Modal`-based sheet (`pages/mcp/McpServerSheet.tsx`) with react-hook-form + zod. |
| Keys | 2026-08-16 | `19733dda` | Rebuilt on `DataTable` + `KeySheet`. Quota *definitions* moved out to the dedicated `/user-quotas` page; this page keeps per-key quota status only. |
| Providers | 2026-08-16 | `198ba788` | Edit drawer reworked into four `SectionCard` tabs inside a `Modal size="lg"`, with the page itself reduced to a thin composition shell. |
| Dashboard | 2026-08-16 | `5513e383` | Collapsed the 4-tab Live/Usage/Performance/Overall surface into a single slim admin page (KPI tiles, timeline, service alerts, errors-by-provider) plus an optional Grafana link, pushing granular per-provider/model breakdowns to Grafana. Limited/scoped API keys keep a separate `OverallTab` view. |
| Config | 2026-09-17 | `cc6f4760` | Upstream's `components/config/*` split adopted as the skeleton and restyled onto `SectionCard`; each settings group owns its own react-hook-form + zod schema. |
| Models | 2026-09-17 | `4be56e1a` | Hand-rolled table replaced by `DataTable` with column meta and controlled row expansion; `AliasMobileCard` kept as the mobile surface so per-target enable/test stay one tap away. |
| Playground | 2026-10-02 | post-`1d4f9d9c` | Last legacy page: classes remapped onto semantic tokens with nesting fixed (code/tool/reasoning blocks on `surface` inside the `surface-sunken` assistant bubble), composer gains a focus border. Behavior unchanged. |
| Custom Quota Checkers | 2026-09-17 | `cc6f4760` | New upstream page given design treatment — raw inputs replaced with `Input`/`Select`/`Switch`/`FormField`, empty list on `EmptyState`. |

## Notes on the upstream merge (`32e83240`, `cc6f4760`)

Upstream never adopted this token vocabulary, so every file it contributed arrived
referencing classes that do not exist in `@theme` (`bg-bg-glass`, `border-border-glass`,
`text-text*`, `font-body`, `text-primary`) and therefore rendered inert. Roughly 413 such
references came in with the structural stage and were resolved to zero.

Two corrections to earlier entries, recorded because the merge changed them:

- The Dashboard's **energy comparison** card and **Total Energy** KPI tile are gone.
  Upstream removed synthetic GPU/power estimation in `#822`; the tile is now **Throughput**
  (`stats.avgTokensPerSec`). Provider-*measured* kWh survives only in the request detail
  panel, where `log.kwhUsed` is still rendered.
- The Dashboard gained two salvaged drill-in cards from upstream's decomposed Live tab —
  `ConcurrencyCard` and `ModelTimelineCard` — as a draggable grid via `useCardPositions`.
  The other 11 cards, 6 modals and `pages/detailed-usage/` were dropped, since per-entity
  breakdowns belong in Grafana per the Dashboard entry above.

## Notes on the upstream merge (`1d4f9d9c`, through upstream `a498b479`)

A thin merge: conflicts were resolved to a compiling tree, then upstream features that
landed in files this branch had replaced were placed in a follow-up commit.

- **Providers** — the preset catalog (`#941`) is a "Start from a preset" `SectionCard` at
  the top of the Connection tab, shown only when adding. A new **Request shaping** card on
  the Transformations tab holds cache-key injection (`#949`) and Responses extensions
  (`#963`). Compatibility gained the inline-quirks badge and upstream's Auto Compat gating
  (`#912`); `ToggleRow` has an opt-in `wrap` so that explanation is never truncated. The
  OAuth account field is gone (`#913`) — the provider ID is the account — and the pi-ai
  provider select (with `- auto -` resolution) lives in `model-editor/ModelList`.
- **Requests** — `ApiFormatChip` prefixes unbranded API types with `ApiTypeIcon`
  (`#946`, decisions `#952`). Adapter rewrites show `route → upstream` on the model cell
  and an *Upstream model* field in the dossier (`#918`); the `N×` attempts pill still means
  retries only (`#926`).
- **Quotas** — stale readings (`#936`) render a warning notice on every meter row of the
  checker without changing its severity.
- **Shell** — `VersionReloader` (`#951`/`#954`) is upstream's component restyled in place.
  Tailwind v4 `z-*` utilities read `--z-index-*`, so token z-indexes are written
  `z-(--z-toast)`; a bare `z-toast` generates no CSS.

## Outstanding

- `text-accent` (accent-colored text on page surfaces) is below 4.5:1 for the warm accents
  in light theme and for violet in dark theme. Filled accents are fine since
  `--accent-foreground` became per-accent ink; text likely wants its own `--accent-text` token.
- `components/chips/ApiFormatChip.tsx` imports `ApiTypeIcon` and `isDecisionsApiType` from
  `components/logs/`; both belong in `chips/` or `lib/`.
- Upstream-owned files deleted on this branch as dead code — `components/models/AliasTableRow.tsx`,
  `components/quota/index.ts`, `components/quota/WaferQuotaDisplay.tsx`,
  `components/logs/constants.ts` and the API logo SVGs — return as modify/delete conflicts
  whenever upstream edits them. Resolve by keeping them deleted.
- `components/config/types.ts` is now largely unused; the self-contained settings panels
  carry their own schemas. Kept as the documented shared contract pending a cleanup pass.
