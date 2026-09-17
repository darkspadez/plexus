import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  useApiKeys,
  useKeysProviderIds,
  useKeysAliasIds,
  useDefaultQuotaNames,
} from '../../hooks/queries/useKeys';
import { useUserQuotas } from '../../hooks/queries/useUserQuotas';
import type { KeysPageData, QuotaStatusResponse } from './types';

export function useKeysPageData(): KeysPageData {
  const { data: keys = [] } = useApiKeys();
  const { data: quotas = {} } = useUserQuotas();
  const { data: providerIds = [] } = useKeysProviderIds();
  const { data: aliasIds = [] } = useKeysAliasIds();
  const { data: defaultQuotaNames = [] } = useDefaultQuotaNames();

  const [quotaStatuses, setQuotaStatuses] = useState<Record<string, QuotaStatusResponse>>({});

  // Load quota status only for keys that can actually resolve quota entries:
  // keys with assigned `quotas`, or — when `default_quotas` is set — every
  // key (bare keys inherit the defaults). Returns the refreshed map so
  // callers (reset / recompute handlers) can reuse it for the open detail
  // modal without a second `getQuotaStatus` round trip.
  const loadQuotaStatuses = React.useCallback(async (): Promise<Record<
    string,
    QuotaStatusResponse
  > | null> => {
    try {
      const eligible = keys.filter(
        (key) => (key.quotas?.length ?? 0) > 0 || defaultQuotaNames.length > 0
      );
      const statuses: Record<string, QuotaStatusResponse> = {};
      await Promise.all(
        eligible.map(async (key) => {
          try {
            const status = await api.getQuotaStatus(key.key);
            if (status) {
              statuses[key.key] = status;
            }
          } catch (e) {
            console.error(`Failed to load quota status for ${key.key}`, e);
          }
        })
      );
      setQuotaStatuses(statuses);
      return statuses;
    } catch (e) {
      console.error('Failed to load quota statuses', e);
      return null;
    }
  }, [keys, defaultQuotaNames]);

  // Re-run whenever keys, quota definitions, or the default-quotas list
  // refresh (react-query hands back a new reference whenever any of these
  // queries actually refetch with different content, thanks to structural
  // sharing) — covers quota (re)assignment, definition edits (e.g. limit
  // changes), and default_quotas toggling in one place.
  useEffect(() => {
    loadQuotaStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, quotas, defaultQuotaNames]);

  return {
    keys,
    quotas,
    quotaStatuses,
    providerIds,
    aliasIds,
    defaultQuotaNames,
    loadQuotaStatuses,
  };
}
