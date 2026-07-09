import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Switch } from '../components/ui/Switch';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import { useProviderForm } from '../hooks/useProviderForm';
import { ProviderList } from '../components/providers/ProviderList';
import { ProviderApiUrlsEditor } from '../components/providers/ProviderApiUrlsEditor';
import { ProviderOAuthEditor } from '../components/providers/ProviderOAuthEditor';
import { ProviderQuotaEditor } from '../components/providers/ProviderQuotaEditor';
import { ProviderAdvancedEditor } from '../components/providers/ProviderAdvancedEditor';
import { ProviderModelsEditor } from '../components/providers/ProviderModelsEditor';
import { FetchModelsModal } from '../components/providers/FetchModelsModal';
import { DeleteProviderModal } from '../components/providers/DeleteProviderModal';
import { Plus } from 'lucide-react';

export const Providers = () => {
  const f = useProviderForm();

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

        {/* Edit / Add Modal */}
        <Modal
          isOpen={f.isModalOpen}
          onClose={() => f.setIsModalOpen(false)}
          title={f.originalId ? `Edit Provider: ${f.originalId}` : 'Add Provider'}
          size="lg"
          footer={
            <>
              <Button variant="ghost" onClick={() => f.setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={f.handleSave}
                isLoading={f.isSaving}
                disabled={!!f.quotaValidationError}
              >
                Save Provider
              </Button>
            </>
          }
        >
          <div className="sticky top-0 z-10 -mt-5 -mx-5 mb-3 px-5 py-2 bg-surface-elevated/95 backdrop-blur border-b border-border flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                document
                  .getElementById('section-connection')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Connection
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                document.getElementById('section-quota')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Quota
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                f.setIsAdvancedOpen(true);
                document.getElementById('section-advanced')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Advanced
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                f.setIsModelsOpen(true);
                document.getElementById('section-models')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Models
            </Button>
          </div>
          <div className="flex flex-col gap-2.5 -mt-2">
            {/* Basic fields */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
              <Input
                label="Unique ID"
                value={f.editingProvider.id}
                onChange={(e) => f.setEditingProvider({ ...f.editingProvider, id: e.target.value })}
                placeholder="e.g. openai"
                disabled={!!f.originalId}
              />
              <Input
                label="Display Name"
                value={f.editingProvider.name}
                onChange={(e) =>
                  f.setEditingProvider({ ...f.editingProvider, name: e.target.value })
                }
                placeholder="e.g. OpenAI Production"
              />
              <Input
                label="API Key"
                type="password"
                value={f.editingProvider.apiKey}
                onChange={(e) =>
                  f.setEditingProvider({ ...f.editingProvider, apiKey: e.target.value })
                }
                placeholder="sk-..."
                disabled={f.isOAuthMode}
              />
              <div className="flex flex-col gap-2">
                <label className="font-sans text-[13px] font-medium text-foreground-muted">
                  Enabled
                </label>
                <div className="h-[38px] flex items-center">
                  <Switch
                    checked={f.editingProvider.enabled !== false}
                    onChange={(checked) =>
                      f.setEditingProvider({ ...f.editingProvider, enabled: checked })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="h-px bg-border my-1" />

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {/* Left: APIs & Base URLs */}
              <ProviderApiUrlsEditor
                isOAuthMode={f.isOAuthMode}
                getPrimaryEntry={f.getPrimaryEntry}
                setPrimaryEntry={f.setPrimaryEntry}
                editingProvider={f.editingProvider}
                setEditingProvider={f.setEditingProvider}
                OAUTH_PROVIDERS={f.OAUTH_PROVIDERS}
                oauthSlot={
                  f.isOAuthMode && (
                    <ProviderOAuthEditor
                      editingProvider={f.editingProvider}
                      oauthSession={f.oauthSession}
                      oauthSessionId={f.oauthSessionId}
                      oauthPromptValue={f.oauthPromptValue}
                      setOauthPromptValue={f.setOauthPromptValue}
                      oauthManualCode={f.oauthManualCode}
                      setOauthManualCode={f.setOauthManualCode}
                      oauthError={f.oauthError}
                      oauthBusy={f.oauthBusy}
                      oauthCredentialReady={f.oauthCredentialReady}
                      oauthCredentialChecking={f.oauthCredentialChecking}
                      oauthStatus={f.oauthStatus}
                      oauthIsTerminal={f.oauthIsTerminal}
                      oauthStatusLabel={f.oauthStatusLabel}
                      onStart={f.handleStartOAuth}
                      onSubmitPrompt={f.handleSubmitPrompt}
                      onSubmitManualCode={f.handleSubmitManualCode}
                      onCancel={f.handleCancelOAuth}
                    />
                  )
                }
              />

              {/* Right: Quota Checker */}
              <ProviderQuotaEditor
                editingProvider={f.editingProvider}
                setEditingProvider={f.setEditingProvider}
                selectedQuotaCheckerType={f.selectedQuotaCheckerType}
                selectableQuotaCheckerTypes={f.selectableQuotaCheckerTypes}
                isOAuthMode={f.isOAuthMode}
                oauthCheckerType={f.oauthCheckerType}
                quotaValidationError={f.quotaValidationError}
              />
            </div>

            {/* Advanced */}
            <ProviderAdvancedEditor
              editingProvider={f.editingProvider}
              setEditingProvider={f.setEditingProvider}
              addKV={f.addKV}
              updateKV={f.updateKV}
              removeKV={f.removeKV}
              isAdvancedOpen={f.isAdvancedOpen}
              setIsAdvancedOpen={f.setIsAdvancedOpen}
              isApiBaseUrlsOpen={f.isApiBaseUrlsOpen}
              setIsApiBaseUrlsOpen={f.setIsApiBaseUrlsOpen}
              isOAuthMode={f.isOAuthMode}
              getApiBaseUrlMap={f.getApiBaseUrlMap}
              addAdditionalBaseUrlEntry={f.addAdditionalBaseUrlEntry}
              updateApiBaseUrlEntry={f.updateApiBaseUrlEntry}
              removeApiBaseUrlEntry={f.removeApiBaseUrlEntry}
            />

            {/* Models */}
            <ProviderModelsEditor
              editingProvider={f.editingProvider}
              setEditingProvider={f.setEditingProvider}
              isModelsOpen={f.isModelsOpen}
              setIsModelsOpen={f.setIsModelsOpen}
              openModelIdx={f.openModelIdx}
              setOpenModelIdx={f.setOpenModelIdx}
              isModelExtraBodyOpen={f.isModelExtraBodyOpen}
              setIsModelExtraBodyOpen={f.setIsModelExtraBodyOpen}
              testStates={f.testStates}
              addModel={f.addModel}
              updateModelId={f.updateModelId}
              updateModelConfig={f.updateModelConfig}
              removeModel={f.removeModel}
              addModelKV={f.addModelKV}
              updateModelKV={f.updateModelKV}
              removeModelKV={f.removeModelKV}
              onOpenFetchModels={f.handleOpenFetchModels}
              onTestModel={f.handleTestModel}
              onDismissTestMessage={f.dismissTestMessage}
              getApiBaseUrlMap={f.getApiBaseUrlMap}
              isNewProvider={!f.originalId}
            />
          </div>
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
