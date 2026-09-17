import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { SearchInput } from '../components/ui/SearchInput';
import { PageHeader } from '../components/layout/PageHeader';
import { PageContainer } from '../components/layout/PageContainer';
import { SECTION_NAMES } from '../lib/nav';
import { useCurrency } from '../lib/CurrencyContext';
import { filterKeys, isKeyDisabled } from './keys/helpers';
import { KeyLists } from './keys/KeyLists';
import { KeySheet } from './keys/KeySheet';
import { QuotaStatusModal } from './keys/QuotaStatusModal';
import { useKeysPageData } from './keys/useKeysPageData';
import { useKeyActions } from './keys/useKeyActions';
import { useQuotaActions } from './keys/useQuotaActions';

export const Keys = () => {
  const { currency, rate, symbol } = useCurrency();
  const pageData = useKeysPageData();
  const keyActions = useKeyActions();
  const quotaActions = useQuotaActions({
    quotaStatuses: pageData.quotaStatuses,
    loadQuotaStatuses: pageData.loadQuotaStatuses,
  });
  const [search, setSearch] = useState('');
  const [showDisabledKeys, setShowDisabledKeys] = useState(false);

  const filteredKeys = filterKeys(pageData.keys, search);
  const activeKeys = filteredKeys.filter((key) => !isKeyDisabled(key));
  const disabledKeys = filteredKeys.filter(isKeyDisabled);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={SECTION_NAMES['/keys']}
        subtitle="API keys issued for downstream consumers"
        actions={
          <>
            <div className="w-full sm:w-64">
              <SearchInput value={search} onChange={setSearch} placeholder="Search keys…" />
            </div>
            <Button leftIcon={<Plus size={14} />} onClick={keyActions.handleAddNewKey} size="md">
              Create key
            </Button>
          </>
        }
      />

      <PageContainer>
        <KeyLists
          activeKeys={activeKeys}
          disabledKeys={disabledKeys}
          defaultQuotaNames={pageData.defaultQuotaNames}
          quotaStatuses={pageData.quotaStatuses}
          copiedKey={keyActions.copiedKey}
          currency={currency}
          rate={rate}
          symbol={symbol}
          showDisabledKeys={showDisabledKeys}
          onSetShowDisabledKeys={setShowDisabledKeys}
          onEditKey={keyActions.handleEditKey}
          onDisableKey={keyActions.handleDisableKey}
          onDeleteKey={keyActions.handleDeleteKey}
          onCopy={keyActions.handleCopy}
          onViewQuotaStatus={quotaActions.handleViewQuotaStatus}
          onClearQuota={quotaActions.handleClearQuota}
          onAddNewKey={keyActions.handleAddNewKey}
          search={search}
        />

        {/* Key Sheet — create / edit (react-hook-form + zod; owns its own
            save + query-invalidation, see key-schema.ts). */}
        <KeySheet
          open={keyActions.isKeySheetOpen}
          onOpenChange={keyActions.setIsKeySheetOpen}
          editingKeyName={keyActions.originalKeyName}
          initial={keyActions.editingKey}
          providerIds={pageData.providerIds}
          aliasIds={pageData.aliasIds}
          quotas={pageData.quotas}
        />

        {/* Per-key quota usage detail. Quota *definitions* (create / edit /
            delete / default-quotas assignment) live on the dedicated
            `/user-quotas` page — not duplicated here. */}
        <QuotaStatusModal
          isOpen={quotaActions.isQuotaDetailOpen}
          onClose={() => quotaActions.setIsQuotaDetailOpen(false)}
          selectedQuotaName={quotaActions.selectedQuotaName}
          selectedQuotaStatus={quotaActions.selectedQuotaStatus}
          quotas={pageData.quotas}
          recomputingQuota={quotaActions.recomputingQuota}
          currency={currency}
          rate={rate}
          symbol={symbol}
          onClearQuota={quotaActions.handleClearQuota}
          onRecomputeQuota={quotaActions.handleRecomputeQuota}
        />
      </PageContainer>
    </div>
  );
};
