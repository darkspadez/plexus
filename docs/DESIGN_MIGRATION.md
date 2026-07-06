# Design System Migration

Tracks pages migrated to the post-refresh design system (semantic background/surface/foreground/accent tokens, rebuilt Button/Input/Card/DataTable/Modal/Tabs/EmptyState/Badge primitives).

| Page | Date | Commit | Notes |
|---|---|---|---|
| Requests | 2026-07-04 | `3d6faf66` | Ledger redesign — dense multi-icon table replaced with a two-line ledger and an expandable dossier panel. |
| Dashboard | 2026-07-05 | (this branch, uncommitted) | Collapsed the 4-tab Live/Usage/Performance/Overall surface into a single slim admin page (KPI tiles, timeline, concurrency gauge, cooldowns-by-provider, errors-by-provider, energy comparison) plus an optional Grafana link, pushing granular per-provider/model breakdowns to Grafana. Limited/scoped API keys keep a separate `OverallTab` view. |
