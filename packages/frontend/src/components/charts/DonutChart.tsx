import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { seriesColor } from './palette';

export interface DonutDatum {
  name: string;
  value: number;
  color?: string;
}

interface DonutChartProps {
  data: DonutDatum[];
  height?: number;
  /** Center label — typically the total or primary metric. */
  centerLabel?: React.ReactNode;
  /** Center sub-label. */
  centerSub?: React.ReactNode;
  formatValue?: (v: number) => string;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  height = 240,
  centerLabel,
  centerSub,
  formatValue = String,
}) => {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="65%"
            outerRadius="90%"
            stroke="var(--surface)"
            strokeWidth={2}
            isAnimationActive={false}
            cornerRadius={6}
            paddingAngle={2}
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={d.color ?? seriesColor(i)} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]!;
              return (
                <div className="rounded-lg border border-border bg-surface px-2.5 py-2 text-xs shadow-md">
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: p.color }}
                      aria-hidden
                    />
                    <span className="text-foreground-muted">{p.name}</span>
                    <span className="ml-2 text-foreground">{formatValue(p.value as number)}</span>
                  </div>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerSub) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerLabel && (
            <div className="font-mono text-2xl font-medium tabular-nums text-foreground">
              {centerLabel}
            </div>
          )}
          {centerSub && (
            <div className="text-[11px] uppercase tracking-wide text-foreground-subtle">
              {centerSub}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
