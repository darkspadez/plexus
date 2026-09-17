/**
 * @file liveTypes.ts
 *
 * Types, interfaces, and constants for the two Live Metrics cards salvaged
 * onto AdminDashboard (Concurrency, Model Stack). The rest of the old Live
 * Metrics type surface (per-entity stats, request stream filters, poll/window
 * toolbar options) was deleted along with the cards that used it — see
 * docs/DESIGN_MIGRATION.md.
 */

/**
 * Metadata for one series line in the model-stack composed chart.
 * Each series corresponds to one of the top N models by request volume.
 */
export type ModelTimelineSeries = {
  /** Synthetic key like "model_0", used as the recharts dataKey */
  key: string;
  /** Human-readable model name for legend/tooltip display */
  label: string;
  /** Colour from the shared chart palette (see lib/chartPalette). */
  color: string;
};

/**
 * A single minute bucket for the model-stack chart. Extends Record<string, ...>
 * because dynamic model keys (e.g. "model_0", "model_1") are added at runtime
 * as stacked bar segments. The fixed fields track aggregate stats and running
 * totals for computing averages (TTFT and TPS) after the accumulation pass.
 */
export type ModelTimelineBucket = Record<string, string | number> & {
  time: string;
  requests: number;
  errors: number;
  tokens: number;
  /** Final computed average Time To First Token (ms) for this bucket */
  avgTtftMs: number;
  /** Final computed average Tokens Per Second for this bucket */
  avgTps: number;
  /** Running sum of TTFT values -- used to compute avgTtftMs after iteration */
  ttftTotal: number;
  /** Count of requests with valid TTFT -- divisor for avgTtftMs */
  ttftCount: number;
  /** Running sum of TPS values -- used to compute avgTps after iteration */
  tpsTotal: number;
  /** Count of requests with valid TPS -- divisor for avgTps */
  tpsCount: number;
};

/** Card IDs that support an expanded modal view (the surviving salvage set). */
export type ModalCardId = 'modelstack' | 'concurrency';

/** Maximum number of distinct models shown in the model-stack chart */
export const MODEL_TIMELINE_MAX_SERIES = 5;

/**
 * Telemetry labels that are treated as "unset". Providers and models sometimes
 * report placeholder strings instead of null, so we normalise these away.
 */
export const PLACEHOLDER_LABELS: Record<string, true> = {
  unknown: true,
  'n/a': true,
  na: true,
  none: true,
  null: true,
  undefined: true,
};
