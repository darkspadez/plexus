import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { DisabledKeyList } from './keys/DisabledKeyList';
import { KeyEditorModal } from './keys/KeyEditorModal';
import { KeyList } from './keys/KeyList';
import { KeySearch } from './keys/KeySearch';
import { KeySecurityModal } from './keys/KeySecurityModal';
import { keyMatchesSearch, isKeyDisabled } from './keys/keyUtils';
import { QuotaDetailModal } from './keys/QuotaDetailModal';
import { QuotaEditorModal } from './keys/QuotaEditorModal';
import { QuotaTab } from './keys/QuotaTab';
import { SecurityTab } from './keys/SecurityTab';
import { OneTimeSecretModal } from './keys/OneTimeSecretModal';
import type { KeysTab } from './keys/types';
import { useKeyActions } from './keys/useKeyActions';
import { useKeysData } from './keys/useKeysData';
import { useKeySecurity } from './keys/useKeySecurity';
import { useQuotaActions } from './keys/useQuotaActions';

export const Keys = () => {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<KeysTab>('keys');
  const [showDisabledKeys, setShowDisabledKeys] = useState(false);
  const data = useKeysData();
  const keyActions = useKeyActions({ loadData: data.loadData });
  const security = useKeySecurity({ refreshKeys: data.loadData });
  const quotaActions = useQuotaActions({
    quotaStatuses: data.quotaStatuses,
    defaultQuotaNames: data.defaultQuotaNames,
    setDefaultQuotaNames: data.setDefaultQuotaNames,
    loadData: data.loadData,
  });

  const filteredKeys = data.keys.filter((key) => keyMatchesSearch(key, search));
  const activeKeys = filteredKeys.filter((key) => !isKeyDisabled(key));
  const disabledKeys = filteredKeys.filter(isKeyDisabled);
  const filteredQuotas = Object.entries(data.quotas).filter(([name]) =>
    name.toLowerCase().includes(search.toLowerCase())
  );
  const activeKeyCount = data.keys.filter((key) => !isKeyDisabled(key)).length;

  useEffect(() => {
    if (activeTab === 'security') {
      void security.loadEvidence(data.keys.map((key) => key.key));
    }
  }, [activeTab, data.keys, security.loadEvidence]);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Access Control"
        subtitle="API keys issued for downstream consumers"
        actions={
          activeTab === 'keys' ? (
            <Button leftIcon={<Plus size={14} />} onClick={keyActions.addKey} size="sm">
              Create key
            </Button>
          ) : activeTab === 'quotas' ? (
            <Button leftIcon={<Plus size={14} />} onClick={quotaActions.addQuota} size="sm">
              Add quota
            </Button>
          ) : undefined
        }
      >
        <Tabs
          value={activeTab}
          onChange={(value) => {
            if (value === 'keys' || value === 'quotas' || value === 'security') {
              setActiveTab(value);
            }
          }}
          items={[
            { value: 'keys', label: `API Keys (${activeKeyCount})` },
            { value: 'quotas', label: `Quotas (${Object.keys(data.quotas).length})` },
            { value: 'security', label: 'Security' },
          ]}
        />
      </PageHeader>
      <PageContainer>
        <div className="hidden">
          <div>
            <button
              className={`px-4 py-2 font-body text-sm font-medium transition-colors ${
                activeTab === 'keys'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-text-secondary hover:text-text'
              }`}
              onClick={() => setActiveTab('keys')}
            >
              API Keys ({activeKeyCount})
            </button>
            <button
              className={`px-4 py-2 font-body text-sm font-medium transition-colors ${
                activeTab === 'quotas'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-text-secondary hover:text-text'
              }`}
              onClick={() => setActiveTab('quotas')}
            >
              Quotas ({Object.keys(data.quotas).length})
            </button>
          </div>
        </div>
        {activeTab !== 'security' && (
          <KeySearch activeTab={activeTab} value={search} onChange={setSearch} />
        )}
        {activeTab === 'keys' && (
          <>
            <KeyList
              keys={activeKeys}
              quotaStatuses={data.quotaStatuses}
              defaultQuotaNames={data.defaultQuotaNames}
              policies={security.snapshot?.keys ?? {}}
              onEdit={keyActions.editKey}
              onDisable={(key) => void keyActions.disableKey(key)}
              onDelete={(keyName) => void keyActions.deleteKey(keyName)}
              onViewQuota={quotaActions.viewQuotaStatus}
              onClearQuota={(keyName) => void quotaActions.clearQuota(keyName)}
              onSecurity={(key) => void security.openKey(key)}
            />
            <DisabledKeyList
              keys={disabledKeys}
              isOpen={showDisabledKeys}
              onOpenChange={setShowDisabledKeys}
              policies={security.snapshot?.keys ?? {}}
              onSecurity={(key) => void security.openKey(key)}
            />
          </>
        )}
        {activeTab === 'quotas' && (
          <QuotaTab
            keys={data.keys}
            quotas={data.quotas}
            filteredQuotas={filteredQuotas}
            defaultQuotaNames={data.defaultQuotaNames}
            isSavingDefaults={quotaActions.isSavingDefaults}
            onSaveDefaults={(names) => void quotaActions.saveDefaultQuotas(names)}
            onEdit={quotaActions.editQuota}
            onDelete={(name) => void quotaActions.deleteQuota(name)}
          />
        )}
        {activeTab === 'security' && (
          <SecurityTab
            snapshot={security.snapshot}
            evidence={security.wouldPauseEvents}
            isLoadingEvidence={security.isLoadingEvidence}
            isSaving={security.isSavingGlobal}
            error={security.snapshotError}
            onSave={(policy) => void security.saveGlobal(policy)}
          />
        )}
        <KeyEditorModal
          isOpen={keyActions.isKeyModalOpen}
          onClose={keyActions.closeKeyModal}
          editingKey={keyActions.editingKey}
          setEditingKey={keyActions.setEditingKey}
          originalKeyName={keyActions.originalKeyName}
          isSaving={keyActions.isSavingKey}
          expiryAmount={keyActions.expiryAmount}
          setExpiryAmount={keyActions.setExpiryAmount}
          expiryUnit={keyActions.expiryUnit}
          setExpiryUnit={keyActions.setExpiryUnit}
          aliasIds={data.aliasIds}
          providerIds={data.providerIds}
          quotas={data.quotas}
          isRotating={keyActions.isRotating}
          onRotate={() => void keyActions.rotateKey()}
          onSave={() => void keyActions.saveKey()}
        />
        <QuotaEditorModal
          isOpen={quotaActions.isQuotaModalOpen}
          onClose={quotaActions.closeQuotaModal}
          quota={quotaActions.editingQuota}
          setQuota={quotaActions.setEditingQuota}
          originalName={quotaActions.originalQuotaName}
          isSaving={quotaActions.isSavingQuota}
          providerIds={data.providerIds}
          modelNames={data.allModelNames}
          onSave={() => void quotaActions.saveQuota()}
        />
        <QuotaDetailModal
          isOpen={quotaActions.isQuotaDetailOpen}
          onClose={quotaActions.closeQuotaDetail}
          keyName={quotaActions.selectedQuotaName}
          status={quotaActions.selectedQuotaStatus}
          quotas={data.quotas}
          recomputingQuota={quotaActions.recomputingQuota}
          onClear={(keyName, quotaName) => void quotaActions.clearQuota(keyName, quotaName)}
          onRecompute={(keyName, quotaName) => void quotaActions.recomputeQuota(keyName, quotaName)}
        />
        <OneTimeSecretModal
          value={keyActions.oneTimeSecret}
          onClose={keyActions.closeOneTimeSecret}
        />
        <KeySecurityModal
          keyConfig={security.selectedKey}
          preview={security.selectedPreview}
          events={security.events}
          eventOffset={security.eventOffset}
          pageSize={security.pageSize}
          eventsHaveMore={security.eventsHaveMore}
          isLoading={security.isLoadingKey}
          isLoadingEvents={security.isLoadingEvents}
          isSavingPolicy={security.isSavingKey}
          isTransitioning={security.isTransitioning}
          error={security.keyError}
          onClose={security.closeKey}
          onPage={security.loadEvents}
          onSavePolicy={(policy) => void security.saveKeyPolicy(policy)}
          onTransition={security.transition}
        />
      </PageContainer>
    </div>
  );
};
