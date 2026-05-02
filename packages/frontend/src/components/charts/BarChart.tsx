import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS, seriesColor } from './palette';

export interface BarSeries {
  dataKey: string;
  label?: string;
  color?: string;
  compare?: boolean;
}

interface BarChartProps<T> {
  data: T[];
  xKey: string;
  series: BarSeries[];
  /** When true, bars are rendered horizontally with capsule-rounded right ends. */
  horizontal?: boolean;
  height?: number;
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

/**
 * Vertical or horizontal bar chart with capsule-rounded ends per
 * DESIGN_SYSTEM.md §7.9. The radius is large enough to fully round the cap
 * end of every bar at typical bar widths.
 */
export function BarChart<T>({
  data,
  xKey,
  series,
  horizontal,
  height = 240,
  formatValue,
}: BarChartProps<T>) {
  // [topLeft, topRight, bottomRight, bottomLeft]
  const radius: [number, number, number, number] = horizontal ? [0, 999, 999, 0] : [999, 999, 0, 0];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
        barCategoryGap={horizontal ? '20%' : '24%'}
      >
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              stroke="var(--foreground-subtle)"
              tickLine={false}
              axisLine={false}
              fontSize={11}
            />
            <YAxis
              dataKey={xKey as never}
              type="category"
              stroke="var(--foreground-subtle)"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={120}
            />
          </>
        ) : (
          <>
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
          </>
        )}
        <Tooltip
          content={renderTooltip(formatValue)}
          cursor={{ fill: 'var(--surface-elevated)' }}
        />
        {series.map((s, i) => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.label ?? s.dataKey}
            fill={s.color ?? (s.compare ? CHART_COLORS.secondary : seriesColor(i))}
            fillOpacity={s.compare ? 0.35 : 1}
            radius={radius}
            isAnimationActive={false}
          />
        ))}
      </RBarChart>
    </ResponsiveContainer>
  );
}
