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

## Outstanding

- `pages/Playground.tsx` and `components/playground/PlaygroundChat.tsx` still carry ~83
  dead legacy class references. Pre-existing — unchanged by the upstream merge.
- `components/config/types.ts` is now largely unused; the self-contained settings panels
  carry their own schemas. Kept as the documented shared contract pending a cleanup pass.
