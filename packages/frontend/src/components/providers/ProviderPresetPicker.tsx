import { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import {
  applyProviderPreset,
  findProviderPreset,
  findUnresolvedPresetVars,
  substitutePresetVars,
  type PiAiQuirks,
  type ProviderCacheKeyInjection,
  type ProviderPreset,
  type ResponsesExtension,
} from '@plexus/shared';
import { api, type Provider } from '../../lib/api';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { SectionCard } from '../ui/SectionCard';

interface Props {
  editingProvider: Provider;
  setEditingProvider: React.Dispatch<React.SetStateAction<Provider>>;
  onSelectionChange: (selected: boolean) => void;
}

/**
 * Preset picker shown at the top of the Add Provider modal. Selecting a
 * preset fills endpoint and compatibility settings; the operator adds an API
 * key. Rendered for new providers only; never offered on edit, where applying
 * would clobber a working config.
 */
/** Draft fields a preset apply touches — snapshotted so Custom can undo it. */
interface PresetTouchedFields {
  id: string;
  name: string;
  apiBaseUrl?: string | Record<string, string>;
  apiKey: string;
  oauthProvider?: string;
  type: string | string[];
  pi_ai_provider?: string;
  pi_ai_quirks?: PiAiQuirks;
  auto_compat?: boolean;
  cacheKeyInjection?: ProviderCacheKeyInjection;
  responsesExtensions?: ResponsesExtension[];
}

/** Minimal draft for replaying a preset apply during comparison. */
function blankPresetDraftBase() {
  return {
    id: '',
    name: '',
    apiBaseUrl: {} as string | Record<string, string>,
    apiKey: '',
    oauthProvider: '' as string | undefined,
    type: [] as string | string[],
    pi_ai_provider: undefined as string | undefined,
    pi_ai_quirks: undefined as PiAiQuirks | undefined,
    auto_compat: undefined as boolean | undefined,
    cacheKeyInjection: undefined as ProviderCacheKeyInjection | undefined,
    responsesExtensions: undefined as ResponsesExtension[] | undefined,
  };
}

/** Shallow equality for draft field comparison (arrays and maps by value). */
function isEqualValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => item === b[index])
    );
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aRecord), ...Object.keys(bRecord)]);
    return [...keys].every((key) => isEqualValue(aRecord[key], bRecord[key]));
  }
  return a === b;
}

/** Fields whose preset-applied values Custom may restore. */
const RESTORABLE_KEYS = [
  'id',
  'name',
  'apiBaseUrl',
  'apiKey',
  'oauthProvider',
  'type',
  'pi_ai_provider',
  'pi_ai_quirks',
  'auto_compat',
  'cacheKeyInjection',
  'responsesExtensions',
] as const;

export function ProviderPresetPicker({
  editingProvider,
  setEditingProvider,
  onSelectionChange,
}: Props) {
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [appliedPreset, setAppliedPreset] = useState<ProviderPreset | null>(null);
  const [prePresetSnapshot, setPrePresetSnapshot] = useState<PresetTouchedFields | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getProviderPresets()
      .then((loaded) => {
        if (!cancelled) setPresets(loaded);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to load provider presets', error);
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPreset: ProviderPreset | undefined = selectedPresetId
    ? findProviderPreset(presets, selectedPresetId)
    : undefined;

  const handleSelect = (presetId: string) => {
    setSelectedPresetId(presetId);
    onSelectionChange(!!presetId);
    setVarValues({});
    if (!presetId) {
      // Back to Custom: restore the pre-preset values, but only for fields
      // the operator hasn't touched since the preset was applied — same rule
      // as switching presets, so post-apply edits are never clobbered.
      const snapshot = prePresetSnapshot;
      const applied = appliedPreset;
      setAppliedPreset(null);
      setPrePresetSnapshot(null);
      if (snapshot && applied) {
        const appliedValues = applyProviderPreset(
          { ...blankPresetDraftBase(), ...snapshot },
          applied,
          varValues
        );
        setEditingProvider((prev) => {
          const restored: Partial<Provider> = {};
          for (const key of RESTORABLE_KEYS) {
            if (isEqualValue(prev[key], appliedValues[key])) {
              (restored as Record<string, unknown>)[key] = snapshot[key];
            }
          }
          return { ...prev, ...restored };
        });
      }
      return;
    }
    const preset = findProviderPreset(presets, presetId);
    if (!preset) return;
    const previous = appliedPreset;
    if (!previous) {
      setPrePresetSnapshot({
        id: editingProvider.id,
        name: editingProvider.name,
        apiBaseUrl:
          typeof editingProvider.apiBaseUrl === 'string'
            ? editingProvider.apiBaseUrl
            : { ...(editingProvider.apiBaseUrl ?? {}) },
        apiKey: editingProvider.apiKey,
        oauthProvider: editingProvider.oauthProvider,
        type: Array.isArray(editingProvider.type)
          ? [...editingProvider.type]
          : editingProvider.type,
        pi_ai_provider: editingProvider.pi_ai_provider,
        pi_ai_quirks: editingProvider.pi_ai_quirks,
        auto_compat: editingProvider.auto_compat,
        cacheKeyInjection: editingProvider.cacheKeyInjection,
        responsesExtensions: editingProvider.responsesExtensions
          ? [...editingProvider.responsesExtensions]
          : undefined,
      });
    }
    setAppliedPreset(preset);
    setEditingProvider((prev) => {
      const applied = applyProviderPreset(prev, preset, {}, previous ?? undefined);
      if (!previous) return applied;
      const sourceEdited =
        prev.pi_ai_provider !== previous.piAiProvider ||
        !isEqualValue(prev.pi_ai_quirks, previous.piAiQuirks);
      if (!sourceEdited) return applied;
      return {
        ...applied,
        pi_ai_provider: prev.pi_ai_provider,
        pi_ai_quirks: prev.pi_ai_quirks,
        auto_compat: prev.pi_ai_provider || prev.pi_ai_quirks ? prev.auto_compat : false,
      };
    });
  };

  const handleVarChange = (preset: ProviderPreset, key: string, value: string) => {
    const nextVars = { ...varValues, [key]: value };
    setVarValues(nextVars);
    const prevSubstituted = substitutePresetVars(preset.apiBaseUrl, varValues);
    const nextSubstituted = substitutePresetVars(preset.apiBaseUrl, nextVars);
    setEditingProvider((prev) => {
      if (typeof prev.apiBaseUrl !== 'object' || prev.apiBaseUrl === null) return prev;
      const currentMap = prev.apiBaseUrl as Record<string, string>;
      const updated: Record<string, string> = { ...currentMap };
      for (const [apiType, nextUrl] of Object.entries(nextSubstituted)) {
        const current = currentMap[apiType];
        // Only rewrite untouched entries: a value the operator hand-edited
        // (no placeholder left and different from our last substitution) wins.
        if (current === undefined) {
          updated[apiType] = nextUrl;
        } else if (current.includes('{') || current === prevSubstituted[apiType]) {
          updated[apiType] = nextUrl;
        }
      }
      return { ...prev, apiBaseUrl: updated };
    });
  };

  const draftMap =
    typeof editingProvider.apiBaseUrl === 'object' && editingProvider.apiBaseUrl !== null
      ? (editingProvider.apiBaseUrl as Record<string, string>)
      : {};
  const unresolvedVars = findUnresolvedPresetVars(draftMap);

  return (
    <SectionCard title="Start from a preset">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Select
            aria-label="Start from a preset"
            value={selectedPresetId}
            onChange={handleSelect}
            disabled={isLoading}
            options={[
              { value: '', label: isLoading ? 'Loading presets…' : 'Custom (blank)' },
              ...presets.map((preset) => ({ value: preset.id, label: preset.name })),
            ]}
          />
          {loadError && (
            <div className="text-[11px] italic text-foreground-muted">
              Couldn&apos;t load provider presets ({loadError}). You can still configure a provider
              manually below.
            </div>
          )}
        </div>

        {selectedPreset && (
          <div className="flex flex-col gap-2 text-[11px] leading-relaxed text-foreground-muted">
            {selectedPreset.description && <div>{selectedPreset.description}</div>}

            {selectedPreset.experimentalApis.length > 0 && (
              <div className="flex items-start gap-2 rounded-sm border border-warning/30 bg-warning/10 px-2 py-1.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                <span className="text-warning">
                  Unverified endpoints, confirm before relying on them:{' '}
                  <span className="font-semibold">
                    {selectedPreset.experimentalApis.join(', ')}
                  </span>
                </span>
              </div>
            )}

            {selectedPreset.templateVars.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {selectedPreset.templateVars.map((variable) => (
                  <Input
                    key={variable.key}
                    label={variable.label}
                    placeholder={variable.placeholder ?? variable.key}
                    value={varValues[variable.key] ?? ''}
                    onChange={(e) => handleVarChange(selectedPreset, variable.key, e.target.value)}
                  />
                ))}
              </div>
            )}

            {unresolvedVars.length > 0 && (
              <div className="flex items-start gap-2 rounded-sm border border-warning/30 bg-warning/10 px-2 py-1.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                <span className="text-warning">
                  Unfilled template values ({unresolvedVars.join(', ')}) — fill them in above or
                  edit the URLs directly. Saving is blocked until they are resolved.
                </span>
              </div>
            )}

            {selectedPreset.notes && <div className="italic">{selectedPreset.notes}</div>}

            <div>
              Pre-fills {Object.keys(selectedPreset.apiBaseUrl).join(', ')} endpoints.{' '}
              {selectedPreset.piAiProvider ? (
                <>
                  Uses the pi-ai <code className="text-accent">{selectedPreset.piAiProvider}</code>{' '}
                  catalog; auto-compat requires a matching model ID.
                </>
              ) : selectedPreset.piAiQuirks ? (
                <>
                  Uses inline pi-ai-style quirks
                  {selectedPreset.autoCompat ? '.' : ' (auto-compat is off).'}
                </>
              ) : (
                <>No automatic quirk handling.</>
              )}{' '}
              Add your API key.
              {selectedPreset.docsUrl && (
                <>
                  {' '}
                  <a
                    href={selectedPreset.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    Provider docs <ExternalLink size={12} />
                  </a>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
