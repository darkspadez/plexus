import { Provider } from '../../lib/api';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { SectionCard } from '../ui/SectionCard';
import { NagaQuotaConfig } from '../quota/NagaQuotaConfig';
import { SyntheticQuotaConfig } from '../quota/SyntheticQuotaConfig';
import { NanoGPTQuotaConfig } from '../quota/NanoGPTQuotaConfig';
import { ZAIQuotaConfig } from '../quota/ZAIQuotaConfig';
import { MoonshotQuotaConfig } from '../quota/MoonshotQuotaConfig';
import { NovitaQuotaConfig } from '../quota/NovitaQuotaConfig';
import { MiniMaxQuotaConfig } from '../quota/MiniMaxQuotaConfig';
import { MiniMaxCodingQuotaConfig } from '../quota/MiniMaxCodingQuotaConfig';
import { OpenRouterQuotaConfig } from '../quota/OpenRouterQuotaConfig';
import { KiloQuotaConfig } from '../quota/KiloQuotaConfig';
import { WisdomGateQuotaConfig } from '../quota/WisdomGateQuotaConfig';
import { GeminiCliQuotaConfig } from '../quota/GeminiCliQuotaConfig';
import { AntigravityQuotaConfig } from '../quota/AntigravityQuotaConfig';
import { ApertisQuotaConfig } from '../quota/ApertisQuotaConfig';
import { KimiCodeQuotaConfig } from '../quota/KimiCodeQuotaConfig';
import { PoeQuotaConfig } from '../quota/PoeQuotaConfig';
import { RoutingRunQuotaConfig } from '../quota/RoutingRunQuotaConfig';
import { OllamaQuotaConfig } from '../quota/OllamaQuotaConfig';
import { DevPassQuotaConfig } from '../quota/DevPassQuotaConfig';
import { NeuralwattQuotaConfig } from '../quota/NeuralwattQuotaConfig';
import { ZenmuxQuotaConfig } from '../quota/ZenmuxQuotaConfig';
import { WaferQuotaConfig } from '../quota/WaferQuotaConfig';
import { OpenCodeGoQuotaConfig } from '../quota/OpenCodeGoQuotaConfig';
import { CrofQuotaConfig } from '../quota/CrofQuotaConfig';
import { ExeDevQuotaConfig } from '../quota/ExeDevQuotaConfig';
import { HyperQuotaConfig } from '../quota/HyperQuotaConfig';
import { SakanaQuotaConfig } from '../quota/SakanaQuotaConfig';
import { ClineQuotaConfig } from '../quota/ClineQuotaConfig';

interface Props {
  editingProvider: Provider;
  setEditingProvider: React.Dispatch<React.SetStateAction<Provider>>;
  selectedQuotaCheckerType: string;
  selectableQuotaCheckerTypes: string[];
  isOAuthMode: boolean;
  oauthCheckerType: string | null;
  quotaValidationError: string | null;
}

const QUOTA_CONFIG_MAP: Record<
  string,
  React.ComponentType<{
    options: Record<string, unknown>;
    onChange: (options: Record<string, unknown>) => void;
  }>
> = {
  naga: NagaQuotaConfig,
  synthetic: SyntheticQuotaConfig,
  nanogpt: NanoGPTQuotaConfig,
  zai: ZAIQuotaConfig,
  moonshot: MoonshotQuotaConfig,
  novita: NovitaQuotaConfig,
  minimax: MiniMaxQuotaConfig,
  'minimax-coding': MiniMaxCodingQuotaConfig,
  openrouter: OpenRouterQuotaConfig,
  kilo: KiloQuotaConfig,
  wisdomgate: WisdomGateQuotaConfig,
  'gemini-cli': GeminiCliQuotaConfig,
  antigravity: AntigravityQuotaConfig,
  apertis: ApertisQuotaConfig,
  'kimi-code': KimiCodeQuotaConfig,
  poe: PoeQuotaConfig,
  'routing-run': RoutingRunQuotaConfig,
  ollama: OllamaQuotaConfig,
  devpass: DevPassQuotaConfig,
  neuralwatt: NeuralwattQuotaConfig,
  zenmux: ZenmuxQuotaConfig,
  wafer: WaferQuotaConfig,
  'opencode-go': OpenCodeGoQuotaConfig,
  crof: CrofQuotaConfig,
  exedev: ExeDevQuotaConfig,
  hyper: HyperQuotaConfig,
  sakana: SakanaQuotaConfig,
  cline: ClineQuotaConfig,
};

export function ProviderQuotaEditor({
  editingProvider,
  setEditingProvider,
  selectedQuotaCheckerType,
  selectableQuotaCheckerTypes,
  isOAuthMode,
  oauthCheckerType,
  quotaValidationError,
}: Props) {
  const setQuotaType = (quotaType: string) => {
    if (!quotaType) {
      setEditingProvider({ ...editingProvider, quotaChecker: undefined });
      return;
    }
    setEditingProvider({
      ...editingProvider,
      quotaChecker: {
        type: quotaType,
        enabled: true,
        intervalMinutes: Math.max(1, editingProvider.quotaChecker?.intervalMinutes || 30),
        options: editingProvider.quotaChecker?.options,
      },
    });
  };

  // The monitoring switch maps to the checker's real `enabled` flag: pausing
  // keeps the configured type/options (saved with enabled: false); it only
  // strips the checker entirely when nothing was ever configured.
  const monitoringOn =
    !!editingProvider.quotaChecker && editingProvider.quotaChecker.enabled !== false;

  const setMonitoring = (on: boolean) => {
    if (on) {
      setEditingProvider({
        ...editingProvider,
        quotaChecker: {
          type: editingProvider.quotaChecker?.type || (isOAuthMode ? (oauthCheckerType ?? '') : ''),
          enabled: true,
          intervalMinutes: Math.max(1, editingProvider.quotaChecker?.intervalMinutes || 30),
          options: editingProvider.quotaChecker?.options,
        },
      });
    } else if (editingProvider.quotaChecker?.type) {
      setEditingProvider({
        ...editingProvider,
        quotaChecker: { ...editingProvider.quotaChecker, enabled: false },
      });
    } else {
      setEditingProvider({ ...editingProvider, quotaChecker: undefined });
    }
  };

  const setQuotaInterval = (intervalMinutes: number) => {
    setEditingProvider({
      ...editingProvider,
      quotaChecker: {
        ...editingProvider.quotaChecker,
        type: selectedQuotaCheckerType,
        enabled: selectedQuotaCheckerType ? editingProvider.quotaChecker?.enabled !== false : false,
        intervalMinutes,
      },
    });
  };

  const setQuotaOptions = (options: Record<string, unknown>) => {
    setEditingProvider({
      ...editingProvider,
      quotaChecker: { ...editingProvider.quotaChecker, options } as Provider['quotaChecker'],
    });
  };

  const QuotaConfigComponent =
    monitoringOn && selectedQuotaCheckerType ? QUOTA_CONFIG_MAP[selectedQuotaCheckerType] : null;

  const quotaTypeOptions = selectableQuotaCheckerTypes.map((type) => ({
    value: type,
    label: type,
  }));

  // OAuth providers without a mapped checker type have nothing to monitor.
  const monitoringUnavailable = isOAuthMode && !oauthCheckerType && !monitoringOn;

  return (
    <SectionCard
      title="Quota monitoring"
      extra={
        <Switch
          aria-label="Enable quota monitoring"
          checked={monitoringOn}
          onChange={setMonitoring}
          disabled={monitoringUnavailable}
        />
      }
    >
      {monitoringOn ? (
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px] sm:items-end">
            <Select
              label="Type"
              value={selectedQuotaCheckerType}
              onChange={(value) => setQuotaType(value)}
              options={quotaTypeOptions}
              placeholder="— select type —"
              disabled={isOAuthMode}
            />
            <Input
              label="Interval (min)"
              type="number"
              min={1}
              step={1}
              value={editingProvider.quotaChecker?.intervalMinutes || 30}
              disabled={!selectedQuotaCheckerType}
              onChange={(e) => setQuotaInterval(Math.max(1, parseInt(e.target.value, 10) || 30))}
            />
          </div>
          <div className="mt-1 font-sans text-[11px] italic text-foreground-muted">
            {isOAuthMode && oauthCheckerType
              ? `Only the '${oauthCheckerType}' checker is available for this OAuth provider.`
              : isOAuthMode
                ? 'No quota checker is available for this OAuth provider type.'
                : 'Checks the provider on the configured interval.'}
          </div>

          {QuotaConfigComponent && (
            <div className="mt-3 rounded-md border border-border bg-surface-sunken p-3">
              <QuotaConfigComponent
                options={editingProvider.quotaChecker?.options || {}}
                onChange={setQuotaOptions}
              />
            </div>
          )}

          {quotaValidationError && (
            <div className="mt-2 rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger">
              {quotaValidationError}
            </div>
          )}
        </div>
      ) : (
        <div className="font-sans text-[11px] italic text-foreground-muted">
          {monitoringUnavailable
            ? 'No quota checker is available for this OAuth provider type.'
            : editingProvider.quotaChecker?.type
              ? `Quota monitoring is paused — the '${editingProvider.quotaChecker.type}' configuration is kept.`
              : 'Quota monitoring is off.'}
        </div>
      )}
    </SectionCard>
  );
}
