import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { DashboardPage } from '../components/templates';
import { Button } from '../components/ui-v2/button';
import { Input } from '../components/ui-v2/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui-v2/card';
import { Skeleton } from '../components/ui-v2/skeleton';
import {
  Pill,
  StatusPill,
  StatusDot,
  ProviderChip,
  ApiFormatChip,
  ModelChip,
  DeltaChip,
} from '../components/chips';
import { LineChart, BarChart, DonutChart, Sparkline } from '../components/charts';
import type { Status } from '../lib/status-vocab';

const ALL_STATUSES: Status[] = [
  'Healthy',
  'Degraded',
  'Cooldown',
  'Disabled',
  'Active',
  'Idle',
  'Exceeded',
  'Expired',
  'Refreshing',
  'Error',
];

const lineData = Array.from({ length: 24 }, (_, i) => ({
  t: `${i}h`,
  current: Math.round(60 + 40 * Math.sin(i / 3) + Math.random() * 15),
  prior: Math.round(50 + 30 * Math.sin(i / 3 + 1) + Math.random() * 15),
}));

const barData = [
  { model: 'claude-sonnet-4-6', tokens: 4320 },
  { model: 'gpt-5-codex', tokens: 3120 },
  { model: 'gemini-2.5-pro', tokens: 2210 },
  { model: 'deepseek-v3', tokens: 1850 },
  { model: 'llama-3.1-70b', tokens: 920 },
];

const donutData = [
  { name: 'OpenAI', value: 41 },
  { name: 'Anthropic', value: 27 },
  { name: 'Gemini', value: 18 },
  { name: 'Other', value: 14 },
];

export const Sandbox: React.FC = () => {
  return (
    <DashboardPage
      title="Design Sandbox"
      subtitle="Every primitive across the live theme + accent. Use the TopBar to flip them and verify."
    >
      <Card>
        <CardHeader>
          <CardTitle>Buttons</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="destructive">Destructive</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Add">
            <Plus />
          </Button>
          <Button variant="destructive" size="icon" aria-label="Delete">
            <Trash2 />
          </Button>
          <Button disabled>Disabled</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inputs</CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-md gap-3">
          <Input placeholder="Default input" />
          <Input placeholder="Disabled" disabled />
          <Input placeholder="With value" defaultValue="claude-sonnet-4-6" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status pills</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ALL_STATUSES.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status dots</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2">
          {ALL_STATUSES.map((s) => (
            <StatusDot key={s} status={s} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provider + format + model chips</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <ProviderChip provider="openai" />
          <ProviderChip provider="anthropic" />
          <ProviderChip provider="gemini" />
          <ProviderChip provider="deepseek" />
          <ProviderChip provider="groq" />
          <ProviderChip provider="openrouter" />
          <ProviderChip provider="ollama" />
          <ProviderChip provider="oauth-github-copilot" />
          <ProviderChip provider="oauth-codex" />
          <ProviderChip provider="oauth-antigravity" />
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          <ApiFormatChip format="OpenAI" />
          <ApiFormatChip format="Anthropic" />
          <ApiFormatChip format="Gemini" />
          <ApiFormatChip format="Responses" />
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          <ModelChip model="claude-sonnet-4-6" />
          <ModelChip model="gpt-5-codex" />
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          <DeltaChip value={4.2} />
          <DeltaChip value={-1.8} />
          <DeltaChip value={0} />
          <DeltaChip value={-3.5} inverse />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pill tones</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Pill tone="neutral">Neutral</Pill>
          <Pill tone="accent">Accent</Pill>
          <Pill tone="success">Success</Pill>
          <Pill tone="warning">Warning</Pill>
          <Pill tone="danger">Danger</Pill>
          <Pill tone="info">Info</Pill>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Line chart with compare</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart
              data={lineData}
              xKey="t"
              series={[
                { dataKey: 'current', label: 'Current' },
                { dataKey: 'prior', label: 'Prior period', compare: true },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Donut</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart data={donutData} centerLabel="100" centerSub="requests" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Capsule bar chart (horizontal)</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            data={barData}
            xKey="model"
            horizontal
            series={[{ dataKey: 'tokens', label: 'Tokens' }]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Requests', value: '12,847', delta: 4.2 },
          { label: 'Tokens', value: '1.21M', delta: -1.8 },
          { label: 'Cost', value: '$42.18', delta: 2.4 },
          { label: 'Avg latency', value: '342 ms', delta: -5.6, inverse: true },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between">
              <span className="text-xs uppercase tracking-wide text-foreground-muted">
                {m.label}
              </span>
              <Pill size="sm" tone="neutral">
                24h
              </Pill>
            </div>
            <div className="mt-2 font-mono text-2xl font-medium tabular-nums text-foreground">
              {m.value}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <DeltaChip value={m.delta} inverse={m.inverse} />
              <Sparkline className="w-24" data={Array.from({ length: 18 }, () => Math.random())} />
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Skeleton loading</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </CardContent>
      </Card>
    </DashboardPage>
  );
};
