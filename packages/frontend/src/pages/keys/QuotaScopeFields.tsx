import type { Dispatch, SetStateAction } from 'react';
import { TagSelect } from '../../components/ui/TagSelect';
import type { EditableQuota } from './types';

interface QuotaScopeFieldsProps {
  readonly quota: EditableQuota;
  readonly setQuota: Dispatch<SetStateAction<EditableQuota>>;
  readonly providerIds: string[];
  readonly modelNames: string[];
}

export const QuotaScopeFields = ({
  quota,
  setQuota,
  providerIds,
  modelNames,
}: QuotaScopeFieldsProps) => (
  <>
    <div className="flex flex-col gap-2 pt-2 border-t border-border-glass">
      <p className="text-xs font-medium text-text-secondary">
        Scope (optional — unscoped applies to every provider/model)
      </p>
    </div>
    <TagSelect
      label="Allowed Providers"
      placeholder="Optional: restrict to these providers..."
      options={providerIds}
      selected={quota.allowedProviders || []}
      onChange={(allowedProviders) => setQuota({ ...quota, allowedProviders })}
    />
    <TagSelect
      label="Excluded Providers"
      placeholder="Optional: exclude these providers..."
      options={providerIds}
      selected={quota.excludedProviders || []}
      onChange={(excludedProviders) => setQuota({ ...quota, excludedProviders })}
    />
    <TagSelect
      label="Allowed Models"
      placeholder="Optional: restrict to these models..."
      options={modelNames}
      selected={quota.allowedModels || []}
      allowCustom
      onChange={(allowedModels) => setQuota({ ...quota, allowedModels })}
    />
    <TagSelect
      label="Excluded Models"
      placeholder="Optional: exclude these models..."
      options={modelNames}
      selected={quota.excludedModels || []}
      allowCustom
      onChange={(excludedModels) => setQuota({ ...quota, excludedModels })}
    />
    <p className="text-xs text-text-muted -mt-1">
      Only requests matching the allowed/not-excluded provider and model count against this quota.
      Model names accept free-typing since not every model is synced into a provider's catalog yet.
    </p>
  </>
);
