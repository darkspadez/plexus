import { UsageData } from '../lib/api';
import { KWH_PER_SLICE, formatEnergy } from '../lib/format';
import toastFull from '../assets/toast/toast-full.png';
import toast75 from '../assets/toast/toast-75.png';
import toast50 from '../assets/toast/toast-50.png';
import toast25 from '../assets/toast/toast-25.png';
import loafFull from '../assets/toast/loaf-full.png';
import loaf75 from '../assets/toast/loaf-75.png';
import loaf50 from '../assets/toast/loaf-50.png';
import loaf25 from '../assets/toast/loaf-25.png';

interface SlicesToastedProps {
  data: UsageData[];
}

const SLICES_PER_LOAF = 20;
const DEFAULT_SLICE_LAYOUT_THRESHOLD = 30;
const DEFAULT_MAX_LOAVES_TO_RENDER = 8;
const TOAST_COLUMNS = 6;

const readDebugNumber = (key: string, fallback: number): number => {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatSlices = (slices: number): string => {
  if (slices < 1) return slices.toFixed(2);
  if (slices < 10) return slices.toFixed(1);
  return Math.round(slices).toLocaleString();
};

const getQuartileImage = (fraction: number, images: Record<string, string>) => {
  if (fraction >= 0.75) return images.full;
  if (fraction >= 0.5) return images.seventyFive;
  if (fraction >= 0.25) return images.half;
  return images.quarter;
};

const buildUnits = (value: number): number[] => {
  if (value <= 0) return [];

  const fullUnits = Math.floor(value);
  const remainder = value - fullUnits;
  const units = Array.from({ length: fullUnits }, () => 1);
  if (remainder > 0) {
    units.push(remainder);
  }
  return units;
};

export function SlicesToasted({ data }: SlicesToastedProps) {
  const displayMultiplier = Math.max(0, readDebugNumber('plexus.slicesToasted.multiplier', 1));
  const sliceLayoutThreshold = Math.max(
    1,
    readDebugNumber('plexus.slicesToasted.sliceLayoutThreshold', DEFAULT_SLICE_LAYOUT_THRESHOLD)
  );
  const maxLoavesToRender = Math.max(
    1,
    readDebugNumber('plexus.slicesToasted.maxLoavesToRender', DEFAULT_MAX_LOAVES_TO_RENDER)
  );

  const totalKwh = data.reduce((sum, point) => sum + (point.kwhUsed || 0), 0);
  const totalSlices = (totalKwh / KWH_PER_SLICE) * displayMultiplier;
  const useLoaves = totalSlices > sliceLayoutThreshold;

  const toastImages = {
    full: toastFull,
    seventyFive: toast75,
    half: toast50,
    quarter: toast25,
  };
  const loafImages = {
    full: loafFull,
    seventyFive: loaf75,
    half: loaf50,
    quarter: loaf25,
  };

  const slicesEquivalent = formatSlices(totalSlices);
  const units = buildUnits(useLoaves ? totalSlices / SLICES_PER_LOAF : totalSlices);
  const displayedUnits = useLoaves ? units.slice(0, maxLoavesToRender) : units;
  const hasOverflowLoaves = useLoaves && units.length > maxLoavesToRender;

  return (
    <div className="space-y-3">
      <div className="text-sm text-text-secondary">
        {slicesEquivalent} slices equivalent ({formatEnergy(totalKwh)})
      </div>

      {displayedUnits.length === 0 && (
        <div className="text-sm text-text-secondary text-center">No usage yet.</div>
      )}

      {!useLoaves && displayedUnits.length > 0 && (
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${TOAST_COLUMNS}, minmax(0, 1fr))`,
            justifyItems: 'center',
            alignItems: 'center',
            width: 'fit-content',
            margin: '0 auto',
          }}
        >
          {displayedUnits.map((fraction, index) => (
            <img
              key={`toast-${index}`}
              src={getQuartileImage(fraction, toastImages)}
              alt="Toast slice"
              style={{ width: 48, height: 48, objectFit: 'contain' }}
            />
          ))}
        </div>
      )}

      {useLoaves && displayedUnits.length > 0 && (
        <div className="space-y-3">
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              justifyItems: 'center',
              alignItems: 'center',
              width: 'fit-content',
              margin: '0 auto',
            }}
          >
            {displayedUnits.map((fraction, index) => (
              <img
                key={`loaf-${index}`}
                src={getQuartileImage(fraction, loafImages)}
                alt="Loaf equivalent"
                style={{ width: 150, height: 'auto', objectFit: 'contain' }}
              />
            ))}
          </div>
          {hasOverflowLoaves && (
            <div className="text-sm text-text-secondary text-center">You are a bad person.</div>
          )}
        </div>
      )}
    </div>
  );
}
