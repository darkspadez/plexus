import { Info } from 'lucide-react';
import { useCurrency } from '../../lib/CurrencyContext';
import { SUPPORTED_CURRENCIES } from '../../lib/currency';
import { SectionCard } from '../ui/SectionCard';
import { Select } from '../ui/Select';

export function DisplayPreferencesCard() {
  const { currency, setCurrency, ratesAvailable } = useCurrency();

  return (
    <SectionCard title="Display Preferences">
      <div className="flex flex-col gap-1.5">
        <Select
          id="displayCurrency"
          label="Display currency"
          value={currency}
          onChange={setCurrency}
          options={SUPPORTED_CURRENCIES.map((option) => ({
            value: option.code,
            label: `${option.label} (${option.code}) — ${option.symbol}`,
          }))}
          className="w-full sm:w-80"
        />
        {!ratesAvailable && currency !== 'USD' && (
          <p className="flex items-center gap-1.5 font-sans text-[11px] text-foreground-subtle">
            <Info size={13} className="text-warning shrink-0" aria-hidden="true" />
            <span>Live exchange rates are unavailable; amounts fall back to USD.</span>
          </p>
        )}
      </div>
    </SectionCard>
  );
}
