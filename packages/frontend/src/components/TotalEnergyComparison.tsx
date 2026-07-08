import { useState } from 'react';
import { KWH_PER_SLICE, formatDuration, formatEnergy, formatSlices } from '../lib/format';
import { Tv, Flame, Play, Gamepad2, Lightbulb, Croissant } from 'lucide-react';
import { Tabs } from './ui/Tabs';

interface ComparisonOption {
  id: string;
  label: string;
  shortLabel: string;
  kwhPerHour: number;
  icon: React.ReactNode;
  verb: string;
  noun: string;
  sourceUrl?: string;
  sourceName?: string;
}

const COMPARISONS: ComparisonOption[] = [
  {
    id: 'led-bulb',
    label: 'LED light bulb',
    shortLabel: 'LED Bulb',
    kwhPerHour: 0.01,
    icon: <Lightbulb size={28} className="text-yellow-400" />,
    verb: 'run',
    noun: 'an LED bulb',
    sourceUrl:
      'https://www.energysage.com/electricity/house-watts/how-many-watts-does-a-light-bulb-use/',
    sourceName: 'EnergySage.com',
  },
  {
    id: 'netflix',
    label: 'Netflix streaming',
    shortLabel: 'Netflix',
    kwhPerHour: 0.077,
    icon: <Play size={28} className="text-red-400" />,
    verb: 'watch',
    noun: 'Netflix',
    sourceUrl:
      'https://www.iea.org/commentaries/the-carbon-footprint-of-streaming-video-fact-checking-the-headlines',
    sourceName: 'IEA',
  },
  {
    id: 'tv',
    label: '55" LCD/LED TV',
    shortLabel: '55" TV',
    kwhPerHour: 0.1,
    icon: <Tv size={28} className="text-blue-400" />,
    verb: 'watch',
    noun: 'TV',
    sourceUrl: 'https://www.energysage.com/electricity/house-watts/how-many-watts-does-a-tv-use/',
    sourceName: 'EnergySage.com',
  },
  {
    id: 'ps5',
    label: 'PlayStation 5 gaming',
    shortLabel: 'PS5',
    kwhPerHour: 0.2,
    icon: <Gamepad2 size={28} className="text-indigo-400" />,
    verb: 'play',
    noun: 'PS5',
    sourceUrl: 'https://www.playstation.com/en-no/legal/ecodesign/',
    sourceName: 'Sony (ECODESIGN)',
  },
  {
    id: 'oven',
    label: 'Electric oven (350°F)',
    shortLabel: 'Oven',
    kwhPerHour: 3.0,
    icon: <Flame size={28} className="text-orange-400" />,
    verb: 'cook with',
    noun: 'the oven',
    sourceUrl:
      'https://paylesspower.com/blog/electric-ovens-what-you-need-to-know-about-energy-consumption-and-costs',
    sourceName: 'PayLessPower.com',
  },
];

interface TotalEnergyComparisonProps {
  /** Pre-computed total kWh used across all requests (from backend summary). */
  totalKwh?: number;
}

export function TotalEnergyComparison({ totalKwh = 0 }: TotalEnergyComparisonProps) {
  const [activeTab, setActiveTab] = useState<'slices' | string>('slices');

  const totalSlices = totalKwh / KWH_PER_SLICE;
  const slicesEquivalent = formatSlices(totalSlices);

  const selectedComparison = COMPARISONS.find((c) => c.id === activeTab);

  const renderSlicesView = () => (
    <div className="space-y-4 flex flex-col items-center justify-center py-2">
      <div className="text-center space-y-1">
        <div className="text-xs text-foreground-muted">
          With {formatEnergy(totalKwh)}, you could toast
        </div>
        <div className="text-2xl font-bold text-foreground">
          {slicesEquivalent} slice{totalSlices !== 1 ? 's' : ''} of bread
        </div>
      </div>

      <div className="flex items-center justify-center">
        <Croissant size={28} className="text-amber-400" />
      </div>

      <div className="flex items-center gap-3 text-xs text-foreground-subtle">
        <span>Toaster uses ~800 W</span>
      </div>
    </div>
  );

  const renderComparisonView = (comparison: ComparisonOption) => {
    const comparisonSeconds = (totalKwh / comparison.kwhPerHour) * 3600;
    const comparisonDisplay = formatDuration(comparisonSeconds);
    const watts = comparison.kwhPerHour * 1000;

    return (
      <div className="space-y-4 flex flex-col items-center justify-center py-2">
        <div className="text-center space-y-1">
          <div className="text-xs text-foreground-muted">
            With {formatEnergy(totalKwh)}, you could {comparison.verb} {comparison.noun} for
          </div>
          <div className="text-2xl font-bold text-foreground">{comparisonDisplay}</div>
        </div>

        <div className="flex items-center justify-center">{comparison.icon}</div>

        <div className="flex items-center gap-3 text-xs text-foreground-subtle">
          <span>
            {comparison.label} uses {watts.toFixed(0)} W
          </span>
        </div>
      </div>
    );
  };

  const tabItems = [
    { value: 'slices', label: 'Slices' },
    ...COMPARISONS.map((c) => ({ value: c.id, label: c.shortLabel })),
  ];

  return (
    <div className="space-y-3">
      {/* Tab Bar — full-bleed so the underline aligns with the card header border */}
      <Tabs
        value={activeTab}
        onChange={(v) => setActiveTab(v)}
        items={tabItems}
        aria-label="Energy comparison"
        className="-mx-3 sm:-mx-5 -mt-3 sm:-mt-5 sm:pl-1"
      />

      {/* Tab Content */}
      {activeTab === 'slices' && renderSlicesView()}
      {selectedComparison && renderComparisonView(selectedComparison)}

      {/* Source footnote */}
      {selectedComparison?.sourceUrl && (
        <div className="pt-2">
          <a
            href={selectedComparison.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-foreground-subtle hover:text-foreground-muted transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            {selectedComparison.label} energy: {selectedComparison.sourceName}
          </a>
        </div>
      )}
    </div>
  );
}
