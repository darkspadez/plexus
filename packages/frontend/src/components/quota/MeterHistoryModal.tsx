import React, { useEffect, useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { formatMeterValue } from './MeterValue';
import { computeMeterBurn } from './burn-rate';
import type { Meter, QuotaCheckerInfo } from '../../types/quota';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { TOOLTIP_STYLE, GRID_PROPS, AXIS_TICK_STYLE } from '../../lib/chartPalette';
import { checkedAgoLabel } from '../../pages/quotas/quota-format';

type TimeRange = '1h' | '3h' | '6h' | '12h' | '24h' | '1w' | '4w';

const TIME_RANGES: { key: TimeRange; label: string; days: number }[] = [
  { key: '1h', label: '1h', days: 1 / 24 },
  { key: '3h', label: '3h', days: 3 / 24 },
  { key: '6h', label: '6h', days: 6 / 24 },
  { key: '12h', label: '12h', days: 0.5 },
  { key: '24h', label: '24h', days: 1 },
  { key: '1w', label: '1w', days: 7 },
  { key: '4w', label: '4w', days: 28 },
];

interface MeterHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  quota: QuotaCheckerInfo;
  meter: Meter;
  displayName: string;
}

interface HistoryRow {
  checkedAt: string | number;
  remaining?: number | null;
  used?: number | null;
  limit?: number | null;
  utilizationPercent?: number | null;
  success?: boolean;
  meterKey?: string;
}

// Pick the best value to chart: remaining for balances, utilizationPercent for allowances.
function getChartValue(row: HistoryRow, kind: 'balance' | 'allowance'): number | null {
  if (!row.success) return null;
  if (kind === 'balance') {
    return row.remaining ?? null;
  }
  return typeof row.utilizationPercent === 'number' ? row.utilizationPercent : null;
}

function formatTimestamp(ts: string | number, showDate: boolean): string {
  const d = new Date(typeof ts === 'number' ? ts : Number(ts) || String(ts));
  if (showDate) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export const MeterHistoryModal: React.FC<MeterHistoryModalProps> = ({
  isOpen,
  onClose,
  quota,
  meter,
  displayName,
}) => {
  const [range, setRange] = useState<TimeRange>('24h');
  const [rawHistory, setRawHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRange('24h');
      setRawHistory([]);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const days = TIME_RANGES.find((r) => r.key === range)!.days;
        const result = await api.getQuotaHistory(quota.checkerId, meter.key, `${days}d`);
        if (!cancelled && result?.history) {
          const sorted = [...result.history].sort((a: HistoryRow, b: HistoryRow) => {
            const ta =
              typeof a.checkedAt === 'number' ? a.checkedAt : new Date(a.checkedAt).getTime();
            const tb =
              typeof b.checkedAt === 'number' ? b.checkedAt : new Date(b.checkedAt).getTime();
            return ta - tb;
          });
          setRawHistory(sorted);
        }
      } catch {
        if (!cancelled) setError('Failed to load history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    return () => {
      cancelled = true;
    };
  }, [isOpen, quota.checkerId, meter.key, range]);

  const showDate = (TIME_RANGES.find((r) => r.key === range)?.days ?? 1) >= 2;

  const chartData = useMemo(() => {
    return rawHistory
      .map((row) => {
        const value = getChartValue(row, meter.kind);
        if (value === null) return null;
        const raw = row.checkedAt;
        const ts = typeof raw === 'number' ? raw : new Date(String(raw)).getTime();
        return {
          ts,
          label: formatTimestamp(ts, showDate),
          value,
          remaining: row.remaining ?? null,
          used: row.used ?? null,
          limit: row.limit ?? null,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [rawHistory, meter.kind, showDate]);

  const stats = useMemo(() => {
    if (!chartData.length) return null;
    const vals = chartData.map((d) => d.value);
    return {
      current: vals[vals.length - 1],
      min: Math.min(...vals),
      max: Math.max(...vals),
    };
  }, [chartData]);

  // Anchor "now" once per fetched batch (not per render) so the burn stats
  // don't drift while the modal sits open with the same data.
  const now = useMemo(() => Date.now(), [rawHistory]);

  // Forward-looking burn stats, computed from the RAW rows (not chartData,
  // which collapses allowances to utilization% and loses `used`). Reflects
  // only the currently selected time-range's fetched series — switching
  // ranges recomputes, which is intended (a longer window sees more history
  // and a steadier slope).
  const burn = useMemo(() => computeMeterBurn(rawHistory, meter, now), [rawHistory, meter, now]);

  const checkedLabel = checkedAgoLabel(quota.checkedAt);

  const isBalance = meter.kind === 'balance';
  // Use chart-4 (cyan) for balance, chart-2 (violet) for allowance — via CSS vars
  const areaColor = isBalance ? 'var(--chart-4)' : 'var(--chart-2)';
  const gradientId = isBalance ? 'mhGradBalance' : 'mhGradAllowance';
  const yLabel = isBalance ? meter.unit : '%';

  const formatY = (v: number) =>
    isBalance ? formatMeterValue(v, meter.unit, true) : `${Math.round(v)}%`;

  const formatTooltip = (v: number) =>
    isBalance ? formatMeterValue(v, meter.unit) : `${v.toFixed(1)}%`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={meter.label}
      size="md"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      {/* Subtitle */}
      <div className="mb-4">
        <p className="text-xs text-foreground-muted">
          {displayName}
          {quota.oauthAccountId && ` · ${quota.oauthAccountId}`}
        </p>
        {checkedLabel && <p className="text-xs text-foreground-subtle mt-0.5">{checkedLabel}</p>}
      </div>

      {/* Time-range selector */}
      <div className="flex items-center gap-1 overflow-x-auto mb-4">
        {TIME_RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              range === r.key
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'text-foreground-muted hover:bg-surface-elevated'
            }`}
          >
            {r.label}
          </button>
        ))}
        {loading && <RefreshCw size={14} className="animate-spin text-foreground-subtle ml-auto" />}
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Current', value: formatTooltip(stats.current), title: undefined },
            { label: 'Min', value: formatTooltip(stats.min), title: undefined },
            { label: 'Max', value: formatTooltip(stats.max), title: undefined },
            { label: 'Avg burn/day', value: burn?.perDayLabel ?? '—', title: undefined },
            {
              label: isBalance ? 'Depletes in' : 'Exhausts in',
              value: burn?.runwayLabel ?? '—',
              title: burn?.runwayNote,
            },
          ].map(({ label, value, title }) => (
            <div
              key={label}
              className="rounded-lg border border-border bg-surface-elevated px-3 py-2"
              title={title}
            >
              <div className="text-[10px] text-foreground-subtle uppercase tracking-wider">
                {label}
              </div>
              <div className="text-sm font-semibold text-foreground tabular-nums mt-0.5">
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="h-52 w-full">
        {error ? (
          <div className="h-full flex items-center justify-center text-sm text-danger">{error}</div>
        ) : loading && chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center gap-2 text-sm text-foreground-muted">
            <RefreshCw size={16} className="animate-spin" />
            Loading…
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-foreground-subtle">
            No data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={areaColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={areaColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK_STYLE}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={formatY}
                tick={AXIS_TICK_STYLE}
                tickLine={false}
                axisLine={false}
                width={60}
                label={
                  yLabel && yLabel !== '%'
                    ? undefined
                    : {
                        value: '%',
                        position: 'insideTopRight',
                        fontSize: 10,
                        fill: 'var(--foreground-subtle)',
                      }
                }
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: 'var(--foreground-muted)', marginBottom: 2 }}
                itemStyle={{ color: areaColor }}
                formatter={(value: unknown) =>
                  [formatTooltip(value as number), meter.label] as [string, string]
                }
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={areaColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 4, fill: areaColor }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Modal>
  );
};
