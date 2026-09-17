/**
 * @file liveUtils.ts
 *
 * Label normalisation helpers for the Live Metrics dashboard. Trimmed to
 * just what the Model Stack card needs (`getModelLabel`) — the
 * provider-labelling and per-entity aggregation helpers were only used by
 * cards that were deleted as part of the dashboard redesign (see
 * docs/DESIGN_MIGRATION.md).
 */

import type { UsageRecord } from '../../lib/api';
import { PLACEHOLDER_LABELS } from './liveTypes';

/**
 * Strips whitespace and filters out placeholder telemetry labels.
 * Returns an empty string for any value that is null, undefined, blank,
 * or matches a known placeholder (e.g. "unknown", "n/a", "null").
 */
export const normalizeTelemetryLabel = (value: string | null | undefined): string => {
  const normalized = value?.trim();
  if (!normalized) {
    return '';
  }

  if (PLACEHOLDER_LABELS[normalized.toLowerCase()]) {
    return '';
  }

  return normalized;
};

/**
 * Derives a display label for the model used in a request.
 * Prefers `selectedModelName` (the actual model dispatched to) over
 * `incomingModelAlias` (the alias the client requested). Falls back to
 * "Failed Before Model Selection" for errors, or "Unresolved Model" otherwise.
 */
export const getModelLabel = (request: UsageRecord): string => {
  const model =
    normalizeTelemetryLabel(request.selectedModelName) ||
    normalizeTelemetryLabel(request.incomingModelAlias);
  if (model) {
    return model;
  }

  const status = (request.responseStatus || '').toLowerCase();
  if (status && status !== 'success') {
    return 'Failed Before Model Selection';
  }

  return 'Unresolved Model';
};
