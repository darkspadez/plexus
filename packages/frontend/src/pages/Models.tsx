import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  api,
  Alias,
  AliasMetadata,
  AliasBehavior,
  MetadataOverrides,
  MetadataSource,
  NormalizedModelMetadata,
  Provider,
  Model,
} from '../lib/api';
import { useModels } from '../hooks/useModels';
import { AliasTableRow } from '../components/models/AliasTableRow';
import { MetadataOverrideForm } from '../components/models/MetadataOverrideForm';
import { Button } from '../components/forms/Button';
import { Modal } from '../components/forms/Modal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui-v2/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui-v2/dialog';
import { Switch } from '../components/ui-v2/switch';
import { Input } from '../components/ui-v2/input';
import { SearchInput } from '../components/ui-v2/search-input';
import { EmptyState } from '../components/ui-v2/empty-state';
import { Section } from '../components/ui-v2/section';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui-v2/select';
import { ListPage } from '../components/templates';
import { useToast } from '../contexts/ToastContext';
import {
  Plus,
  Trash2,
  Loader2,
  Zap,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Search,
  X,
  CheckCircle,
  GripVertical,
  Save,
  Eye,
  AlertTriangle,
  Cpu,
  Network,
  RefreshCw,
} from 'lucide-react';

export const Models = () => {
  const toast = useToast();
  const {
    aliases,
    allAliases,
    providers,
    availableModels,
    cooldowns,
    search,
    setSearch,
    isModalOpen,
    setIsModalOpen,
    editingAlias,
    setEditingAlias,
    originalId,
    isSaving,
    testStates,
    isLoading,
    handleEdit,
    handleAddNew,
    handleSave: hookSave,
    handleDelete: hookDelete,
    handleToggleTarget,
    handleTestTarget,
    loadData,
  } = useModels();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadData();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Modal State
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isArchitectureOpen, setIsArchitectureOpen] = useState(false);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  // "Override" toggle for non-custom sources. When on, the editable field
  // grid is shown so the user can override individual enriched fields.
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);

  // Metadata search state
  const [metadataQuery, setMetadataQuery] = useState('');
  const [metadataResults, setMetadataResults] = useState<{ id: string; name: string }[]>([]);
  const [isMetadataSearching, setIsMetadataSearching] = useState(false);

  // HuggingFace model architecture fetch state
  const [hfModelId, setHfModelId] = useState('');
  const [isFetchingHfModel, setIsFetchingHfModel] = useState(false);
  const [hfFetchError, setHfFetchError] = useState<string | null>(null);
  const [showMetadataDropdown, setShowMetadataDropdown] = useState(false);
  const metadataSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metadataInputWrapperRef = useRef<HTMLDivElement | null>(null);
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Delete Confirmation State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [aliasToDelete, setAliasToDelete] = useState<Alias | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Auto Add Modal State
  const [isAutoAddModalOpen, setIsAutoAddModalOpen] = useState(false);
  const [substring, setSubstring] = useState('');
  const [filteredModels, setFilteredModels] = useState<Array<{ model: Model; provider: Provider }>>(
    []
  );
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());

  // Drag and Drop State
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Global Descriptor State
  const [globalDescriptorModel, setGlobalDescriptorModel] = useState('');
  const [isSavingDescriptor, setIsSavingDescriptor] = useState(false);

  // Reference values used by `countOverrides` to distinguish genuine overrides
  // from fields that merely mirror the auto-populated catalog values.
  //   undefined -> catalog lookup hasn't resolved yet (or not applicable)
  //   null      -> lookup failed / no catalog record (treat as empty reference)
  //   object    -> loaded catalog values, converted to the overrides shape
  const [catalogReference, setCatalogReference] = useState<MetadataOverrides | null | undefined>(
    undefined
  );

  useEffect(() => {
    const fetchVFConfig = async () => {
      try {
        const config = await api.getVisionFallthroughConfig();
        if (config?.descriptor_model) {
          setGlobalDescriptorModel(config.descriptor_model);
        }
      } catch (e) {
        console.error('Failed to load VF config', e);
      }
    };
    fetchVFConfig();
  }, []);

  // When the modal opens, sync override panel state + search query with the
  // current alias's metadata block.
  useEffect(() => {
    if (!isModalOpen) return;
    // Cancel any debounce left over from the previous modal session so it
    // can't land results against the newly-loaded alias.
    cancelMetadataDebounce();
    const meta = editingAlias.metadata;
    setIsOverrideOpen(!!meta && (meta.source === 'custom' || !!meta.overrides));
    setMetadataQuery(meta?.source_path ?? '');
    setShowMetadataDropdown(false);
    setMetadataResults([]);
    setIsMetadataSearching(false);
    // Only re-run when the modal transitions open (or editingAlias.id changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, editingAlias.id]);

  const handleSaveDescriptor = async () => {
    setIsSavingDescriptor(true);
    try {
      await api.updateVisionFallthroughConfig({
        descriptor_model: globalDescriptorModel,
      });
    } catch (e) {
      console.error('Failed to save descriptor model', e);
    } finally {
      setIsSavingDescriptor(false);
    }
  };

  const handleSave = async () => {
    if (!editingAlias.id) return;
    // Custom metadata requires a non-empty name — the backend Zod schema will
    // reject it otherwise. Surface a clear error here instead of letting the
    // save API call fail generically.
    if (editingAlias.metadata?.source === 'custom') {
      const name = editingAlias.metadata.overrides?.name;
      if (!name || name.trim() === '') {
        toast.error('Custom metadata requires a non-empty Name.');
        return;
      }
    }
    await hookSave(editingAlias, originalId);
  };

  const handleDeleteClick = (alias: Alias) => {
    setAliasToDelete(alias);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!aliasToDelete) return;
    setIsDeleting(true);
    const success = await hookDelete(aliasToDelete.id);
    if (success) {
      setIsDeleteModalOpen(false);
      setAliasToDelete(null);
    }
    setIsDeleting(false);
  };

  const updateTarget = (
    index: number,
    field: 'provider' | 'model' | 'enabled',
    value: string | boolean
  ) => {
    const newTargets = [...editingAlias.targets];
    // When provider changes, clear model
    if (field === 'provider') {
      newTargets[index] = {
        provider: value as string,
        model: '',
        enabled: newTargets[index].enabled,
      };
    } else if (field === 'enabled') {
      newTargets[index] = { ...newTargets[index], enabled: value as boolean };
    } else if (field === 'model') {
      newTargets[index] = { ...newTargets[index], model: value as string };
    }
    setEditingAlias({ ...editingAlias, targets: newTargets });
  };

  const moveTarget = (index: number, direction: 'up' | 'down') => {
    const newTargets = [...editingAlias.targets];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newTargets.length) return;

    const [movedItem] = newTargets.splice(index, 1);
    newTargets.splice(newIndex, 0, movedItem);
    setEditingAlias({ ...editingAlias, targets: newTargets });
  };

  const addTarget = () => {
    setEditingAlias({
      ...editingAlias,
      targets: [...editingAlias.targets, { provider: '', model: '', enabled: true }],
    });
  };

  const removeTarget = (index: number) => {
    const newTargets = [...editingAlias.targets];
    newTargets.splice(index, 1);
    setEditingAlias({ ...editingAlias, targets: newTargets });
  };

  const handleSearchModels = (query?: string) => {
    const searchTerm = query !== undefined ? query : substring;
    if (!searchTerm.trim()) {
      setFilteredModels([]);
      return;
    }

    const searchLower = searchTerm.toLowerCase();

    const matches: Array<{ model: Model; provider: Provider }> = [];
    availableModels.forEach((model) => {
      const provider = providers.find((p) => p.id === model.providerId);
      if (
        provider &&
        (model.name.toLowerCase().includes(searchLower) ||
          provider.name.toLowerCase().includes(searchLower))
      ) {
        matches.push({ model, provider: { ...provider } });
      }
    });

    setFilteredModels(matches);
  };

  const handleOpenAutoAdd = () => {
    const query = editingAlias.id || '';
    setSubstring(query);
    setSelectedModels(new Set());
    setIsAutoAddModalOpen(true);
    // Run search immediately with the pre-filled query so results appear
    // without requiring a manual button click (fixes #148).
    handleSearchModels(query);
  };

  const handleToggleModelSelection = (modelId: string, providerId: string) => {
    const key = `${providerId}|${modelId}`;
    const newSelection = new Set(selectedModels);
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    setSelectedModels(newSelection);
  };

  const handleAddSelectedModels = () => {
    const newTargets = [...editingAlias.targets];

    selectedModels.forEach((key) => {
      const separatorIndex = key.indexOf('|');
      const providerId = key.substring(0, separatorIndex);
      const modelId = key.substring(separatorIndex + 1);
      const provider = providers.find((p) => p.id === providerId);
      const model = availableModels.find((m) => m.id === modelId && m.providerId === providerId);

      if (provider && model) {
        const alreadyExists = editingAlias.targets.some(
          (t) => t.provider === providerId && t.model === modelId
        );
        if (!alreadyExists) {
          newTargets.push({
            provider: providerId,
            model: modelId,
            enabled: true,
          });
        }
      }
    });

    setEditingAlias({ ...editingAlias, targets: newTargets });
    setIsAutoAddModalOpen(false);
    setSubstring('');
    setFilteredModels([]);
    setSelectedModels(new Set());
  };

  const addAlias = () => {
    setEditingAlias({
      ...editingAlias,
      aliases: [...(editingAlias.aliases || []), ''],
    });
  };

  const updateAlias = (index: number, value: string) => {
    const newAliases = [...(editingAlias.aliases || [])];
    newAliases[index] = value;
    setEditingAlias({ ...editingAlias, aliases: newAliases });
  };

  const removeAlias = (index: number) => {
    const newAliases = [...(editingAlias.aliases || [])];
    newAliases.splice(index, 1);
    setEditingAlias({ ...editingAlias, aliases: newAliases });
  };

  /** Returns the current `enabled` state of a named behavior, defaulting to false. */
  const getBehavior = (type: AliasBehavior['type']): boolean => {
    return (editingAlias.advanced ?? []).some((b) => b.type === type && b.enabled !== false);
  };

  /** Toggles a behavior on/off, adding it to the list if not present. */
  const setBehavior = (type: AliasBehavior['type'], enabled: boolean) => {
    const current = editingAlias.advanced ?? [];
    const without = current.filter((b) => b.type !== type);
    const next: AliasBehavior[] = enabled
      ? [...without, { type, enabled: true } as AliasBehavior]
      : without; // remove entirely when disabled to keep YAML clean
    setEditingAlias({ ...editingAlias, advanced: next });
  };

  /**
   * Cancel any pending debounced metadata search so a stale response cannot
   * later overwrite `metadataResults` after the source/query has moved on.
   * Callers that change `metadata.source` or clear the query must invoke this
   * before mutating state.
   */
  const cancelMetadataDebounce = () => {
    if (metadataSearchRef.current) {
      clearTimeout(metadataSearchRef.current);
      metadataSearchRef.current = null;
    }
  };

  /** Search metadata catalog for autocomplete */
  const handleMetadataSearch = useCallback((query: string, source: MetadataSource) => {
    if (source === 'custom') {
      // Custom has no catalog to search against — also kill any pending debounce
      // from the prior catalog source so it can't land stale results.
      cancelMetadataDebounce();
      setMetadataQuery(query);
      setMetadataResults([]);
      setShowMetadataDropdown(false);
      setIsMetadataSearching(false);
      return;
    }
    setMetadataQuery(query);
    cancelMetadataDebounce();
    if (!query.trim()) {
      setMetadataResults([]);
      setShowMetadataDropdown(false);
      setIsMetadataSearching(false);
      return;
    }
    setIsMetadataSearching(true);
    setShowMetadataDropdown(true);
    metadataSearchRef.current = setTimeout(async () => {
      try {
        const resp = await api.searchModelMetadata(source, query, 30);
        setMetadataResults(resp.data);
      } catch {
        setMetadataResults([]);
      } finally {
        setIsMetadataSearching(false);
      }
    }, 250);
  }, []);

  /** Select a metadata result and set it on the alias (preserves existing overrides). */
  const selectMetadataResult = (result: { id: string; name: string }) => {
    const current = editingAlias.metadata;
    const source: Exclude<MetadataSource, 'custom'> =
      current?.source && current.source !== 'custom' ? current.source : 'openrouter';
    setEditingAlias({
      ...editingAlias,
      metadata: {
        source,
        source_path: result.id,
        ...(current?.overrides ? { overrides: current.overrides } : {}),
      },
    });
    setMetadataQuery(result.name);
    setShowMetadataDropdown(false);
    setMetadataResults([]);
    // If override is already on, refresh the form with the newly-selected
    // model's catalog values (still preserving any fields the user typed).
    if (isOverrideOpen) {
      populateOverridesFromCatalog(source, result.id);
    }
  };

  /** Clear metadata from the alias */
  const clearMetadata = () => {
    // Drop any in-flight debounced search so it can't repopulate results
    // against an alias that no longer has metadata attached.
    cancelMetadataDebounce();
    const { metadata: _removed, ...rest } = editingAlias;
    setEditingAlias(rest as Alias);
    setMetadataQuery('');
    setMetadataResults([]);
    setShowMetadataDropdown(false);
    setIsMetadataSearching(false);
    // Without this, re-adding a source would reopen the override form with
    // stale `isOverrideOpen` state from the cleared metadata.
    setIsOverrideOpen(false);
  };

  /** Seed defaults when a user first picks the 'custom' source. */
  const buildCustomDefaults = (aliasId: string): MetadataOverrides => ({
    name: aliasId || 'Custom Model',
    context_length: 4096,
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    pricing: { prompt: '0', completion: '0' },
    supported_parameters: [],
  });

  /**
   * Convert a catalog metadata record into the `MetadataOverrides` shape,
   * keeping only defined fields so no spurious empty keys land in the config.
   */
  const metadataToOverrides = (meta: NormalizedModelMetadata): MetadataOverrides => {
    const out: MetadataOverrides = {};
    if (meta.name) out.name = meta.name;
    if (meta.description !== undefined) out.description = meta.description;
    if (meta.context_length !== undefined) out.context_length = meta.context_length;
    if (meta.pricing) {
      const p: NonNullable<MetadataOverrides['pricing']> = {};
      if (meta.pricing.prompt !== undefined) p.prompt = meta.pricing.prompt;
      if (meta.pricing.completion !== undefined) p.completion = meta.pricing.completion;
      if (meta.pricing.input_cache_read !== undefined)
        p.input_cache_read = meta.pricing.input_cache_read;
      if (meta.pricing.input_cache_write !== undefined)
        p.input_cache_write = meta.pricing.input_cache_write;
      if (Object.keys(p).length > 0) out.pricing = p;
    }
    if (meta.architecture) {
      const a: NonNullable<MetadataOverrides['architecture']> = {};
      if (meta.architecture.input_modalities && meta.architecture.input_modalities.length > 0)
        a.input_modalities = [...meta.architecture.input_modalities];
      if (meta.architecture.output_modalities && meta.architecture.output_modalities.length > 0)
        a.output_modalities = [...meta.architecture.output_modalities];
      if (meta.architecture.tokenizer !== undefined) a.tokenizer = meta.architecture.tokenizer;
      if (Object.keys(a).length > 0) out.architecture = a;
    }
    if (meta.supported_parameters && meta.supported_parameters.length > 0)
      out.supported_parameters = [...meta.supported_parameters];
    if (meta.top_provider) {
      const tp: NonNullable<MetadataOverrides['top_provider']> = {};
      if (meta.top_provider.context_length !== undefined)
        tp.context_length = meta.top_provider.context_length;
      if (meta.top_provider.max_completion_tokens !== undefined)
        tp.max_completion_tokens = meta.top_provider.max_completion_tokens;
      if (Object.keys(tp).length > 0) out.top_provider = tp;
    }
    return out;
  };

  /**
   * Return `current` with its overrides replaced by `overrides`, preserving
   * the 'custom' variant's `name: string` invariant for the type system.
   * Callers that delete `name` for a custom source are relying on the
   * runtime code path that substitutes an empty string; this helper keeps
   * that guarantee visible to TypeScript.
   */
  const withOverrides = (current: AliasMetadata, overrides: MetadataOverrides): AliasMetadata => {
    if (current.source === 'custom') {
      return {
        ...current,
        overrides: {
          ...overrides,
          name: overrides.name ?? current.overrides.name,
        },
      };
    }
    return { ...current, overrides };
  };

  /**
   * Return the subset of `existing` that differs from `reference`. Used to
   * strip auto-populated-from-catalog values out of an overrides blob so that
   * only genuine user-edits remain. Top-level fields are compared by identity
   * (or element-wise for arrays); nested objects (pricing/architecture/
   * top_provider) are compared field-by-field one level deep.
   */
  const diffOverrides = (
    existing: MetadataOverrides,
    reference: MetadataOverrides
  ): MetadataOverrides => {
    const valuesEqual = (a: unknown, b: unknown): boolean => {
      if (a === b) return true;
      if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((v, i) => v === b[i]);
      }
      return false;
    };
    const out: MetadataOverrides = {};
    for (const key of Object.keys(existing) as (keyof MetadataOverrides)[]) {
      const ev = existing[key];
      const rv = reference[key];
      if (ev === undefined) continue;
      if (
        ev !== null &&
        typeof ev === 'object' &&
        !Array.isArray(ev) &&
        rv !== null &&
        typeof rv === 'object' &&
        !Array.isArray(rv)
      ) {
        // Nested object (pricing/architecture/top_provider): recurse one level.
        const nested: Record<string, unknown> = {};
        for (const sub of Object.keys(ev as object)) {
          const sev = (ev as Record<string, unknown>)[sub];
          const srv = (rv as Record<string, unknown>)[sub];
          if (sev !== undefined && !valuesEqual(sev, srv)) nested[sub] = sev;
        }
        if (Object.keys(nested).length > 0) {
          (out as Record<string, unknown>)[key] = nested;
        }
      } else if (!valuesEqual(ev, rv)) {
        (out as Record<string, unknown>)[key] = ev;
      }
    }
    return out;
  };

  /**
   * Fetch catalog metadata for (source, sourcePath) and populate the override
   * form with those values, preserving any overrides the user has already
   * typed (user-entered values win on conflict).
   *
   * Silently no-ops when source is custom, source_path is unset, or the lookup
   * fails — in those cases the form simply stays empty.
   *
   * Caller must pass explicit (source, sourcePath) rather than reading
   * `editingAlias` here, because we're often invoked right after a state
   * update that hasn't flushed — e.g. when the user selects a new catalog
   * model while override is already on.
   */
  const populateOverridesFromCatalog = async (
    source: Exclude<MetadataSource, 'custom'>,
    sourcePath: string
  ) => {
    if (!sourcePath) return;
    // Capture the current catalog snapshot BEFORE the async fetch. When the
    // caller (e.g. selectMetadataResult) has just switched catalog models,
    // this is still the prior catalog — exactly what we need to distinguish
    // true user edits from values that were auto-populated last time.
    const priorCatalog = catalogReference ?? null;
    try {
      const catalog = await api.getModelMetadata(source, sourcePath);
      if (!catalog) return;
      const catalogOverrides = metadataToOverrides(catalog);
      setEditingAlias((prev) => {
        // Bail if the alias's metadata pointer changed while we were fetching
        // (e.g. user toggled off, or picked a different model).
        if (!prev.metadata || prev.metadata.source === 'custom') return prev;
        if (prev.metadata.source !== source || prev.metadata.source_path !== sourcePath)
          return prev;
        // `existing` may hold values that were auto-populated from the prior
        // catalog rather than typed by the user. Strip anything matching the
        // prior snapshot so only real user-edits layer over the new catalog.
        // When we have no prior snapshot (first populate), treat `existing`
        // as all user-edits.
        const existing = prev.metadata.overrides ?? {};
        const userEdits = priorCatalog ? diffOverrides(existing, priorCatalog) : existing;
        const merged: MetadataOverrides = {
          ...catalogOverrides,
          ...userEdits,
          ...(catalogOverrides.pricing || userEdits.pricing
            ? { pricing: { ...(catalogOverrides.pricing ?? {}), ...(userEdits.pricing ?? {}) } }
            : {}),
          ...(catalogOverrides.architecture || userEdits.architecture
            ? {
                architecture: {
                  ...(catalogOverrides.architecture ?? {}),
                  ...(userEdits.architecture ?? {}),
                },
              }
            : {}),
          ...(catalogOverrides.top_provider || userEdits.top_provider
            ? {
                top_provider: {
                  ...(catalogOverrides.top_provider ?? {}),
                  ...(userEdits.top_provider ?? {}),
                },
              }
            : {}),
        };
        return { ...prev, metadata: { ...prev.metadata, overrides: merged } };
      });
    } catch {
      // Leave the form blank on error; existing helper text tells the user
      // blank fields fall back to the catalog value.
    }
  };

  // Keep `catalogReference` in sync with the currently selected catalog
  // (source, source_path). Used by `countOverrides` to decide which fields
  // actually differ from the auto-populated values.
  useEffect(() => {
    const meta = editingAlias.metadata;
    if (!meta || meta.source === 'custom' || !meta.source_path) {
      setCatalogReference(undefined);
      return;
    }
    const { source, source_path } = meta;
    let cancelled = false;
    (async () => {
      try {
        const catalog = await api.getModelMetadata(source, source_path);
        if (cancelled) return;
        setCatalogReference(catalog ? metadataToOverrides(catalog) : null);
      } catch {
        if (!cancelled) setCatalogReference(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // metadataToOverrides is a stable local helper that doesn't close over state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingAlias.metadata?.source, editingAlias.metadata?.source_path]);

  /**
   * Patch a single field in the override blob. `undefined` removes the key
   * so the field falls back to the catalog value — except for the `name`
   * field in custom mode, which has no catalog fallback and is required by
   * the backend schema. In that case we store an empty string instead of
   * deleting, letting the save-time validator surface the error clearly.
   */
  const setOverrideField = <K extends keyof MetadataOverrides>(
    key: K,
    value: MetadataOverrides[K] | undefined
  ) => {
    const current = editingAlias.metadata;
    if (!current) return;
    const nextOverrides: MetadataOverrides = { ...(current.overrides ?? {}) };
    if (value === undefined) {
      if (current.source === 'custom' && key === 'name') {
        nextOverrides.name = '';
      } else {
        delete nextOverrides[key];
      }
    } else {
      nextOverrides[key] = value;
    }
    setEditingAlias({
      ...editingAlias,
      metadata: withOverrides(current, nextOverrides),
    });
  };

  const setPricingField = (
    key: keyof NonNullable<MetadataOverrides['pricing']>,
    value: string | undefined
  ) => {
    const current = editingAlias.metadata;
    if (!current) return;
    const pricing = { ...(current.overrides?.pricing ?? {}) };
    if (value === undefined || value === '') delete pricing[key];
    else pricing[key] = value;
    const nextOverrides: MetadataOverrides = { ...(current.overrides ?? {}) };
    if (Object.keys(pricing).length === 0) delete nextOverrides.pricing;
    else nextOverrides.pricing = pricing;
    setEditingAlias({ ...editingAlias, metadata: withOverrides(current, nextOverrides) });
  };

  const setArchitectureField = (
    key: keyof NonNullable<MetadataOverrides['architecture']>,
    value: string | string[] | undefined
  ) => {
    const current = editingAlias.metadata;
    if (!current) return;
    const arch = { ...(current.overrides?.architecture ?? {}) };
    if (value === undefined || (Array.isArray(value) && value.length === 0) || value === '')
      delete arch[key];
    else (arch as any)[key] = value;
    const nextOverrides: MetadataOverrides = { ...(current.overrides ?? {}) };
    if (Object.keys(arch).length === 0) delete nextOverrides.architecture;
    else nextOverrides.architecture = arch;
    setEditingAlias({ ...editingAlias, metadata: withOverrides(current, nextOverrides) });
  };

  const setTopProviderField = (
    key: keyof NonNullable<MetadataOverrides['top_provider']>,
    value: number | undefined
  ) => {
    const current = editingAlias.metadata;
    if (!current) return;
    const tp = { ...(current.overrides?.top_provider ?? {}) };
    if (value === undefined) delete tp[key];
    else tp[key] = value;
    const nextOverrides: MetadataOverrides = { ...(current.overrides ?? {}) };
    if (Object.keys(tp).length === 0) delete nextOverrides.top_provider;
    else nextOverrides.top_provider = tp;
    setEditingAlias({ ...editingAlias, metadata: withOverrides(current, nextOverrides) });
  };

  /**
   * Count the number of overridden fields for the preview strip. Only fields
   * whose values *differ* from the reference are counted:
   *   - custom source: compared against `buildCustomDefaults(aliasId)`
   *   - catalog source: compared against the auto-populated catalog values
   * While the catalog lookup is still in flight for a catalog-backed source
   * we report 0 so the strip doesn't flash a spurious "all fields overridden"
   * count on open.
   */
  const countOverrides = (metadata?: AliasMetadata): number => {
    if (!metadata?.overrides) return 0;
    const o = metadata.overrides;
    let ref: MetadataOverrides;
    if (metadata.source === 'custom') {
      ref = buildCustomDefaults(editingAlias.id);
    } else if (catalogReference === undefined) {
      // Catalog still loading — avoid flashing a spurious count.
      return 0;
    } else {
      ref = catalogReference ?? {};
    }
    const arrayEq = (a?: string[], b?: string[]): boolean => {
      if (a === b) return true;
      if (!a || !b) return false;
      if (a.length !== b.length) return false;
      return a.every((v, i) => v === b[i]);
    };
    let n = 0;
    if (o.name !== undefined && o.name !== ref.name) n++;
    if (o.description !== undefined && o.description !== ref.description) n++;
    if (o.context_length !== undefined && o.context_length !== ref.context_length) n++;
    if (o.pricing) {
      const r = ref.pricing ?? {};
      if (o.pricing.prompt !== undefined && o.pricing.prompt !== r.prompt) n++;
      if (o.pricing.completion !== undefined && o.pricing.completion !== r.completion) n++;
      if (
        o.pricing.input_cache_read !== undefined &&
        o.pricing.input_cache_read !== r.input_cache_read
      )
        n++;
      if (
        o.pricing.input_cache_write !== undefined &&
        o.pricing.input_cache_write !== r.input_cache_write
      )
        n++;
    }
    if (o.architecture) {
      const r = ref.architecture ?? {};
      if (
        o.architecture.input_modalities !== undefined &&
        !arrayEq(o.architecture.input_modalities, r.input_modalities)
      )
        n++;
      if (
        o.architecture.output_modalities !== undefined &&
        !arrayEq(o.architecture.output_modalities, r.output_modalities)
      )
        n++;
      if (o.architecture.tokenizer !== undefined && o.architecture.tokenizer !== r.tokenizer) n++;
    }
    if (
      o.supported_parameters !== undefined &&
      !arrayEq(o.supported_parameters, ref.supported_parameters)
    )
      n++;
    if (o.top_provider) {
      const r = ref.top_provider ?? {};
      if (
        o.top_provider.context_length !== undefined &&
        o.top_provider.context_length !== r.context_length
      )
        n++;
      if (
        o.top_provider.max_completion_tokens !== undefined &&
        o.top_provider.max_completion_tokens !== r.max_completion_tokens
      )
        n++;
    }
    return n;
  };

  // Fetch model architecture from HuggingFace via backend API
  const fetchHfModelArchitecture = async () => {
    if (!hfModelId.trim()) {
      setHfFetchError('Please enter a Hugging Face model ID');
      return;
    }

    setIsFetchingHfModel(true);
    setHfFetchError(null);

    try {
      const modelId = hfModelId.trim();

      // Call backend API to fetch model architecture
      const data = await api.fetchHuggingFaceModelArchitecture(modelId);
      const arch = data.architecture;

      setEditingAlias({
        ...editingAlias,
        model_architecture: {
          total_params: arch.total_params,
          active_params: arch.active_params,
          layers: arch.layers,
          heads: arch.heads,
          kv_lora_rank: arch.kv_lora_rank,
          qk_rope_head_dim: arch.qk_rope_head_dim,
          context_length: arch.context_length,
          dtype: arch.dtype as NonNullable<Alias['model_architecture']>['dtype'],
        },
      });
    } catch (error) {
      setHfFetchError(error instanceof Error ? error.message : 'Failed to fetch model config');
    } finally {
      setIsFetchingHfModel(false);
    }
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    setDragSourceIndex(index);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDragSourceIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);

    setDragSourceIndex(null);
    setDragOverIndex(null);

    if (dragIndex === dropIndex) return;

    const newTargets = [...editingAlias.targets];
    const [draggedItem] = newTargets.splice(dragIndex, 1);
    newTargets.splice(dropIndex, 0, draggedItem);

    setEditingAlias({ ...editingAlias, targets: newTargets });
  };

  const sortedAliases = [...aliases].sort((a, b) => a.id.localeCompare(b.id));

  const filteredAliases = sortedAliases.filter((a) =>
    a.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ListPage
      title="Models"
      subtitle="Map external model IDs to provider models and control routing fall-through."
      actions={
        <>
          {allAliases.length > 0 && (
            <SearchInput
              placeholder="Search models…"
              value={search}
              onChange={setSearch}
              className="w-full sm:w-64"
            />
          )}
          <span className="inline-flex items-center gap-2 px-3 h-9 rounded-md bg-surface-elevated border border-border">
            <Eye size={14} className="text-foreground-muted" />
            <span className="text-xs font-medium text-foreground-muted">Vision Fall Through:</span>
            <Select
              value={globalDescriptorModel || '__none__'}
              onValueChange={(v) => setGlobalDescriptorModel(v === '__none__' ? '' : v)}
            >
              <SelectTrigger
                size="sm"
                className="h-auto w-auto max-w-[140px] border-0 bg-transparent px-0 py-0 text-xs focus:ring-0 focus:ring-offset-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">(None)</SelectItem>
                {sortedAliases.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={handleSaveDescriptor}
              disabled={isSavingDescriptor}
              className="ml-1 text-foreground-muted hover:text-accent transition-colors disabled:opacity-50"
              title="Save descriptor model"
              type="button"
            >
              {isSavingDescriptor ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
            </button>
          </span>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={isRefreshing ? 'animate-spin' : undefined} strokeWidth={1.75} />
            Refresh
          </Button>
          <Button leftIcon={<Plus size={16} />} onClick={handleAddNew}>
            Add Model
          </Button>
        </>
      }
    >
      {!isLoading && filteredAliases.length === 0 ? (
        search ? (
          <EmptyState
            icon={Search}
            title="No matching models"
            description={
              <>
                No model aliases match <code className="font-mono text-foreground">{search}</code>.
                Try a different search term, or clear the filter.
              </>
            }
          >
            <Button onClick={() => setSearch('')}>Clear search</Button>
          </EmptyState>
        ) : (
          <EmptyState
            icon={Network}
            title="No models configured"
            description="Add a model alias to expose it to API keys. An alias bundles one or more provider targets so you can fall back across upstreams."
          >
            <Button leftIcon={<Plus size={16} />} onClick={handleAddNew}>
              Add Model
            </Button>
          </EmptyState>
        )
      ) : (
        <div className="mb-6 overflow-hidden rounded-lg border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th
                    className="px-4 py-3 text-left border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider"
                    style={{ paddingLeft: '24px' }}
                  >
                    Alias
                  </th>
                  <th className="px-4 py-3 text-left border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider">
                    Aliases
                  </th>
                  <th className="px-4 py-3 text-left border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider">
                    Selector
                  </th>
                  <th className="px-4 py-3 text-left border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider">
                    Metadata
                  </th>
                  <th
                    className="px-4 py-3 text-left border-b border-border bg-surface-elevated font-semibold text-foreground-muted text-[11px] uppercase tracking-wider"
                    style={{ paddingRight: '24px' }}
                  >
                    Targets
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAliases.map((alias) => (
                  <AliasTableRow
                    key={alias.id}
                    alias={alias}
                    providers={providers}
                    cooldowns={cooldowns}
                    testStates={testStates}
                    onEdit={handleEdit}
                    onDelete={handleDeleteClick}
                    onToggleTarget={handleToggleTarget}
                    onTestTarget={handleTestTarget}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={originalId ? 'Edit Model' : 'Add Model'}
        size="lg"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} isLoading={isSaving}>
              Save Changes
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '-8px' }}>
          <div className="grid grid-cols-4 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-foreground-muted">
                Primary Name (ID)
              </label>
              <input
                className="w-full py-2 px-3 text-sm text-foreground bg-surface-elevated border border-border rounded-sm outline-none transition-all duration-200 backdrop-blur-md focus:border-primary focus:shadow-[0_0_0_3px_rgba(245,158,11,0.15)]"
                value={editingAlias.id}
                onChange={(e) => setEditingAlias({ ...editingAlias, id: e.target.value })}
                placeholder="e.g. gpt-4-turbo"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-foreground-muted">Model Type</label>
              <Select
                value={editingAlias.type || 'chat'}
                onValueChange={(v) =>
                  setEditingAlias({
                    ...editingAlias,
                    type: v as
                      | 'chat'
                      | 'embeddings'
                      | 'transcriptions'
                      | 'speech'
                      | 'image'
                      | 'responses',
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="embeddings">Embeddings</SelectItem>
                  <SelectItem value="transcriptions">Transcriptions</SelectItem>
                  <SelectItem value="speech">Speech</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="responses">Responses</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-foreground-muted">
                Selector Strategy
              </label>
              <Select
                value={editingAlias.selector || 'random'}
                onValueChange={(v) => setEditingAlias({ ...editingAlias, selector: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">Random</SelectItem>
                  <SelectItem value="in_order">In Order</SelectItem>
                  <SelectItem value="cost">Lowest Cost</SelectItem>
                  <SelectItem value="latency">Lowest Latency</SelectItem>
                  <SelectItem value="usage">Usage Balanced</SelectItem>
                  <SelectItem value="performance">Best Performance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-foreground-muted">Priority</label>
              <Select
                value={editingAlias.priority || 'selector'}
                onValueChange={(v) => setEditingAlias({ ...editingAlias, priority: v as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="selector">Selector</SelectItem>
                  <SelectItem value="api_match">API Match</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-foreground-muted" style={{ marginTop: '-4px' }}>
            Priority: "Selector" uses the strategy above. "API Match" matches provider type to
            incoming request format.
          </p>

          <div className="h-px bg-border-glass" style={{ margin: '4px 0' }}></div>

          {/* Model Architecture */}
          <Section
            title={
              <span className="inline-flex items-center gap-1.5">
                <Cpu size={13} className="text-foreground-muted" />
                Model Architecture
              </span>
            }
            collapsible
            open={isArchitectureOpen}
            onOpenChange={setIsArchitectureOpen}
            rightSlot={
              editingAlias.model_architecture?.total_params ? (
                <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border border-border text-primary bg-surface-elevated">
                  {editingAlias.model_architecture.total_params}B params
                </span>
              ) : undefined
            }
            bodyStyle={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            <p className="text-[11px] text-foreground-muted">
              Fetch model architecture from Hugging Face or enter manually. These values are used
              for energy calculation.
            </p>

            {/* Display currently saved architecture values */}
            {editingAlias.model_architecture?.total_params && (
              <div className="px-3 py-2 bg-surface-elevated border border-border rounded-md">
                <div className="text-[11px] font-medium text-foreground-muted mb-1">
                  Currently Saved:
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-foreground">
                  {editingAlias.model_architecture.total_params && (
                    <span>{editingAlias.model_architecture.total_params}B params</span>
                  )}
                  {editingAlias.model_architecture.active_params && (
                    <span>({editingAlias.model_architecture.active_params}B active)</span>
                  )}
                  {editingAlias.model_architecture.layers && (
                    <span>{editingAlias.model_architecture.layers} layers</span>
                  )}
                  {editingAlias.model_architecture.heads && (
                    <span>{editingAlias.model_architecture.heads} heads</span>
                  )}
                  {editingAlias.model_architecture.dtype && (
                    <span className="text-primary">
                      {editingAlias.model_architecture.dtype.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* HuggingFace Model ID input and fetch button */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[11px] font-medium text-foreground-muted">
                  Hugging Face Model ID
                </label>
                <input
                  className="w-full py-2 px-3 text-sm text-foreground bg-surface-elevated border border-border rounded-sm outline-none focus:border-primary"
                  value={hfModelId}
                  onChange={(e) => setHfModelId(e.target.value)}
                  placeholder="e.g. meta-llama/Llama-3.1-70B-Instruct"
                  onKeyDown={(e) => e.key === 'Enter' && fetchHfModelArchitecture()}
                />
              </div>
              <Button
                onClick={fetchHfModelArchitecture}
                isLoading={isFetchingHfModel}
                disabled={isFetchingHfModel}
                variant="secondary"
              >
                Fetch from HF
              </Button>
            </div>

            {hfFetchError && (
              <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2">
                {hfFetchError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 p-3 border border-border rounded-md bg-surface-elevated">
              <div>
                <label className="text-[11px] font-medium text-foreground-muted">
                  Total Params (B)
                </label>
                <input
                  className="w-full py-2 px-3 text-sm text-foreground bg-surface-elevated border border-border rounded-sm outline-none focus:border-primary"
                  type="number"
                  step="0.1"
                  min="0"
                  value={editingAlias.model_architecture?.total_params || ''}
                  onChange={(e) =>
                    setEditingAlias({
                      ...editingAlias,
                      model_architecture: {
                        ...editingAlias.model_architecture,
                        total_params: parseFloat(e.target.value) || undefined,
                      },
                    })
                  }
                  placeholder="e.g. 1.76"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-foreground-muted">
                  Active Params (B)
                </label>
                <input
                  className="w-full py-2 px-3 text-sm text-foreground bg-surface-elevated border border-border rounded-sm outline-none focus:border-primary"
                  type="number"
                  step="0.1"
                  min="0"
                  value={editingAlias.model_architecture?.active_params || ''}
                  onChange={(e) =>
                    setEditingAlias({
                      ...editingAlias,
                      model_architecture: {
                        ...editingAlias.model_architecture,
                        active_params: parseFloat(e.target.value) || undefined,
                      },
                    })
                  }
                  placeholder="e.g. 1.76"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-foreground-muted">Layers</label>
                <input
                  className="w-full py-2 px-3 text-sm text-foreground bg-surface-elevated border border-border rounded-sm outline-none focus:border-primary"
                  type="number"
                  step="1"
                  min="1"
                  value={editingAlias.model_architecture?.layers || ''}
                  onChange={(e) =>
                    setEditingAlias({
                      ...editingAlias,
                      model_architecture: {
                        ...editingAlias.model_architecture,
                        layers: parseInt(e.target.value, 10) || undefined,
                      },
                    })
                  }
                  placeholder="e.g. 120"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-foreground-muted">Heads</label>
                <input
                  className="w-full py-2 px-3 text-sm text-foreground bg-surface-elevated border border-border rounded-sm outline-none focus:border-primary"
                  type="number"
                  step="1"
                  min="1"
                  value={editingAlias.model_architecture?.heads || ''}
                  onChange={(e) =>
                    setEditingAlias({
                      ...editingAlias,
                      model_architecture: {
                        ...editingAlias.model_architecture,
                        heads: parseInt(e.target.value, 10) || undefined,
                      },
                    })
                  }
                  placeholder="e.g. 96"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-foreground-muted">
                  KV LoRA Rank
                </label>
                <input
                  className="w-full py-2 px-3 text-sm text-foreground bg-surface-elevated border border-border rounded-sm outline-none focus:border-primary"
                  type="number"
                  step="1"
                  min="1"
                  value={editingAlias.model_architecture?.kv_lora_rank || ''}
                  onChange={(e) =>
                    setEditingAlias({
                      ...editingAlias,
                      model_architecture: {
                        ...editingAlias.model_architecture,
                        kv_lora_rank: parseInt(e.target.value, 10) || undefined,
                      },
                    })
                  }
                  placeholder="e.g. 128"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-foreground-muted">
                  RoPE Head Dim
                </label>
                <input
                  className="w-full py-2 px-3 text-sm text-foreground bg-surface-elevated border border-border rounded-sm outline-none focus:border-primary"
                  type="number"
                  step="1"
                  min="1"
                  value={editingAlias.model_architecture?.qk_rope_head_dim || ''}
                  onChange={(e) =>
                    setEditingAlias({
                      ...editingAlias,
                      model_architecture: {
                        ...editingAlias.model_architecture,
                        qk_rope_head_dim: parseInt(e.target.value, 10) || undefined,
                      },
                    })
                  }
                  placeholder="e.g. 96"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-foreground-muted">
                  Context Length
                </label>
                <input
                  className="w-full py-2 px-3 text-sm text-foreground bg-surface-elevated border border-border rounded-sm outline-none focus:border-primary"
                  type="number"
                  step="1"
                  min="1"
                  value={editingAlias.model_architecture?.context_length || ''}
                  onChange={(e) =>
                    setEditingAlias({
                      ...editingAlias,
                      model_architecture: {
                        ...editingAlias.model_architecture,
                        context_length: parseInt(e.target.value, 10) || undefined,
                      },
                    })
                  }
                  placeholder="e.g. 128000"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-foreground-muted">Data Type</label>
                <Select
                  value={editingAlias.model_architecture?.dtype || '__default__'}
                  onValueChange={(v) =>
                    setEditingAlias({
                      ...editingAlias,
                      model_architecture: {
                        ...editingAlias.model_architecture,
                        dtype: v === '__default__' ? undefined : (v as any),
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Default (FP16)</SelectItem>
                    <SelectItem value="fp16">FP16</SelectItem>
                    <SelectItem value="bf16">BF16</SelectItem>
                    <SelectItem value="fp8">FP8</SelectItem>
                    <SelectItem value="fp8_e4m3">FP8 E4M3</SelectItem>
                    <SelectItem value="fp8_e5m2">FP8 E5M2</SelectItem>
                    <SelectItem value="nvfp4">NVFP4</SelectItem>
                    <SelectItem value="int4">INT4</SelectItem>
                    <SelectItem value="int8">INT8</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          {/* Advanced */}
          <Section
            title="Advanced"
            collapsible
            open={isAdvancedOpen}
            onOpenChange={setIsAdvancedOpen}
            bodyStyle={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            {/* ── Behaviors ── */}
            <div>
              <label
                className="text-[13px] font-medium text-foreground-muted"
                style={{ display: 'block', marginBottom: '6px' }}
              >
                Behaviors
              </label>
              <div className="flex items-center justify-between py-1">
                <div>
                  <span className="text-[13px] text-foreground">Strip Adaptive Thinking</span>
                  <p className="text-[11px] text-foreground-muted mt-0.5">
                    On the <code className="text-primary">/v1/messages</code> path, remove{' '}
                    <code className="text-primary">thinking</code> when set to{' '}
                    <code className="text-primary">adaptive</code> so the provider uses its default
                    behaviour.
                  </p>
                </div>
                <Switch
                  checked={getBehavior('strip_adaptive_thinking')}
                  onCheckedChange={(val) => setBehavior('strip_adaptive_thinking', val)}
                  className="scale-75"
                />
              </div>

              <div className="flex items-center justify-between py-1">
                <div>
                  <span className="text-[13px] text-foreground">Vision Fallthrough</span>
                  <p className="text-[11px] text-foreground-muted mt-0.5">
                    If the request contains images and the target model is text-only, use the
                    descriptor model to convert images to text.
                  </p>
                </div>
                <Switch
                  checked={editingAlias.use_image_fallthrough || false}
                  onCheckedChange={(val) =>
                    setEditingAlias({
                      ...editingAlias,
                      use_image_fallthrough: val,
                    })
                  }
                  className="scale-75"
                />
              </div>

              <div className="flex items-center justify-between py-1">
                <div>
                  <span className="text-[13px] text-foreground">Enforce Limits</span>
                  <p className="text-[11px] text-foreground-muted mt-0.5">
                    Reject oversized prompts locally (400 context_length_exceeded) before dispatch.
                    Uses a fast heuristic estimator with a 10% safety margin, and reserves the
                    smaller of max_tokens and the model's max completion for the response. Requires
                    a known context_length in metadata (override or catalog).
                  </p>
                  {editingAlias.enforce_limits &&
                    !editingAlias.metadata?.overrides?.context_length &&
                    !editingAlias.metadata?.overrides?.top_provider?.context_length && (
                      <p
                        className="text-[11px] mt-1 flex items-center gap-1"
                        style={{ color: 'var(--warning)' }}
                      >
                        <AlertTriangle size={12} />
                        No context_length found in metadata — this toggle will have no effect until
                        a metadata source with a known context_length is configured.
                      </p>
                    )}
                </div>
                <Switch
                  checked={editingAlias.enforce_limits || false}
                  onCheckedChange={(val) =>
                    setEditingAlias({
                      ...editingAlias,
                      enforce_limits: val,
                    })
                  }
                  className="scale-75"
                />
              </div>
            </div>

            <div className="h-px bg-border-glass"></div>

            {/* ── Additional Aliases ── */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '4px',
                }}
              >
                <label
                  className="text-[13px] font-medium text-foreground-muted"
                  style={{ marginBottom: 0 }}
                >
                  Additional Aliases
                </label>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={addAlias}
                  leftIcon={<Plus size={14} />}
                >
                  Add Alias
                </Button>
              </div>

              {(!editingAlias.aliases || editingAlias.aliases.length === 0) && (
                <div className="text-foreground-muted italic text-center text-sm py-2">
                  No additional aliases
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {editingAlias.aliases?.map((alias, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                    <Input
                      value={alias}
                      onChange={(e) => updateAlias(idx, e.target.value)}
                      placeholder="e.g. gpt4"
                      style={{ flex: 1 }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAlias(idx)}
                      style={{ color: 'var(--danger)' }}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <div className="h-px bg-border-glass" style={{ margin: '4px 0' }}></div>

          {/* Metadata */}
          <Section
            title={
              <span className="inline-flex items-center gap-1.5">
                <BookOpen size={13} className="text-foreground-muted" />
                Metadata
              </span>
            }
            collapsible
            open={isMetadataOpen}
            onOpenChange={setIsMetadataOpen}
            rightSlot={
              editingAlias.metadata ? (
                <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium border border-border text-primary bg-surface-elevated">
                  {editingAlias.metadata.source}
                </span>
              ) : undefined
            }
            bodyStyle={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            <p className="text-[11px] text-foreground-muted">
              Link this alias to a model in an external catalog. When configured, Plexus includes
              enriched metadata (name, context length, pricing, supported parameters) in the{' '}
              <code className="text-primary">GET /v1/models</code> response.
            </p>

            {/* Source selector */}
            <div>
              <label
                className="text-[12px] font-medium text-foreground-muted"
                style={{ display: 'block', marginBottom: '4px' }}
              >
                Source
              </label>
              <Select
                value={editingAlias.metadata?.source ?? 'openrouter'}
                onValueChange={(v) => {
                  const source = v as MetadataSource;
                  const prevSource = editingAlias.metadata?.source;
                  const existingOverrides = editingAlias.metadata?.overrides;
                  const existingSourcePath = editingAlias.metadata?.source_path;
                  // Different catalogs use different path formats (e.g.
                  // openrouter's "openai/gpt-4.1-nano" ≠ models.dev's
                  // "openai.gpt-4.1-nano"), so a path from the old catalog
                  // is always wrong under a new one. Only carry the path
                  // when the source is unchanged or switching to 'custom'
                  // (where source_path is a free-form label).
                  const carryPath = prevSource === source || source === 'custom';
                  const carriedSourcePath = carryPath ? existingSourcePath : undefined;
                  let next: AliasMetadata;
                  if (source === 'custom') {
                    // Seed defaults, then layer any existing overrides on top so
                    // user-typed values take precedence while missing required
                    // fields (e.g., name) still have a sensible default. Nested
                    // objects (architecture/pricing/top_provider) are merged
                    // field-by-field so a partial user override (e.g. only
                    // input_modalities) doesn't wipe default sibling fields
                    // (e.g. output_modalities).
                    const defaults = buildCustomDefaults(editingAlias.id);
                    const existing = existingOverrides ?? {};
                    const mergedOverrides = {
                      ...defaults,
                      ...existing,
                      ...(defaults.pricing || existing.pricing
                        ? {
                            pricing: {
                              ...(defaults.pricing ?? {}),
                              ...(existing.pricing ?? {}),
                            },
                          }
                        : {}),
                      ...(defaults.architecture || existing.architecture
                        ? {
                            architecture: {
                              ...(defaults.architecture ?? {}),
                              ...(existing.architecture ?? {}),
                            },
                          }
                        : {}),
                      ...(defaults.top_provider || existing.top_provider
                        ? {
                            top_provider: {
                              ...(defaults.top_provider ?? {}),
                              ...(existing.top_provider ?? {}),
                            },
                          }
                        : {}),
                    } as MetadataOverrides & { name: string };
                    next = {
                      source: 'custom',
                      ...(carriedSourcePath ? { source_path: carriedSourcePath } : {}),
                      overrides: mergedOverrides,
                    };
                    setIsOverrideOpen(true);
                  } else {
                    next = {
                      source,
                      source_path: carriedSourcePath ?? '',
                      ...(existingOverrides ? { overrides: existingOverrides } : {}),
                    };
                  }
                  setEditingAlias({ ...editingAlias, metadata: next });
                  // Changing catalogs (or switching to custom) can leave
                  // a pending debounced search from the prior source that
                  // would overwrite `metadataResults` with stale data; kill
                  // it before any conditional re-run below.
                  if (prevSource !== source) {
                    cancelMetadataDebounce();
                    setMetadataResults([]);
                    setShowMetadataDropdown(false);
                    setIsMetadataSearching(false);
                  }
                  // When we dropped the path, also clear the visible model
                  // query input so it doesn't show a stale value that no
                  // longer matches metadata.source_path.
                  if (!carryPath) setMetadataQuery('');
                  // Re-run search only when we kept the query (same catalog).
                  if (carryPath && source !== 'custom' && metadataQuery)
                    handleMetadataSearch(metadataQuery, source);
                }}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                  <SelectItem value="models.dev">models.dev</SelectItem>
                  <SelectItem value="catwalk">Catwalk (Charm)</SelectItem>
                  <SelectItem value="custom">Custom (manual entry)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search / source_path — hidden for 'custom' (no catalog) */}
            {editingAlias.metadata?.source !== 'custom' && (
              <div style={{ position: 'relative' }}>
                <label
                  className="text-[12px] font-medium text-foreground-muted"
                  style={{ display: 'block', marginBottom: '4px' }}
                >
                  Model
                  {editingAlias.metadata?.source_path && (
                    <span className="ml-2 font-normal text-foreground-muted">
                      ({editingAlias.metadata.source_path})
                    </span>
                  )}
                </label>
                <div style={{ position: 'relative', display: 'flex', gap: '4px' }}>
                  <div ref={metadataInputWrapperRef} style={{ position: 'relative', flex: 1 }}>
                    <Input
                      value={metadataQuery}
                      onChange={(e) => {
                        const source = editingAlias.metadata?.source ?? 'openrouter';
                        handleMetadataSearch(e.target.value, source);
                        // Update rect so portal dropdown follows the input
                        if (metadataInputWrapperRef.current) {
                          const r = metadataInputWrapperRef.current.getBoundingClientRect();
                          setDropdownRect({ top: r.bottom + 2, left: r.left, width: r.width });
                        }
                      }}
                      onFocus={() => {
                        if (metadataResults.length > 0) {
                          if (metadataInputWrapperRef.current) {
                            const r = metadataInputWrapperRef.current.getBoundingClientRect();
                            setDropdownRect({
                              top: r.bottom + 2,
                              left: r.left,
                              width: r.width,
                            });
                          }
                          setShowMetadataDropdown(true);
                        }
                      }}
                      placeholder={`Search ${editingAlias.metadata?.source ?? 'openrouter'} catalog...`}
                      style={{
                        width: '100%',
                        paddingRight: isMetadataSearching ? '28px' : undefined,
                      }}
                      onBlur={() => setShowMetadataDropdown(false)}
                    />
                    {isMetadataSearching && (
                      <Loader2
                        size={14}
                        className="animate-spin text-foreground-muted"
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                        }}
                      />
                    )}
                  </div>
                  {editingAlias.metadata && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearMetadata}
                      style={{
                        color: 'var(--danger)',
                        padding: '4px',
                        minHeight: 'auto',
                      }}
                      title="Remove metadata"
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Selected metadata preview */}
            {editingAlias.metadata &&
              (editingAlias.metadata.source === 'custom' ||
                editingAlias.metadata.source_path ||
                editingAlias.metadata.overrides) && (
                <div
                  className="rounded-sm border border-border bg-surface-elevated px-3 py-2"
                  style={{ fontSize: '11px', color: 'var(--foreground-muted)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle size={12} className="text-success" />
                    <span>
                      {editingAlias.metadata.source === 'custom' ? (
                        <>
                          Custom metadata
                          {editingAlias.metadata.source_path && (
                            <>
                              :{' '}
                              <code className="text-primary">
                                {editingAlias.metadata.source_path}
                              </code>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          Metadata assigned from <strong>{editingAlias.metadata.source}</strong>
                          {editingAlias.metadata.source_path && (
                            <>
                              :{' '}
                              <code className="text-primary">
                                {editingAlias.metadata.source_path}
                              </code>
                            </>
                          )}
                        </>
                      )}
                      {countOverrides(editingAlias.metadata) > 0 && (
                        <span className="ml-2 text-foreground-muted">
                          + {countOverrides(editingAlias.metadata)} field
                          {countOverrides(editingAlias.metadata) === 1 ? '' : 's'} overridden
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}

            {/* Override toggle + editable form */}
            {editingAlias.metadata && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {editingAlias.metadata.source !== 'custom' && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <label
                      className="text-[12px] font-medium text-foreground-muted"
                      style={{ marginBottom: 0 }}
                    >
                      Override catalog fields
                    </label>
                    <Switch
                      checked={isOverrideOpen}
                      onCheckedChange={(v) => {
                        setIsOverrideOpen(v);
                        if (!v) {
                          // Flipping override off clears any existing overrides.
                          const current = editingAlias.metadata;
                          if (current) {
                            const { overrides: _o, ...rest } = current;
                            setEditingAlias({
                              ...editingAlias,
                              metadata: rest as AliasMetadata,
                            });
                          }
                        } else {
                          // Flipping override on auto-populates the form with
                          // the catalog's current values so the user sees what
                          // they're overriding instead of a blank form.
                          const cur = editingAlias.metadata;
                          if (cur && cur.source !== 'custom' && cur.source_path) {
                            populateOverridesFromCatalog(cur.source, cur.source_path);
                          }
                        }
                      }}
                    />
                  </div>
                )}

                {(isOverrideOpen || editingAlias.metadata.source === 'custom') && (
                  <MetadataOverrideForm
                    overrides={editingAlias.metadata.overrides ?? {}}
                    isCustom={editingAlias.metadata.source === 'custom'}
                    onSetField={setOverrideField}
                    onSetPricing={setPricingField}
                    onSetArchitecture={setArchitectureField}
                    onSetTopProvider={setTopProviderField}
                  />
                )}
              </div>
            )}
          </Section>

          <div className="h-px bg-border-glass" style={{ margin: '4px 0' }}></div>

          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
              }}
            >
              <label
                className="text-[13px] font-medium text-foreground-muted"
                style={{ marginBottom: 0 }}
              >
                Targets
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleOpenAutoAdd}
                  leftIcon={<Zap size={14} />}
                >
                  Auto Add
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={addTarget}
                  leftIcon={<Plus size={14} />}
                >
                  Add Target
                </Button>
              </div>
            </div>

            {editingAlias.targets.length === 0 && (
              <div className="text-foreground-muted italic text-center text-sm py-2">
                No targets configured (Model will not work)
              </div>
            )}

            {editingAlias.targets.length > 0 &&
              (() => {
                const enabled = editingAlias.targets.filter(
                  (t) => t.enabled !== false && t.provider && t.model
                );
                const selector = editingAlias.selector || 'random';
                const previewText = (() => {
                  if (enabled.length === 0) return 'No enabled targets — requests will fail.';
                  const fmtTarget = (t: { provider: string; model: string }) =>
                    `${t.provider} → ${t.model}`;
                  switch (selector) {
                    case 'in_order':
                      return `Next request routes to: ${fmtTarget(enabled[0]!)}.`;
                    case 'random':
                      return `Next request randomly routes to one of ${enabled.length} enabled target${enabled.length !== 1 ? 's' : ''}.`;
                    case 'cost':
                      return `Cost-optimized: lowest-priced of ${enabled.length} enabled target${enabled.length !== 1 ? 's' : ''}.`;
                    case 'latency':
                      return `Latency-optimized: fastest of ${enabled.length} enabled target${enabled.length !== 1 ? 's' : ''}.`;
                    default:
                      return `Routes via "${selector}" across ${enabled.length} enabled target${enabled.length !== 1 ? 's' : ''}.`;
                  }
                })();
                return (
                  <div className="mb-2 flex items-start gap-2 rounded-md border border-border bg-surface-elevated px-3 py-2 text-[11px] text-foreground-muted">
                    <Eye className="mt-0.5 size-3.5 shrink-0 text-info" strokeWidth={1.75} />
                    <span className="font-mono">{previewText}</span>
                  </div>
                );
              })()}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {editingAlias.targets.map((target, idx) => {
                const isDragging = dragSourceIndex === idx;
                const isDragOver = dragOverIndex === idx && !isDragging;

                return (
                  <div
                    key={idx}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, idx)}
                    style={{
                      display: 'flex',
                      gap: '6px',
                      alignItems: 'center',
                      padding: '4px 8px',
                      backgroundColor: isDragging
                        ? 'transparent'
                        : isDragOver
                          ? 'rgba(245, 158, 11, 0.05)'
                          : 'var(--surface-elevated)',
                      borderRadius: 'var(--radius-sm)',
                      border: isDragging
                        ? '1px dashed var(--border)'
                        : isDragOver
                          ? '2px solid var(--accent)'
                          : '1px solid var(--border)',
                      cursor: 'grab',
                      opacity: isDragging ? 0.4 : 1,
                      transform: isDragOver ? 'translateY(2px)' : 'none',
                      transition: 'all 0.2s ease',
                      position: 'relative',
                    }}
                    onDragStartCapture={(e) => {
                      (e.currentTarget as HTMLDivElement).style.cursor = 'grabbing';
                    }}
                    onDragEndCapture={(e) => {
                      (e.currentTarget as HTMLDivElement).style.cursor = 'grab';
                    }}
                  >
                    {isDragOver && (
                      <div
                        style={{
                          position: 'absolute',
                          top: dragSourceIndex !== null && dragSourceIndex < idx ? 'auto' : -2,
                          bottom: dragSourceIndex !== null && dragSourceIndex > idx ? 'auto' : -2,
                          left: 0,
                          right: 0,
                          height: '2px',
                          backgroundColor: 'var(--accent)',
                          zIndex: 20,
                        }}
                      />
                    )}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: 'var(--foreground-muted)',
                        opacity: 0.8,
                        marginRight: '4px',
                        visibility: isDragging ? 'hidden' : 'visible',
                      }}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveTarget(idx, 'up');
                        }}
                        disabled={idx === 0}
                        className="hover:scale-110 hover:text-primary disabled:opacity-30 disabled:hover:scale-100 transition-all duration-200"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '4px',
                          cursor: idx === 0 ? 'default' : 'pointer',
                        }}
                        title="Move Up"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveTarget(idx, 'down');
                        }}
                        disabled={idx === editingAlias.targets.length - 1}
                        className="hover:scale-110 hover:text-primary disabled:opacity-30 disabled:hover:scale-100 transition-all duration-200"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '4px',
                          cursor: idx === editingAlias.targets.length - 1 ? 'default' : 'pointer',
                        }}
                        title="Move Down"
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>
                    <div
                      style={{
                        cursor: 'grab',
                        color: 'var(--foreground-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        visibility: isDragging ? 'hidden' : 'visible',
                      }}
                    >
                      <GripVertical size={16} />
                    </div>
                    <div
                      style={{
                        flex: '0 0 120px',
                        maxWidth: '120px',
                        visibility: isDragging ? 'hidden' : 'visible',
                      }}
                    >
                      <Select
                        value={target.provider || undefined}
                        onValueChange={(v) => updateTarget(idx, 'provider', v)}
                      >
                        <SelectTrigger size="sm">
                          <SelectValue placeholder="Select Provider..." />
                        </SelectTrigger>
                        <SelectContent>
                          {providers.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div style={{ flex: 1, visibility: isDragging ? 'hidden' : 'visible' }}>
                      <Select
                        value={target.model || undefined}
                        onValueChange={(v) => updateTarget(idx, 'model', v)}
                        disabled={!target.provider}
                      >
                        <SelectTrigger size="sm">
                          <SelectValue placeholder="Select Model..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableModels
                            .filter((m) => m.providerId === target.provider)
                            .map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div style={{ visibility: isDragging ? 'hidden' : 'visible' }}>
                      <Switch
                        checked={target.enabled !== false}
                        onCheckedChange={(val) => updateTarget(idx, 'enabled', val)}
                        className="scale-75"
                      />
                    </div>
                    <div style={{ visibility: isDragging ? 'hidden' : 'visible' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTarget(idx)}
                        style={{ color: 'var(--danger)', padding: '4px', minHeight: 'auto' }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      <Dialog
        open={isAutoAddModalOpen}
        onOpenChange={(open) => !open && setIsAutoAddModalOpen(false)}
      >
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Auto add targets</DialogTitle>
            <DialogDescription>
              Search across all enabled providers and bulk-add matching models as targets to this
              alias.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Input
                placeholder="Search models (e.g. 'gpt-4', 'claude')"
                value={substring}
                onChange={(e) => setSubstring(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchModels()}
                className="flex-1"
              />
              <Button onClick={() => handleSearchModels()}>Search</Button>
            </div>

            {filteredModels.length > 0 ? (
              <div
                style={{
                  maxHeight: '400px',
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <table className="w-full border-collapse text-[13px]">
                  <thead
                    style={{
                      position: 'sticky',
                      top: 0,
                      backgroundColor: 'var(--surface-elevated)',
                      zIndex: 10,
                    }}
                  >
                    <tr>
                      <th
                        className="px-4 py-3 text-left font-semibold text-foreground-muted text-[11px] uppercase tracking-wider"
                        style={{ width: '40px' }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            filteredModels.length > 0 &&
                            filteredModels.every(
                              (m) =>
                                selectedModels.has(`${m.provider.id}|${m.model.id}`) ||
                                editingAlias.targets.some(
                                  (t) => t.provider === m.provider.id && t.model === m.model.id
                                )
                            )
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              const newSelection = new Set(selectedModels);
                              filteredModels.forEach((m) => {
                                const key = `${m.provider.id}|${m.model.id}`;
                                if (
                                  !editingAlias.targets.some(
                                    (t) => t.provider === m.provider.id && t.model === m.model.id
                                  )
                                ) {
                                  newSelection.add(key);
                                }
                              });
                              setSelectedModels(newSelection);
                            } else {
                              const newSelection = new Set(selectedModels);
                              filteredModels.forEach((m) => {
                                newSelection.delete(`${m.provider.id}|${m.model.id}`);
                              });
                              setSelectedModels(newSelection);
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-foreground-muted text-[11px] uppercase tracking-wider">
                        Provider
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-foreground-muted text-[11px] uppercase tracking-wider">
                        Model
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModels.map(({ model, provider }) => {
                      const key = `${provider.id}|${model.id}`;
                      const alreadyExists = editingAlias.targets.some(
                        (t) => t.provider === provider.id && t.model === model.id
                      );
                      const isSelected = selectedModels.has(key);
                      const isDisabled = alreadyExists;

                      return (
                        <tr
                          key={key}
                          className="hover:bg-surface-elevated"
                          style={{ opacity: isDisabled ? 0.5 : 1 }}
                        >
                          <td className="px-4 py-3 text-left text-foreground">
                            <input
                              type="checkbox"
                              checked={isSelected || alreadyExists}
                              disabled={isDisabled}
                              onChange={() => handleToggleModelSelection(model.id, provider.id)}
                            />
                          </td>
                          <td className="px-4 py-3 text-left text-foreground">{provider.name}</td>
                          <td className="px-4 py-3 text-left text-foreground">
                            {model.name}
                            {alreadyExists && (
                              <span
                                style={{
                                  marginLeft: '8px',
                                  fontSize: '11px',
                                  color: 'var(--foreground-muted)',
                                  fontStyle: 'italic',
                                }}
                              >
                                (already added)
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : substring ? (
              <div className="text-foreground-muted italic text-center text-sm py-8">
                No models found matching "{substring}"
              </div>
            ) : (
              <div className="text-foreground-muted italic text-center text-sm py-8">
                Enter a search term to find models
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAutoAddModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSelectedModels} disabled={selectedModels.size === 0}>
              Add {selectedModels.size} Target
              {selectedModels.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete model alias?</AlertDialogTitle>
            <AlertDialogDescription>
              <code className="font-mono text-foreground">{aliasToDelete?.id}</code> will be
              permanently removed from the configuration. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Metadata autocomplete portal — rendered outside accordion to avoid overflow:hidden clipping */}
      {showMetadataDropdown &&
        metadataResults.length > 0 &&
        dropdownRect &&
        createPortal(
          <div
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: 'fixed',
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              zIndex: 9999,
              backgroundColor: '#1E293B',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              maxHeight: '180px',
              overflowY: 'auto',
            }}
          >
            {metadataResults.map((result) => (
              <button
                key={result.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectMetadataResult(result);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                }}
                className="hover:bg-surface-elevated transition-colors"
              >
                <div className="text-[12px] font-medium text-foreground">{result.name}</div>
                <div className="text-[10px] text-foreground-muted">{result.id}</div>
              </button>
            ))}
          </div>,
          document.body
        )}
    </ListPage>
  );
};
