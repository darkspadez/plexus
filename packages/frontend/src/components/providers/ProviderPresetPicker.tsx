import { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import {
  applyProviderPreset,
  findProviderPreset,
  findUnresolvedPresetVars,
  substitutePresetVars,
  type ProviderPreset,
} from '@plexus/shared';
import { api, type Provider } from '../../lib/api';

const SELECT_CLASS =
  'w-full h-[27px] py-0 px-2 font-body text-[12px] leading-none text-text bg-bg-glass border border-border-glass rounded-sm outline-none focus:border-primary';
const INPUT_CLASS =
  'w-full h-[27px] py-0 px-2 font-body text-[12px] leading-none text-text bg-bg-glass border border-border-glass rounded-sm outline-none focus:border-primary';

interface Props {
  editingProvider: Provider;
  setEditingProvider: React.Dispatch<React.SetStateAction<Provider>>;
}

/**
 * Preset picker shown at the top of the Add Provider modal. Selecting a
 * preset fills the id/name suggestions, endpoint map, pi-ai provider, and
 * auto-compat — the operator only adds an API key. Rendered for new
 * providers only; never offered on edit, where applying would clobber a
 * working config.
 */
/** Draft fields a preset apply touches — snapshotted so Custom can undo it. */
interface PresetTouchedFields {
  id: string;
  name: string;
  apiBaseUrl?: string | Record<string, string>;
  type: string | string[];
  pi_ai_provider?: string;
  auto_compat?: boolean;
}

export function ProviderPresetPicker({ editingProvider, setEditingProvider }: Props) {
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
    setVarValues({});
    if (!presetId) {
      // Back to Custom: restore whatever the draft held before the first
      // preset was applied (the API key and everything else stay as typed).
      if (prePresetSnapshot) {
        const snapshot = prePresetSnapshot;
        setEditingProvider((prev) => ({ ...prev, ...snapshot }));
      }
      setAppliedPreset(null);
      setPrePresetSnapshot(null);
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
        type: Array.isArray(editingProvider.type)
          ? [...editingProvider.type]
          : editingProvider.type,
        pi_ai_provider: editingProvider.pi_ai_provider,
        auto_compat: editingProvider.auto_compat,
      });
    }
    setAppliedPreset(preset);
    setEditingProvider((prev) => applyProviderPreset(prev, preset, {}, previous ?? undefined));
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
    <div className="flex flex-col gap-2 border border-border-glass rounded-md p-3 bg-bg-subtle">
      <div className="flex flex-col gap-1">
        <label className="font-body text-[13px] font-medium text-text-secondary">
          Start from a preset
        </label>
        <select
          className={SELECT_CLASS}
          value={selectedPresetId}
          onChange={(e) => handleSelect(e.target.value)}
          disabled={isLoading}
        >
          <option value="">{isLoading ? 'Loading presets…' : 'Custom (blank)'}</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        {loadError && (
          <div className="text-[11px] text-text-secondary" style={{ fontStyle: 'italic' }}>
            Couldn&apos;t load provider presets ({loadError}). You can still configure a provider
            manually below.
          </div>
        )}
      </div>

      {selectedPreset && (
        <div className="flex flex-col gap-2 text-[11px] text-text-secondary leading-relaxed">
          {selectedPreset.description && <div>{selectedPreset.description}</div>}

          {selectedPreset.experimentalApis.length > 0 && (
            <div className="flex items-start gap-2 py-1.5 px-2 bg-warning/10 border border-warning/30 rounded-sm">
              <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
              <span className="text-warning">
                Unverified endpoints, confirm before relying on them:{' '}
                <span style={{ fontWeight: 600 }}>
                  {selectedPreset.experimentalApis.join(', ')}
                </span>
              </span>
            </div>
          )}

          {selectedPreset.templateVars.length > 0 && (
            <div className="flex flex-col gap-1">
              {selectedPreset.templateVars.map((variable) => (
                <div key={variable.key} className="flex flex-col gap-1">
                  <label className="font-body text-[12px] font-medium text-text-secondary">
                    {variable.label}
                  </label>
                  <input
                    className={INPUT_CLASS}
                    placeholder={variable.placeholder ?? variable.key}
                    value={varValues[variable.key] ?? ''}
                    onChange={(e) => handleVarChange(selectedPreset, variable.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}

          {unresolvedVars.length > 0 && (
            <div className="flex items-start gap-2 py-1.5 px-2 bg-warning/10 border border-warning/30 rounded-sm">
              <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
              <span className="text-warning">
                Unfilled template values ({unresolvedVars.join(', ')}) — fill them in above or edit
                the URLs directly. Saving is blocked until they are resolved.
              </span>
            </div>
          )}

          {selectedPreset.notes && (
            <div style={{ fontStyle: 'italic' }}>{selectedPreset.notes}</div>
          )}

          <div className="text-[11px] text-text-secondary">
            Pre-fills {Object.keys(selectedPreset.apiBaseUrl).join(', ')} endpoints, pi-ai provider{' '}
            <code className="text-primary">{selectedPreset.piAiProvider}</code>, and auto-compat.
            Just add your API key.
            {selectedPreset.docsUrl && (
              <>
                {' '}
                <a
                  href={selectedPreset.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1"
                >
                  Provider docs <ExternalLink size={12} />
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
