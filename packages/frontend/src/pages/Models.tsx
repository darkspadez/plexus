import React, { useState, useCallback, useMemo } from 'react';
import { Alias } from '../lib/api';
import { useModels } from '../hooks/useModels';
import { AliasMobileCard } from '../components/models/AliasMobileCard';
import { TargetGroupEditor } from '../components/models/TargetGroupEditor';
import { ModelBehaviorsEditor } from '../components/models/ModelBehaviorsEditor';
import { ModelMetadataEditor } from '../components/models/ModelMetadataEditor';
import { AutoAddModal } from '../components/models/AutoAddModal';
import { ImportModelsModal } from '../components/models/ImportModelsModal';
import { ConfirmDeleteModal } from '../components/models/ConfirmDeleteModal';
import { VisionFallthroughSelector } from '../components/models/VisionFallthroughSelector';
import { ModelTypeBadge } from '../components/models/ModelTypeBadge';
import { ActiveDots, type DotState } from '../components/models/ActiveDots';
import { RoutingAliasesEditor } from '../components/models/RoutingAliasesEditor';
import { ProviderMappingsEditor } from '../components/models/ProviderMappingsEditor';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { EmptyState } from '../components/ui/EmptyState';
import { SearchInput } from '../components/ui/SearchInput';
import { TagSelect } from '../components/ui/TagSelect';
import { CopyButton } from '../components/ui/CopyButton';
import { Pill } from '../components/chips/Pill';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import {
  filterAndSortAliasesForModelsPage,
  getDefaultModelListSortDirection,
  getModelListProviderOptions,
  type ModelListSortDirection,
  type ModelListSortField,
} from '../lib/modelList';
import { SELECTOR_LABELS } from '../lib/selectors';
import {
  Plus,
  Trash2,
  Zap,
  Download,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Edit2,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  Boxes,
} from 'lucide-react';

export const Models = () => {
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
    handleEdit,
    handleAddNew,
    handleSave: hookSave,
    handleDelete: hookDelete,
    handleDeleteAll: hookDeleteAll,
    handleToggleTarget,
    handleUpdateAlias,
    handleTestTarget,
    dismissTestMessage,
    isImportModalOpen,
    setIsImportModalOpen,
    orphanGroups,
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
  } = useModels();

  // Delete Confirmation State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [aliasToDelete, setAliasToDelete] = useState<Alias | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Auto Add Modal State
  const [isAutoAddModalOpen, setIsAutoAddModalOpen] = useState(false);
  const [isAliasesOpen, setIsAliasesOpen] = useState(false);
  const [selectedProviderFilters, setSelectedProviderFilters] = useState<string[]>([]);
  const [sortField, setSortField] = useState<ModelListSortField>('alias');
  const [sortDirection, setSortDirection] = useState<ModelListSortDirection>('asc');

  const providerOptions = useMemo(
    () => getModelListProviderOptions(allAliases, providers),
    [allAliases, providers]
  );

  const visibleAliases = useMemo(
    () =>
      filterAndSortAliasesForModelsPage(
        aliases,
        providers,
        '',
        selectedProviderFilters,
        sortField,
        sortDirection
      ),
    [aliases, providers, selectedProviderFilters, sortField, sortDirection]
  );

  const handleSort = (field: ModelListSortField) => {
    if (sortField === field) {
      setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortField(field);
    setSortDirection(getDefaultModelListSortDirection(field));
  };

  const getSortAriaLabel = (field: ModelListSortField) => {
    if (sortField !== field) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  const handleSave = async () => {
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

  const handleConfirmDeleteAll = async () => {
    setIsDeletingAll(true);
    try {
      const success = await hookDeleteAll();
      if (success) {
        setIsDeleteAllModalOpen(false);
      }
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleAutoAddTargets = useCallback(
    (targets: Array<{ provider: string; model: string }>) => {
      setEditingAlias((prev: Alias) => {
        const updatedTargets = [...(prev.target_groups[0]?.targets ?? [])];
        for (const t of targets) {
          const alreadyExists = updatedTargets.some(
            (x: { provider: string; model: string }) =>
              x.provider === t.provider && x.model === t.model
          );
          if (!alreadyExists) {
            updatedTargets.push({ ...t, enabled: true });
          }
        }
        const groups = [...prev.target_groups];
        groups[0] = { ...groups[0], targets: updatedTargets };
        return { ...prev, target_groups: groups };
      });
      setIsAutoAddModalOpen(false);
    },
    [setEditingAlias]
  );

  // `visibleAliases` is already filtered by provider and sorted per the
  // user's chosen field/direction (see the memo above); keep the
  // `sortedAliases` name since the flat table/mobile-card JSX below
  // references it.
  const sortedAliases = visibleAliases;

  // Per-row expand state (inline editor)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ACTIVE column — one dot per target across all groups.
  const getDotStates = (alias: Alias): DotState[] =>
    alias.target_groups
      .flatMap((g) => g.targets)
      .map((t) => {
        if (t.enabled === false) return 'disabled';
        const onCooldown = cooldowns.some(
          (c) => c.provider === t.provider && c.model === t.model && !c.accountId
        );
        return onCooldown ? 'cooldown' : 'active';
      });

  // SELECTOR column — first group's selector, or "Mixed" if groups differ.
  const selectorLabel = (alias: Alias): string => {
    const selectors = Array.from(new Set(alias.target_groups.map((g) => g.selector)));
    if (selectors.length === 0) return '—';
    if (selectors.length === 1) return SELECTOR_LABELS[selectors[0]] ?? selectors[0];
    return 'Mixed';
  };

  // Row-level test indicator derived from per-target testStates (keys `${id}-…`).
  const rowTestState = (aliasId: string) => {
    const keys = Object.keys(testStates).filter((k) => k.startsWith(`${aliasId}-`));
    const loading = keys.some((k) => testStates[k]?.loading);
    const error = keys.some((k) => testStates[k]?.showResult && testStates[k]?.result === 'error');
    const success = keys.some(
      (k) => testStates[k]?.showResult && testStates[k]?.result === 'success'
    );
    return { loading, error, success };
  };

  // Play (▷) action — test every enabled target of the alias.
  const handleTestAll = (alias: Alias) => {
    let apiTypes: string[] = ['chat'];
    if (alias.type === 'embeddings') apiTypes = ['embeddings'];
    else if (alias.type === 'image') apiTypes = ['images'];
    alias.target_groups.forEach((group, groupIdx) => {
      group.targets.forEach((t, targetIdx) => {
        if (t.enabled === false || !t.provider || !t.model) return;
        handleTestTarget(
          alias.id,
          `${alias.id}-${groupIdx}-${targetIdx}`,
          t.provider,
          t.model,
          apiTypes
        );
      });
    });
  };

  const HEADER_CELL =
    'h-9 px-4 text-left text-[10px] font-medium uppercase tracking-wider text-foreground-muted';

  const hasActiveFilters = search.trim().length > 0 || selectedProviderFilters.length > 0;
  const emptyStateMessage =
    allAliases.length === 0
      ? 'No aliases configured'
      : hasActiveFilters
        ? 'No aliases match your current search or provider filter'
        : 'No aliases found';

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Models"
        subtitle="Aliases that map gateway models to upstream provider models"
        actions={
          <>
            <div className="w-full sm:w-64">
              <SearchInput
                placeholder="Search by alias, upstream id, tag…"
                value={search}
                onChange={setSearch}
              />
            </div>
            <VisionFallthroughSelector aliases={allAliases} />
            <Button
              variant="danger"
              size="md"
              leftIcon={<Trash2 size={14} />}
              onClick={() => setIsDeleteAllModalOpen(true)}
              disabled={allAliases.length === 0}
            >
              Delete All
            </Button>
            <Button
              variant="secondary"
              size="md"
              leftIcon={<Download size={14} />}
              onClick={handleOpenImport}
            >
              Import
            </Button>
            <Button leftIcon={<Plus size={14} />} onClick={handleAddNew} size="md">
              Add model
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full sm:w-72">
            <TagSelect
              label="Filter by provider"
              placeholder="All providers"
              options={providerOptions}
              selected={selectedProviderFilters}
              onChange={setSelectedProviderFilters}
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              label="Sort by"
              value={sortField}
              onChange={(value) => handleSort(value as ModelListSortField)}
              options={[
                { value: 'alias', label: 'Alias' },
                { value: 'provider', label: 'Provider' },
                { value: 'targets', label: 'Targets' },
              ]}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSort(sortField)}
              aria-label={`Sort direction: ${getSortAriaLabel(sortField)}`}
              leftIcon={
                sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
              }
            >
              {sortDirection === 'asc' ? 'Asc' : 'Desc'}
            </Button>
            {selectedProviderFilters.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedProviderFilters([])}
                className="whitespace-nowrap"
              >
                Clear providers
              </Button>
            )}
          </div>
        </div>
      </PageHeader>

      <PageContainer>
        {sortedAliases.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface mb-6">
            <EmptyState
              variant="dense"
              icon={<Boxes />}
              title={allAliases.length === 0 ? 'No models yet' : 'No models found'}
              description={
                allAliases.length === 0
                  ? 'Add a model alias to map gateway names to provider models.'
                  : emptyStateMessage
              }
              action={
                allAliases.length === 0 ? (
                  <Button leftIcon={<Plus size={14} />} onClick={handleAddNew}>
                    Add model
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            {/* Mobile — flat list of cards (tap opens the edit modal) */}
            <div className="space-y-3 md:hidden mb-6">
              {sortedAliases.map((alias) => (
                <AliasMobileCard
                  key={alias.id}
                  alias={alias}
                  providers={providers}
                  cooldowns={cooldowns}
                  testStates={testStates}
                  onEdit={handleEdit}
                  onDelete={handleDeleteClick}
                  onToggleTarget={handleToggleTarget}
                  onTestTarget={handleTestTarget}
                  onDismissTestMessage={dismissTestMessage}
                />
              ))}
            </div>

            {/* Desktop — flat table with per-row inline expand editor */}
            <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block mb-6">
              <table className="w-full border-collapse font-sans text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated/50">
                    <th className={HEADER_CELL}>Model</th>
                    <th className={HEADER_CELL}>Type</th>
                    <th className={HEADER_CELL}>Selector</th>
                    <th className={HEADER_CELL}>Metadata</th>
                    <th className={HEADER_CELL}>Active</th>
                    <th className={`${HEADER_CELL} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAliases.map((alias) => {
                    const isExpanded = expandedIds.has(alias.id);
                    const rt = rowTestState(alias.id);
                    return (
                      <React.Fragment key={alias.id}>
                        <tr
                          onClick={() => toggleExpanded(alias.id)}
                          className="group cursor-pointer border-b border-border transition-colors duration-150 hover:bg-surface-elevated/50"
                        >
                          {/* MODEL */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="flex size-5 items-center justify-center text-foreground-muted">
                                {isExpanded ? (
                                  <ChevronDown size={14} />
                                ) : (
                                  <ChevronRight size={14} />
                                )}
                              </span>
                              <span className="font-mono font-semibold text-foreground">
                                {alias.id}
                              </span>
                              {alias.aliases && alias.aliases.length > 0 && (
                                <Pill size="sm" tone="neutral">
                                  +{alias.aliases.length}
                                </Pill>
                              )}
                              <span onClick={(e) => e.stopPropagation()}>
                                <CopyButton value={alias.id} size="sm" />
                              </span>
                            </div>
                          </td>
                          {/* TYPE */}
                          <td className="px-4 py-3.5">
                            <ModelTypeBadge type={alias.type} />
                          </td>
                          {/* SELECTOR */}
                          <td className="px-4 py-3.5">
                            <span className="text-[11px] capitalize text-foreground-muted">
                              {selectorLabel(alias)}
                            </span>
                          </td>
                          {/* METADATA */}
                          <td className="px-4 py-3.5">
                            {alias.metadata ? (
                              <Pill size="sm" tone="accent" className="capitalize">
                                {alias.metadata.source}
                              </Pill>
                            ) : (
                              <span className="text-xs text-foreground-subtle">—</span>
                            )}
                          </td>
                          {/* ACTIVE */}
                          <td className="px-4 py-3.5">
                            <ActiveDots states={getDotStates(alias)} />
                          </td>
                          {/* ACTIONS */}
                          <td
                            className="px-4 py-3.5 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleTestAll(alias)}
                                title="Test all targets"
                                aria-label={`Test ${alias.id}`}
                                className="rounded p-1.5 text-foreground-muted transition-colors hover:bg-success-subtle hover:text-success"
                              >
                                {rt.loading ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : rt.error ? (
                                  <XCircle size={14} className="text-danger" />
                                ) : rt.success ? (
                                  <CheckCircle size={14} className="text-success" />
                                ) : (
                                  <Play size={14} />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEdit(alias)}
                                title="Edit"
                                aria-label={`Edit ${alias.id}`}
                                className="rounded p-1.5 text-foreground-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteClick(alias)}
                                title="Delete"
                                aria-label={`Delete ${alias.id}`}
                                className="rounded p-1.5 text-foreground-muted transition-colors hover:bg-danger-subtle hover:text-danger"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-border">
                            <td colSpan={6} className="px-6 pb-5 pt-1">
                              <div className="flex flex-col gap-5">
                                <RoutingAliasesEditor
                                  aliases={alias.aliases ?? []}
                                  onChange={(next) =>
                                    handleUpdateAlias({ ...alias, aliases: next })
                                  }
                                />
                                <div className="flex flex-col gap-2">
                                  <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground-subtle">
                                    Provider mappings
                                    <span className="ml-2 font-normal normal-case text-foreground-subtle">
                                      upstream model ID per provider
                                    </span>
                                  </div>
                                  <ProviderMappingsEditor
                                    aliasId={alias.id}
                                    targets={alias.target_groups[0]?.targets ?? []}
                                    providers={providers}
                                    availableModels={availableModels}
                                    testStates={testStates}
                                    onChange={(targets) => {
                                      const groups =
                                        alias.target_groups.length > 0
                                          ? alias.target_groups.map((g, i) =>
                                              i === 0 ? { ...g, targets } : g
                                            )
                                          : [{ name: 'default', selector: 'random', targets }];
                                      handleUpdateAlias({ ...alias, target_groups: groups });
                                    }}
                                    onTest={(index, provider, model) => {
                                      let apiTypes: string[] = ['chat'];
                                      if (alias.type === 'embeddings') apiTypes = ['embeddings'];
                                      else if (alias.type === 'image') apiTypes = ['images'];
                                      handleTestTarget(
                                        alias.id,
                                        `${alias.id}-0-${index}`,
                                        provider,
                                        model,
                                        apiTypes
                                      );
                                    }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Edit / Add Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={originalId ? 'Edit Model' : 'Add Model'}
          size="lg"
          footer={
            <>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} isLoading={isSaving}>
                Save Changes
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-2 -mt-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Input
                label="Primary Name (ID)"
                value={editingAlias.id}
                onChange={(e) => setEditingAlias({ ...editingAlias, id: e.target.value })}
                placeholder="e.g. gpt-4-turbo"
              />

              <Select
                label="Model Type"
                value={editingAlias.type ?? 'text'}
                onChange={(value) =>
                  setEditingAlias({
                    ...editingAlias,
                    type: value as 'text' | 'embeddings' | 'transcriptions' | 'speech' | 'image',
                  })
                }
                options={[
                  { value: 'text', label: 'Text' },
                  { value: 'embeddings', label: 'Embeddings' },
                  { value: 'transcriptions', label: 'Transcriptions' },
                  { value: 'speech', label: 'Speech' },
                  { value: 'image', label: 'Image' },
                ]}
              />

              <Select
                label="Priority"
                value={editingAlias.priority || 'selector'}
                onChange={(value) => setEditingAlias({ ...editingAlias, priority: value as any })}
                options={[
                  { value: 'selector', label: 'Selector' },
                  { value: 'api_match', label: 'API Match' },
                ]}
              />
            </div>

            <p className="text-xs text-foreground-subtle -mt-1">
              Priority: &ldquo;Selector&rdquo; uses the strategy above. &ldquo;API Match&rdquo;
              matches provider type to incoming request format.
            </p>

            <div className="h-px bg-border my-1"></div>

            {/* Additional Aliases disclosure */}
            <div className="border border-border rounded-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setIsAliasesOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2 bg-surface-sunken hover:bg-surface-elevated transition-colors duration-150 text-left"
              >
                <span className="font-sans text-[13px] font-medium text-foreground-muted">
                  Additional Aliases
                </span>
                {isAliasesOpen ? (
                  <ChevronDown size={14} className="text-foreground-subtle" />
                ) : (
                  <ChevronRight size={14} className="text-foreground-subtle" />
                )}
              </button>
              {isAliasesOpen && (
                <div className="px-3 py-3 border-t border-border flex flex-col gap-1">
                  {(!editingAlias.aliases || editingAlias.aliases.length === 0) && (
                    <div className="text-foreground-subtle italic text-center text-sm py-1">
                      No additional aliases
                    </div>
                  )}
                  {editingAlias.aliases?.map((alias, idx) => (
                    <div key={idx} className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <Input
                          value={alias}
                          onChange={(e) => {
                            const next = [...(editingAlias.aliases || [])];
                            next[idx] = e.target.value;
                            setEditingAlias({ ...editingAlias, aliases: next });
                          }}
                          placeholder="e.g. gpt4"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...(editingAlias.aliases || [])];
                          next.splice(idx, 1);
                          setEditingAlias({ ...editingAlias, aliases: next });
                        }}
                        className="text-danger opacity-60 hover:opacity-100 px-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-1 w-fit"
                    onClick={() =>
                      setEditingAlias({
                        ...editingAlias,
                        aliases: [...(editingAlias.aliases || []), ''],
                      })
                    }
                    leftIcon={<Plus size={14} />}
                  >
                    Add Alias
                  </Button>
                </div>
              )}
            </div>

            {/* Advanced accordion (behaviors + architecture) */}
            <ModelBehaviorsEditor editingAlias={editingAlias} setEditingAlias={setEditingAlias} />

            <div className="h-px bg-border my-1"></div>

            {/* Metadata accordion */}
            <ModelMetadataEditor
              editingAlias={editingAlias}
              setEditingAlias={setEditingAlias}
              isModalOpen={isModalOpen}
            />

            <div className="h-px bg-border my-1"></div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="font-sans text-[13px] font-medium text-foreground-muted">
                  Target Groups
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setIsAutoAddModalOpen(true)}
                    leftIcon={<Zap size={14} />}
                  >
                    Auto Add
                  </Button>
                </div>
              </div>

              <TargetGroupEditor
                groups={editingAlias.target_groups}
                providers={providers}
                availableModels={availableModels}
                onChange={(groups) => setEditingAlias({ ...editingAlias, target_groups: groups })}
              />
            </div>
          </div>
        </Modal>

        {/* Auto Add Modal */}
        <AutoAddModal
          isOpen={isAutoAddModalOpen}
          onClose={() => setIsAutoAddModalOpen(false)}
          providers={providers}
          availableModels={availableModels}
          targetGroups={editingAlias.target_groups}
          onAddTargets={handleAutoAddTargets}
          preFillQuery={editingAlias.id || ''}
        />

        {/* Import Modal */}
        <ImportModelsModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          orphanGroups={orphanGroups}
          selectedImports={selectedImports}
          setSelectedImports={setSelectedImports}
          selectedModels={selectedImportModels}
          setSelectedModels={setSelectedImportModels}
          selectedAliases={selectedImportAliases}
          setSelectedAliases={setSelectedImportAliases}
          onSuppress={handleSuppressImportModel}
          onUnsuppressAll={handleUnsuppressAllImportModels}
          hasSuppressedModels={hasSuppressedImportModels}
          onImport={handleSaveImports}
          isImporting={isImporting}
        />

        {/* Delete All Modal */}
        <ConfirmDeleteModal
          isOpen={isDeleteAllModalOpen}
          onClose={() => setIsDeleteAllModalOpen(false)}
          title="Delete All Models"
          message={
            <>
              This will permanently remove <strong>{allAliases.length}</strong> model alias
              {allAliases.length !== 1 ? 'es' : ''} from the configuration.
            </>
          }
          confirmLabel="Delete All"
          onConfirm={handleConfirmDeleteAll}
          isLoading={isDeletingAll}
        />

        {/* Delete Single Modal */}
        <ConfirmDeleteModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Delete Model Alias"
          message={
            <>
              <strong>{aliasToDelete?.id}</strong> will be permanently removed from the
              configuration.
            </>
          }
          onConfirm={handleConfirmDelete}
          isLoading={isDeleting}
        />
      </PageContainer>
    </div>
  );
};
