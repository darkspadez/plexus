import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Switch } from '../components/ui/Switch';
import { Tabs } from '../components/ui/Tabs';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import { useProviderForm } from '../hooks/useProviderForm';
import { PROVIDER_FORM_TABS } from './providers/provider-tab-errors';
import { ProviderList } from '../components/providers/ProviderList';
import { ProviderConnectionTab } from '../components/providers/ProviderConnectionTab';
import { ProviderLimitsTab } from '../components/providers/ProviderLimitsTab';
import { ProviderTransformationsTab } from '../components/providers/ProviderTransformationsTab';
import { ProviderModelsTab } from '../components/providers/ProviderModelsTab';
import { FetchModelsModal } from '../components/providers/FetchModelsModal';
import { DeleteProviderModal } from '../components/providers/DeleteProviderModal';
import { Plus } from 'lucide-react';

export const Providers = () => {
  const f = useProviderForm();

  const isEditing = !!f.originalId;
  const subtitle = isEditing
    ? [
        f.editingProvider.name && f.editingProvider.name !== f.originalId
          ? f.editingProvider.name
          : null,
        f.originalId,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  const tabItems = PROVIDER_FORM_TABS.map((tab) => ({
    value: tab.value,
    label: (
      <span className="inline-flex items-center gap-1.5">
        {tab.label}
        {f.saveAttempted && f.tabErrors[tab.value] && (
          <span aria-hidden className="inline-block size-1.5 rounded-full bg-danger" />
        )}
      </span>
    ),
  }));

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Providers"
        subtitle="Upstream LLM providers routed by the gateway"
        actions={
          <Button leftIcon={<Plus size={14} />} onClick={f.handleAddNew} size="md">
            Add provider
          </Button>
        }
      />

      <PageContainer>
        <ProviderList
          providers={f.sortedProviders}
          getQuotaDisplay={f.getQuotaDisplay}
          onEdit={f.handleEdit}
          onToggleEnabled={f.handleToggleEnabled}
          onDelete={f.openDeleteModal}
          emptyAction={
            <Button leftIcon={<Plus size={14} />} onClick={f.handleAddNew}>
              Add provider
            </Button>
          }
        />

        {/* Edit / Add drawer — four pinned tabs over a single scrollable panel */}
        <Modal
          isOpen={f.isModalOpen}
          onClose={f.requestClose}
          title={isEditing ? 'Edit provider' : 'Add provider'}
          subtitle={subtitle}
          headerActions={
            <div className="flex items-center gap-2">
              <span className="font-sans text-xs text-foreground-muted">Enabled</span>
              <Switch
                aria-label="Provider enabled"
                checked={f.editingProvider.enabled !== false}
                onChange={(checked) =>
                  f.setEditingProvider({ ...f.editingProvider, enabled: checked })
                }
              />
            </div>
          }
          subHeader={
            <Tabs
              value={f.activeTab}
              onChange={f.setActiveTab}
              items={tabItems}
              aria-label="Provider settings sections"
            />
          }
          size="lg"
          footer={
            <>
              {f.isDirty && (
                <span className="mr-auto inline-flex items-center gap-1.5 font-sans text-xs text-foreground-muted">
                  <span aria-hidden className="inline-block size-1.5 rounded-full bg-warning" />
                  Unsaved changes
                </span>
              )}
              <Button variant="ghost" onClick={f.requestClose}>
                Cancel
              </Button>
              <Button onClick={f.handleSave} isLoading={f.isSaving}>
                {isEditing ? 'Save changes' : 'Create provider'}
              </Button>
            </>
          }
        >
          {/* Panels stay mounted so debounced inputs and local disclosure state
              survive tab switches; inactive panels are display:none. */}
          <div className={f.activeTab === 'connection' ? undefined : 'hidden'}>
            <ProviderConnectionTab f={f} />
          </div>
          <div className={f.activeTab === 'limits' ? undefined : 'hidden'}>
            <ProviderLimitsTab f={f} />
          </div>
          <div className={f.activeTab === 'transformations' ? undefined : 'hidden'}>
            <ProviderTransformationsTab f={f} />
          </div>
          <div className={f.activeTab === 'models' ? undefined : 'hidden'}>
            <ProviderModelsTab f={f} />
          </div>
        </Modal>

        {/* Discard-unsaved-changes confirmation */}
        <Modal
          isOpen={f.showDiscardConfirm}
          onClose={() => f.setShowDiscardConfirm(false)}
          title="Discard unsaved changes?"
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => f.setShowDiscardConfirm(false)}>
                Keep editing
              </Button>
              <Button variant="danger" onClick={f.confirmDiscard}>
                Discard
              </Button>
            </>
          }
        >
          <p className="font-sans text-sm text-foreground-muted m-0">
            Your edits to this provider haven&apos;t been saved and will be lost.
          </p>
        </Modal>

        {/* Fetch Models Modal */}
        <FetchModelsModal
          isOpen={f.isFetchModelsModalOpen}
          onClose={() => f.setIsFetchModelsModalOpen(false)}
          modelsUrl={f.modelsUrl}
          setModelsUrl={f.setModelsUrl}
          isFetchingModels={f.isFetchingModels}
          fetchedModels={f.fetchedModels}
          selectedModelIds={f.selectedModelIds}
          fetchError={f.fetchError}
          isOAuthMode={f.isOAuthMode}
          onFetch={f.handleFetchModels}
          onToggleSelection={f.toggleModelSelection}
          onSelectAll={f.selectAllFetchedModels}
          onClearSelection={f.clearSelectedModels}
          onAddSelected={f.handleAddSelectedModels}
        />

        {/* Delete Provider Modal */}
        <DeleteProviderModal
          provider={f.deleteModalProvider}
          affectedAliases={f.affectedAliases}
          deleteModalLoading={f.deleteModalLoading}
          onClose={() => f.setDeleteModalProvider(null)}
          onDelete={f.handleDelete}
        />
      </PageContainer>
    </div>
  );
};
