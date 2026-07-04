import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { UsageData } from '../../lib/api';
import { formatNumber, formatTokens } from '../../lib/format';
import { TOOLTIP_STYLE } from '../../lib/chartPalette';

interface RecentActivityChartProps {
  data: UsageData[];
}

export const RecentActivityChart: React.FC<RecentActivityChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-foreground-subtle italic p-8">
        No activity data available
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '300px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{
            top: 20,
            right: 20,
            bottom: 20,
            left: 20,
          }}
        >
          <CartesianGrid
            stroke="var(--border)"
            vertical={false}
            strokeDasharray="3 3"
            strokeOpacity={0.5}
          />
          <XAxis
            dataKey="timestamp"
            scale="point"
            padding={{ left: 10, right: 10 }}
            tick={{ fill: 'var(--foreground-subtle)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: 'var(--foreground-subtle)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => formatNumber(value as number, 0)}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: 'var(--foreground-subtle)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => formatTokens(value as number)}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: 'var(--foreground)' }} />
          <Legend />
          <Bar
            yAxisId="left"
            dataKey="requests"
            barSize={20}
            fill="var(--chart-1)"
            name="Requests"
            radius={[999, 999, 0, 0]}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="tokens"
            stroke="var(--chart-2)"
            name="Tokens"
            dot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
