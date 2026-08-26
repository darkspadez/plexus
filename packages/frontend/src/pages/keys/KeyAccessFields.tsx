import type { Dispatch, SetStateAction } from 'react';
import { TagSelect } from '../../components/ui/TagSelect';
import { Switch } from '../../components/ui/Switch';
import type { UserQuota } from '../../lib/api';
import type { EditableKeyConfig } from '../../lib/api/keys';

interface KeyAccessFieldsProps {
  readonly editingKey: EditableKeyConfig;
  readonly setEditingKey: Dispatch<SetStateAction<EditableKeyConfig>>;
  readonly aliasIds: string[];
  readonly providerIds: string[];
  readonly quotas: Readonly<Record<string, UserQuota>>;
}

export const KeyAccessFields = ({
  editingKey,
  setEditingKey,
  aliasIds,
  providerIds,
  quotas,
}: KeyAccessFieldsProps) => (
  <>
    <TagSelect
      label="Excluded Model Aliases"
      placeholder="Optional: select model aliases to exclude..."
      options={aliasIds}
      selected={editingKey.excludedModels || []}
      onChange={(excludedModels) =>
        setEditingKey({
          ...editingKey,
          excludedModels: excludedModels.length > 0 ? excludedModels : undefined,
        })
      }
    />
    <p className="text-xs text-text-muted -mt-1">
      Optional denylist. If set, this key cannot use these model aliases.
    </p>
    <TagSelect
      label="Allowed Model Aliases"
      placeholder="Optional: select model aliases..."
      options={aliasIds}
      selected={editingKey.allowedModels || []}
      onChange={(allowedModels) =>
        setEditingKey({
          ...editingKey,
          allowedModels: allowedModels.length > 0 ? allowedModels : undefined,
        })
      }
    />
    <p className="text-xs text-text-muted -mt-1">
      Optional allowlist. If set, this key can only use these configured model aliases.
    </p>
    <TagSelect
      label="Excluded Providers"
      placeholder="Optional: select providers to exclude..."
      options={providerIds}
      selected={editingKey.excludedProviders || []}
      onChange={(excludedProviders) =>
        setEditingKey({
          ...editingKey,
          excludedProviders: excludedProviders.length > 0 ? excludedProviders : undefined,
        })
      }
    />
    <p className="text-xs text-text-muted -mt-1">
      Optional denylist. If set, routing will not use these provider IDs.
    </p>
    <TagSelect
      label="Allowed Providers"
      placeholder="Optional: select providers..."
      options={providerIds}
      selected={editingKey.allowedProviders || []}
      onChange={(allowedProviders) =>
        setEditingKey({
          ...editingKey,
          allowedProviders: allowedProviders.length > 0 ? allowedProviders : undefined,
        })
      }
    />
    <p className="text-xs text-text-muted -mt-1">
      Optional allowlist. If set, routing is limited to these provider IDs.
    </p>
    <label className="flex items-start gap-2 py-1 cursor-pointer">
      <Switch
        checked={editingKey.allowRawPassthrough === true}
        onChange={(allowRawPassthrough) => setEditingKey({ ...editingKey, allowRawPassthrough })}
      />
      <div>
        <div className="font-body text-[13px] text-text">Allow Raw Provider Access</div>
        <div className="text-xs text-text-muted" style={{ lineHeight: 1.35 }}>
          Privileged capability. This key may call any endpoint on raw-enabled providers permitted
          by its provider allow/deny lists. Model restrictions do not apply.
        </div>
      </div>
    </label>
    <TagSelect
      label="Allowed IPs"
      placeholder="e.g. 192.168.1.10  10.0.0.0/8  10.1.0.10-20"
      options={[]}
      selected={editingKey.allowedIps || []}
      allowCustom
      splitOnSpace
      onChange={(allowedIps) =>
        setEditingKey({ ...editingKey, allowedIps: allowedIps.length > 0 ? allowedIps : undefined })
      }
    />
    <p className="text-xs text-text-muted -mt-1">
      Optional allowlist. Type entries separated by spaces. Empty means allow all;{' '}
      <code>0.0.0.0/0</code> is all IPv4 and <code>::/0</code> all IPv6. Accepts IPv4/IPv6, CIDR
      (e.g. <code>10.0.0.0/8</code>), and ranges (e.g. <code>10.1.0.10-20</code>).
    </p>
    <TagSelect
      label="Quota Assignment"
      placeholder="No quotas — falls back to default quotas, if any..."
      options={Object.keys(quotas).sort()}
      selected={editingKey.quotas || []}
      onChange={(names) =>
        setEditingKey({ ...editingKey, quotas: names.length > 0 ? names : undefined })
      }
    />
    <p className="text-xs text-text-muted -mt-1">
      Optional: assign one or more quotas to this key (usage against each is tracked independently).
      When left empty, this key falls back to the system's default quotas, if any are configured.
    </p>
  </>
);
