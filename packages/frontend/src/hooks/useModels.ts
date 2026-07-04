import Fuse from 'fuse.js';
import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { api, Alias, Provider, Model } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import {
  useAliases,
  useSaveAlias,
  useDeleteAlias,
  useDeleteAllAliases,
  useToggleAliasTarget,
  useUpdateAlias,
  useAvailableModels,
  useCooldowns,
} from './queries/useAliases';
import { useProviders } from './queries/useProviders';
import {
  toAliasPayload,
  ALIAS_FORM_DEFAULTS,
  type AliasFormValues,
} from '../pages/models/alias-schema';

export interface AliasMatch {
  alias: Alias;
  reason: string;
}

export interface OrphanGroup {
  modelId: string;
  existingAlias?: Alias;
  matchReason?: string;
  aliasMatches: AliasMatch[];
  candidates: Array<{ provider: Provider; model: Model }>;
}

interface AliasSearchEntry {
  alias: Alias;
  value: string;
  normalized: string;
}

const IMPORT_SUPPRESSIONS_STORAGE_KEY = 'plexus_suppressed_import_models';

const getSuppressedImportKey = (value: string) => value.toLowerCase();

const normalizeModelName = (value: string) =>
  value
    .toLowerCase()
    .split('/')
    .at(-1)!
    .split(':')
    .at(0)!
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const readSuppressedImportModels = () => {
  if (typeof window === 'undefined') return new Set<string>();

  try {
    const raw = window.localStorage.getItem(IMPORT_SUPPRESSIONS_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch (error) {
    console.warn('Failed to load suppressed import models from localStorage:', error);
    return new Set<string>();
  }
};

const saveSuppressedImportModels = (suppressed: Set<string>) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      IMPORT_SUPPRESSIONS_STORAGE_KEY,
      JSON.stringify(Array.from(suppressed).sort())
    );
  } catch (error) {
    console.warn('Failed to save suppressed import models to localStorage:', error);
  }
};

const getAliasSearchEntries = (aliasList: Alias[]): AliasSearchEntry[] =>
  aliasList.flatMap((alias) =>
    [alias.id, ...(alias.aliases ?? [])]
      .filter((value) => value.trim().length > 0)
      .map((value) => ({ alias, value, normalized: normalizeModelName(value) }))
  );

const getTokenSet = (value: string) =>
  new Set(normalizeModelName(value).split('-').filter(Boolean));

const getSharedPrefixTokenCount = (leftValue: string, rightValue: string) => {
  const left = normalizeModelName(leftValue).split('-');
  const right = normalizeModelName(rightValue).split('-');
  let count = 0;
  while (left[count] && left[count] === right[count]) count += 1;
  return count;
};

const hasStrongModelRelationship = (modelId: string, aliasValue: string) => {
  const normalizedModel = normalizeModelName(modelId);
  const normalizedAlias = normalizeModelName(aliasValue);
  if (!normalizedModel || !normalizedAlias) return false;
  if (normalizedModel === normalizedAlias) return true;
  if (
    normalizedModel.startsWith(`${normalizedAlias}-`) ||
    normalizedAlias.startsWith(`${normalizedModel}-`)
  ) {
    return true;
  }

  const modelTokens = getTokenSet(modelId);
  const aliasTokens = getTokenSet(aliasValue);
  const shared = Array.from(aliasTokens).filter((token) => modelTokens.has(token));
  const aliasCoverage = shared.length / aliasTokens.size;
  const prefixCount = getSharedPrefixTokenCount(modelId, aliasValue);

  return prefixCount >= 4 && aliasCoverage >= 0.8;
};

const getAliasMatches = (modelId: string, aliasList: Alias[]): AliasMatch[] => {
  const entries = getAliasSearchEntries(aliasList);
  const normalizedModel = normalizeModelName(modelId);
  const matches = new Map<string, AliasMatch>();

  const addMatch = (entry: AliasSearchEntry, reason: string) => {
    if (!matches.has(entry.alias.id)) {
      matches.set(entry.alias.id, { alias: entry.alias, reason });
    }
  };

  for (const entry of entries) {
    if (entry.normalized === normalizedModel) {
      addMatch(
        entry,
        entry.value === entry.alias.id ? 'exact match' : `alias match: ${entry.value}`
      );
    }
  }

  for (const entry of entries) {
    if (matches.has(entry.alias.id)) continue;
    if (normalizedModel.startsWith(`${entry.normalized}-`)) {
      addMatch(entry, `base alias match: ${entry.value}`);
    } else if (entry.normalized.startsWith(`${normalizedModel}-`)) {
      addMatch(entry, `variant alias match: ${entry.value}`);
    }
  }

  const fuse = new Fuse(entries, {
    keys: ['normalized'],
    includeScore: true,
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 4,
  });

  for (const result of fuse.search(normalizedModel)) {
    const entry = result.item;
    if (matches.has(entry.alias.id) || !hasStrongModelRelationship(modelId, entry.value)) continue;
    addMatch(entry, `similar alias: ${entry.value}`);
  }

  return Array.from(matches.values());
};

export const useModels = () => {
  const toast = useToast();

  // ---------------------------------------------------------------------------
  // react-query: data
  // ---------------------------------------------------------------------------
  const aliasesQuery = useAliases();
  const providersQuery = useProviders();
  const availableModelsQuery = useAvailableModels();
  const cooldownsQuery = useCooldowns();

  const allAliasesRaw = aliasesQuery.data ?? [];
  const providers = providersQuery.data ?? [];
  const availableModels = availableModelsQuery.data ?? [];
  const cooldowns = cooldownsQuery.data ?? [];
  const isLoading = aliasesQuery.isLoading;

  // ---------------------------------------------------------------------------
  // react-query: mutations
  // ---------------------------------------------------------------------------
  const saveAliasMutation = useSaveAlias();
  const deleteAliasMutation = useDeleteAlias();
  const deleteAllAliasesMutation = useDeleteAllAliases();
  const toggleTargetMutation = useToggleAliasTarget();
  const updateAliasMutation = useUpdateAlias();

  // ---------------------------------------------------------------------------
  // Search state (local — not a server concern)
  // ---------------------------------------------------------------------------
  const [search, setSearch] = useState('');

  // ---------------------------------------------------------------------------
  // Modal state
  // ---------------------------------------------------------------------------
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [originalId, setOriginalId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // rhf form — holds the full AliasFormValues (= Alias shape)
  //
  // Note: zodResolver is intentionally NOT wired here. handleSave uses the
  // existing manual validation (via toAliasPayload) to preserve exact legacy
  // behavior — live zod validation could newly reject previously-valid aliases.
  // aliasFormSchema (in alias-schema.ts) and toAliasPayload are retained for
  // the payload contract and characterization tests.
  // ---------------------------------------------------------------------------
  const { watch, reset } = useForm<AliasFormValues>({
    defaultValues: ALIAS_FORM_DEFAULTS,
  });

  // The form value IS the editing alias — sub-editors read this
  const editingAlias = watch() as unknown as Alias;

  // setEditingAlias-compatible: sub-editors call setEditingAlias({ ...editingAlias, field: value })
  // We intercept by wrapping reset(). Since all sub-editors use the object form (not function form),
  // this is safe. We cast through AliasFormValues since Alias and AliasFormValues are structurally identical.
  const setEditingAlias: React.Dispatch<React.SetStateAction<Alias>> = useCallback(
    (valueOrUpdater: Alias | ((prev: Alias) => Alias)) => {
      if (typeof valueOrUpdater === 'function') {
        // Function form — apply the updater to the current value
        reset((current) => {
          const currentAlias = current as unknown as Alias;
          const next = (valueOrUpdater as (prev: Alias) => Alias)(currentAlias);
          return next as unknown as AliasFormValues;
        });
      } else {
        reset(valueOrUpdater as unknown as AliasFormValues);
      }
    },
    [reset]
  );

  // ---------------------------------------------------------------------------
  // Test State (local — test result lifecycle is ephemeral)
  // ---------------------------------------------------------------------------
  const [testStates, setTestStates] = useState<
    Record<
      string,
      {
        loading: boolean;
        result?: 'success' | 'error';
        message?: string;
        showResult: boolean;
        showMessage?: boolean;
      }
    >
  >({});

  // ---------------------------------------------------------------------------
  // Import Orphaned Models State (local — UI-only state)
  // ---------------------------------------------------------------------------
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [orphanGroups, setOrphanGroups] = useState<OrphanGroup[]>([]);
  const [selectedImports, setSelectedImports] = useState<Map<string, Set<string>>>(new Map());
  const [selectedImportModels, setSelectedImportModels] = useState<Set<string>>(new Set());
  const [selectedImportAliases, setSelectedImportAliases] = useState<Map<string, string>>(
    new Map()
  );
  const [hasSuppressedImportModels, setHasSuppressedImportModels] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleEdit = (alias: Alias) => {
    setOriginalId(alias.id);
    reset(JSON.parse(JSON.stringify(alias)) as AliasFormValues);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setOriginalId(null);
    reset(JSON.parse(JSON.stringify(ALIAS_FORM_DEFAULTS)));
    setIsModalOpen(true);
  };

  const handleSave = async (alias: Alias, oldId: string | null) => {
    const result = toAliasPayload(alias as unknown as AliasFormValues);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }

    return new Promise<boolean>((resolve) => {
      saveAliasMutation.mutate(
        { alias: result.alias, oldId: oldId || undefined },
        {
          onSuccess: () => {
            setIsModalOpen(false);
            resolve(true);
          },
          onError: (err: Error) => {
            toast.error('Failed to save alias: ' + err.message);
            resolve(false);
          },
        }
      );
    });
  };

  const handleDelete = async (aliasId: string) => {
    return new Promise<boolean>((resolve) => {
      deleteAliasMutation.mutate(
        { aliasId },
        {
          onSuccess: () => resolve(true),
          onError: (err: Error) => {
            toast.error('Failed to delete alias: ' + err.message);
            resolve(false);
          },
        }
      );
    });
  };

  const handleDeleteAll = async () => {
    return new Promise<boolean>((resolve) => {
      deleteAllAliasesMutation.mutate(undefined, {
        onSuccess: () => resolve(true),
        onError: () => resolve(false),
      });
    });
  };

  const handleToggleTarget = async (
    alias: Alias,
    groupIndex: number,
    targetIndex: number,
    newState: boolean
  ) => {
    toggleTargetMutation.mutate({ alias, groupIndex, targetIndex, newState });
  };

  // Inline expand editor — optimistic per-change save (routing aliases + mappings)
  const handleUpdateAlias = (updated: Alias) => {
    updateAliasMutation.mutate({ alias: updated });
  };

  const handleTestTarget = async (
    _aliasId: string,
    testKey: string,
    provider: string,
    model: string,
    apiTypes: string[]
  ) => {
    setTestStates((prev) => ({
      ...prev,
      [testKey]: { loading: true, showResult: true, showMessage: false },
    }));

    try {
      const results = await Promise.all(
        apiTypes.map((apiType) => api.testModel(provider, model, apiType))
      );

      const allSuccess = results.every((r) => r.success);
      const firstError = results.find((r) => !r.success);
      const totalDuration = results.reduce((sum, r) => sum + (r.durationMs || 0), 0);
      const avgDuration = Math.round(totalDuration / results.length);

      setTestStates((prev) => ({
        ...prev,
        [testKey]: {
          loading: false,
          result: allSuccess ? 'success' : 'error',
          message: allSuccess
            ? `Success (${avgDuration}ms avg, ${apiTypes.length} API${apiTypes.length > 1 ? 's' : ''})`
            : `Failed via ${firstError?.apiType || 'unknown'}: ${firstError?.error || 'Test failed'}`,
          showResult: true,
          showMessage: true,
        },
      }));

      setTimeout(
        () => {
          setTestStates((prev) => ({
            ...prev,
            [testKey]: { ...prev[testKey], showResult: false },
          }));
        },
        allSuccess ? 3000 : 1500
      );

      if (allSuccess) {
        setTimeout(() => {
          setTestStates((prev) => ({
            ...prev,
            [testKey]: { ...prev[testKey], showMessage: false },
          }));
        }, 3000);
      }
    } catch (e) {
      setTestStates((prev) => ({
        ...prev,
        [testKey]: {
          loading: false,
          result: 'error',
          message: String(e),
          showResult: true,
          showMessage: true,
        },
      }));
      setTimeout(() => {
        setTestStates((prev) => ({
          ...prev,
          [testKey]: { ...prev[testKey], showResult: false },
        }));
      }, 1500);
    }
  };

  const dismissTestMessage = (testKey: string) => {
    setTestStates((prev) => ({
      ...prev,
      [testKey]: { ...prev[testKey], showMessage: false },
    }));
  };

  const filteredAliases = allAliasesRaw.filter((a) =>
    a.id.toLowerCase().includes(search.toLowerCase())
  );

  // loadData shim — keeps backward compatibility for callers that still call loadData()
  // (e.g. the import handler). With react-query, we just invalidate the queries.
  const loadData = useCallback(async () => {
    await aliasesQuery.refetch();
  }, [aliasesQuery]);

  const handleOpenImport = useCallback(() => {
    const covered = new Set<string>();
    const suppressedImports = readSuppressedImportModels();
    setHasSuppressedImportModels(suppressedImports.size > 0);
    allAliasesRaw.forEach((alias) => {
      alias.target_groups.forEach((g) => {
        g.targets.forEach((t) => {
          covered.add(`${t.provider}|${t.model}`);
        });
      });
    });

    const orphanMap = new Map<string, Array<{ provider: Provider; model: Model }>>();
    const canonicalIds = new Map<string, string>();
    availableModels.forEach((model) => {
      const key = `${model.providerId}|${model.id}`;
      if (covered.has(key)) return;
      if (suppressedImports.has(getSuppressedImportKey(model.id))) return;

      const groupKey = model.id.toLowerCase();
      if (!canonicalIds.has(groupKey)) {
        canonicalIds.set(groupKey, model.id);
      }

      if (!orphanMap.has(groupKey)) {
        orphanMap.set(groupKey, []);
      }
      const provider = providers.find((p) => p.id === model.providerId);
      if (provider) {
        orphanMap.get(groupKey)!.push({ provider, model });
      }
    });

    const groups: OrphanGroup[] = [];
    orphanMap.forEach((candidates, groupKey) => {
      const modelId = canonicalIds.get(groupKey) || groupKey;
      const aliasMatches = getAliasMatches(modelId, allAliasesRaw);
      groups.push({
        modelId,
        existingAlias: aliasMatches[0]?.alias,
        matchReason: aliasMatches[0]?.reason,
        aliasMatches,
        candidates,
      });
    });
    groups.sort((a, b) => a.modelId.localeCompare(b.modelId));

    const selections = new Map<string, Set<string>>();
    const aliasSelections = new Map<string, string>();
    groups.forEach((group) => {
      selections.set(group.modelId, new Set(group.candidates.map((c) => c.provider.id)));
      if (group.aliasMatches[0]) {
        aliasSelections.set(group.modelId, group.aliasMatches[0].alias.id);
      }
    });

    setOrphanGroups(groups);
    setSelectedImports(selections);
    setSelectedImportModels(new Set());
    setSelectedImportAliases(aliasSelections);
    setIsImportModalOpen(true);
  }, [allAliasesRaw, availableModels, providers]);

  const handleSuppressImportModel = useCallback((modelId: string) => {
    const nextSuppressed = readSuppressedImportModels();
    nextSuppressed.add(getSuppressedImportKey(modelId));
    saveSuppressedImportModels(nextSuppressed);
    setHasSuppressedImportModels(true);

    setOrphanGroups((prev) => prev.filter((group) => group.modelId !== modelId));
    setSelectedImports((prev) => {
      const next = new Map(prev);
      next.delete(modelId);
      return next;
    });
    setSelectedImportModels((prev) => {
      const next = new Set(prev);
      next.delete(modelId);
      return next;
    });
    setSelectedImportAliases((prev) => {
      const next = new Map(prev);
      next.delete(modelId);
      return next;
    });
  }, []);

  const handleUnsuppressAllImportModels = useCallback(() => {
    saveSuppressedImportModels(new Set());
    handleOpenImport();
  }, [handleOpenImport]);

  const handleSaveImports = useCallback(async () => {
    setIsImporting(true);
    try {
      const EMPTY_ALIAS_TARGET_GROUP = {
        name: 'default',
        selector: 'random',
        targets: [],
      };

      for (const modelId of selectedImportModels) {
        const providerIds = selectedImports.get(modelId) ?? new Set<string>();
        if (providerIds.size === 0) continue;

        const group = orphanGroups.find((g) => g.modelId === modelId);
        if (!group) continue;

        const selectedCandidates = group.candidates.filter((c) => providerIds.has(c.provider.id));
        const selectedAliasId = selectedImportAliases.get(modelId);
        const selectedAlias = selectedAliasId
          ? group.aliasMatches.find((match) => match.alias.id === selectedAliasId)?.alias
          : undefined;

        if (selectedAlias) {
          const updatedAlias = JSON.parse(JSON.stringify(selectedAlias)) as Alias;
          if (!updatedAlias.target_groups[0]) {
            updatedAlias.target_groups = [{ ...EMPTY_ALIAS_TARGET_GROUP }];
          }
          // Merge into the first group of the existing alias
          selectedCandidates.forEach((c) => {
            const alreadyExists = updatedAlias.target_groups[0].targets.some(
              (t) => t.provider === c.provider.id && t.model === c.model.id
            );
            if (!alreadyExists) {
              updatedAlias.target_groups[0].targets.push({
                provider: c.provider.id,
                model: c.model.id,
                enabled: true,
              });
            }
          });
          await api.saveAlias(updatedAlias, selectedAlias.id);
        } else {
          const newAlias: Alias = {
            id: modelId,
            aliases: [],
            priority: 'selector',
            sticky_session: true,
            target_groups: [
              {
                name: 'default',
                selector: 'random',
                targets: selectedCandidates.map((c) => ({
                  provider: c.provider.id,
                  model: c.model.id,
                  enabled: true,
                })),
              },
            ],
          };
          await api.saveAlias(newAlias, undefined);
        }
      }

      await loadData();
      toast.success('Imports saved successfully');
      setIsImportModalOpen(false);
      setSelectedImports(new Map());
      setSelectedImportModels(new Set());
      setSelectedImportAliases(new Map());
      setOrphanGroups([]);
      return true;
    } catch (e) {
      console.error('Failed to save imports', e);
      toast.error('Failed to save imports');
      return false;
    } finally {
      setIsImporting(false);
    }
  }, [selectedImportModels, selectedImports, selectedImportAliases, orphanGroups, loadData, toast]);

  // isSaving derived from mutation state
  const isSaving = saveAliasMutation.isPending;

  return {
    aliases: filteredAliases,
    allAliases: allAliasesRaw,
    providers,
    availableModels,
    cooldowns,
    search,
    setSearch,
    isLoading,
    isModalOpen,
    setIsModalOpen,
    editingAlias,
    setEditingAlias,
    originalId,
    isSaving,
    testStates,
    handleEdit,
    handleAddNew,
    handleSave,
    handleDelete,
    handleDeleteAll,
    handleToggleTarget,
    handleUpdateAlias,
    handleTestTarget,
    dismissTestMessage,
    loadData,
    isImportModalOpen,
    setIsImportModalOpen,
    orphanGroups,
    setOrphanGroups,
    selectedImports,
    setSelectedImports,
    selectedImportModels,
    setSelectedImportModels,
    selectedImportAliases,
    setSelectedImportAliases,
    hasSuppressedImportModels,
    isImporting,
    handleOpenImport,
    handleSuppressImportModel,
    handleUnsuppressAllImportModels,
    handleSaveImports,
  };
};
