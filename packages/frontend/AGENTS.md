# Frontend Development Guidelines

## Design System (read this first for visual changes)

All visual and interaction decisions for this package are governed by
[`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md). When that doc and this one
disagree on look-and-feel, the design doc wins; this file wins for
engineering rules (build, deps, file layout).

The design system migration is in progress (see `DESIGN_SYSTEM_PLAN.md`
at the repo root). Current state:

- **Done**: foundation tokens (`src/styles/tokens.css`), light/dark/system
  themes via `data-theme`, six user-selectable accents via `data-accent`,
  density via `data-density`, FOUC-prevention boot script in `index.html`,
  Geist + Geist Mono fonts, shadcn primitives vendored to
  `src/components/ui-v2/`, project chips (`src/components/chips/`), chart
  wrappers with capsule bars and palette tokens (`src/components/charts/`),
  page templates (`src/components/templates/`), new `TopBar` + `AppSidebar`
  shell, TanStack Query provider + Sonner toaster wired in, Quotas page
  migrated as the canonical recipe.
- **Pending**: Dashboard, Logs, Providers, Models, Keys, MCP, MyKey,
  SystemLogs, Errors, Debug pages still consume legacy components/tokens.
  They render correctly under the new shell via legacy token aliases at
  the bottom of `tokens.css` — those aliases get deleted in Phase 8 once
  every page is migrated.

When building a new page or changing an existing one:

1. Read the matching `DESIGN_SYSTEM.md` §12 page section.
2. Use `src/components/templates/{ListPage,DashboardPage,DetailPage,FormPage}`
   — do not invent a new layout.
3. Reach for `src/components/ui-v2/*` (shadcn) before writing custom JSX.
   If a primitive doesn't exist, run `bunx shadcn@latest add <component>`
   from this package's directory.
4. Use `src/components/chips/*` for status, provider, model, format,
   and delta indicators. Never roll your own.
5. Use `src/components/charts/*` for charts; do not pass hard-coded
   colors — series follow `var(--chart-1..5)` and the user's accent.
6. Use `src/lib/format-design.ts` for data formatting (latency, cost,
   tokens, bytes, duration, request id) per §8.
7. Use `src/lib/status-vocab.ts` to map backend status literals into the
   fixed design-doc vocab.
8. Data: TanStack Query (`@tanstack/react-query`). Forms: shadcn `Form` +
   `react-hook-form` + `zod`, schema co-located with the component.
   Toasts: `import { toast } from 'sonner'` — never confirm an action
   whose effect is already visible on screen.
9. **No raw hex values in component code.** If a token doesn't exist
   yet, add it to `src/styles/tokens.css` first.

The `Quotas` page (`src/pages/Quotas.tsx` + `src/pages/quotas/`) is the
canonical reference for migrating a page end-to-end.

## Icons

**Do not use emoji characters in the codebase.** Instead, use Lucide icons from the `lucide-react` library.

For example, replace:
- `ℹ️` → `<Info />`
- `⚠️` → `<AlertTriangle />`
- `✅` → `<CheckCircle />`
- `❌` → `<X />`

Import icons from `lucide-react` and use them as React components.

## Quota Checker Configuration

When adding support for new quota checkers in the frontend, you must create both a display component and a configuration component.

### Display Components

Display components show quota status in the sidebar. They are located in `src/components/quota/` and should be named `{Name}QuotaDisplay.tsx`. Examples:
- `NagaQuotaDisplay.tsx`
- `SyntheticQuotaDisplay.tsx`
- `NanoGPTQuotaDisplay.tsx`

These components receive a `QuotaCheckResult` prop and render the quota status (used/remaining, utilization bar, etc.).

### Configuration Components

Configuration components provide a form for configuring quota checker options. They are located in `src/components/quota/` and should be named `{Name}QuotaConfig.tsx`. Examples:
- `NagaQuotaConfig.tsx` - requires `max` (max balance), optional `apiKey` and `endpoint`
- `SyntheticQuotaConfig.tsx` - optional `apiKey` and `endpoint`
- `NanoGPTQuotaConfig.tsx` - optional `apiKey` and `endpoint`

Each config component must:
1. Accept `options: Record<string, unknown>` and `onChange: (options: Record<string, unknown>) => void` props
2. Render input fields for the required options
3. Call `onChange` when options change

### Integration in Providers.tsx

To add a configuration component to the provider edit modal:

1. Import the config component at the top of `Providers.tsx`
2. Add conditional rendering after the quota checker type/interval selector (around line 1350)
3. Pass the current options and an onChange handler

```tsx
{selectedQuotaCheckerType && selectedQuotaCheckerType === 'naga' && (
  <div className="mt-3 p-3 border border-border-glass rounded-md bg-bg-subtle">
    <NagaQuotaConfig
      options={editingProvider.quotaChecker?.options || {}}
      onChange={(options) => setEditingProvider({
        ...editingProvider,
        quotaChecker: {
          ...editingProvider.quotaChecker,
          options
        } as Provider['quotaChecker']
      })}
    />
  </div>
)}
```

### API Type Update

When adding a new quota checker type that requires options, ensure the `Provider` type in `src/lib/api.ts` includes an `options` field in the `quotaChecker` object:

```typescript
quotaChecker?: {
  type?: string;
  enabled: boolean;
  intervalMinutes: number;
  options?: Record<string, unknown>;
};
```