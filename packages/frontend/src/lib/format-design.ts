/**
 * Data-display formatters per DESIGN_SYSTEM.md §8. These are the canonical
 * formatters for use by new pages — replaces ad-hoc `.toFixed(2)` etc.
 */

const integerFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compactFmt = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const formatLatencyMs = (ms: number): string => {
  if (!Number.isFinite(ms)) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
};

export const formatThroughput = (tokensPerSecond: number): string => {
  if (!Number.isFinite(tokensPerSecond)) return '—';
  return `${Math.round(tokensPerSecond)} tok/s`;
};

export const formatCostUsd = (dollars: number): string => {
  if (!Number.isFinite(dollars)) return '—';
  if (dollars === 0) return '$0.00';
  if (Math.abs(dollars) < 1) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
};

export const formatTokens = (n: number): string => {
  if (!Number.isFinite(n)) return '—';
  return integerFmt.format(Math.round(n));
};

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(2)} ${units[i]}`;
};

export const formatCount = (n: number): string => {
  if (!Number.isFinite(n)) return '—';
  return integerFmt.format(Math.round(n));
};

/** Big-count formatter for metric cards only — `1.2k`, `4.7M`. */
export const formatCountCompact = (n: number): string => {
  if (!Number.isFinite(n)) return '—';
  return compactFmt.format(n);
};

/** Compact duration: `2m 14s`, `4h 12m`, `3d 2h`. No `00:` padding. */
export const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) {
    const rs = s % 60;
    return rs ? `${m}m ${rs}s` : `${m}m`;
  }
  const h = Math.floor(m / 60);
  if (h < 24) {
    const rm = m % 60;
    return rm ? `${h}h ${rm}m` : `${h}h`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
};

/** Truncate a request id to last 8 chars with leading ellipsis. */
export const formatRequestId = (id: string): string => {
  if (id.length <= 8) return id;
  return `…${id.slice(-8)}`;
};

/** Em-dash for empty cells per §8. */
export const EMPTY_CELL = '—';
