import {
  CartesianGrid,
  Line,
  LineChart as RLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS, seriesColor } from './palette';

export interface LineSeries {
  /** Data key on each datum. */
  dataKey: string;
  /** Series label for legends/tooltips. */
  label?: string;
  /**
   * Color override. Defaults to the chart palette in declared order.
   * Use this only when a series has fixed semantic meaning (e.g. compare-to-prior).
   */
  color?: string;
  /** Render as a comparison series (lower opacity, dashed). */
  compare?: boolean;
}

interface LineChartProps<T> {
  data: T[];
  /** X-axis value key. */
  xKey: string;
  series: LineSeries[];
  height?: number;
  /** Custom tooltip formatter for the value. */
  formatValue?: (v: number) => string;
}

interface TooltipEntry {
  name?: string;
  value?: number;
  color?: string;
}

const renderTooltip =
  (formatValue: (v: number) => string = String) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (props: any) => {
    const { active, payload, label } = props as {
      active?: boolean;
      payload?: ReadonlyArray<TooltipEntry>;
      label?: string | number;
    };
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border border-border bg-surface px-2.5 py-2 text-xs shadow-md">
        {label !== undefined && (
          <div className="mb-1 font-medium text-foreground">{String(label)}</div>
        )}
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 font-mono tabular-nums">
            <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="text-foreground-muted">{p.name}</span>
            <span className="ml-auto text-foreground">
              {p.value != null ? formatValue(p.value) : '—'}
            </span>
          </div>
        ))}
      </div>
    );
  };

export function LineChart<T>({ data, xKey, series, height = 240, formatValue }: LineChartProps<T>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RLineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey={xKey as never}
          stroke="var(--foreground-subtle)"
          tickLine={false}
          axisLine={false}
          fontSize={11}
        />
        <YAxis
          stroke="var(--foreground-subtle)"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          width={36}
        />
        <Tooltip
          content={renderTooltip(formatValue)}
          cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
        />
        {series.map((s, i) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.label ?? s.dataKey}
            stroke={s.color ?? (s.compare ? CHART_COLORS.secondary : seriesColor(i))}
            strokeWidth={s.compare ? 1.5 : 2}
            strokeOpacity={s.compare ? 0.6 : 1}
            strokeDasharray={s.compare ? '4 3' : undefined}
            dot={false}
            activeDot={{ r: 3 }}
          />
        ))}
      </RLineChart>
    </ResponsiveContainer>
  );
}
