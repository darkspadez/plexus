import React from 'react';
import { Edit2, Trash2, Clock, Play, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Switch } from '../ui-v2/switch';
import { cn } from '../../lib/cn';
import { Pill } from '../chips/Pill';
import { Alias, Provider, Cooldown } from '../../lib/api';
import { ModelTypeBadge } from './ModelTypeBadge';

interface AliasTableRowProps {
  alias: Alias;
  providers: Provider[];
  cooldowns: Cooldown[];
  testStates: Record<string, any>;
  onEdit: (alias: Alias) => void;
  onDelete: (alias: Alias) => void;
  onToggleTarget: (alias: Alias, targetIndex: number, newState: boolean) => void;
  onTestTarget: (
    aliasId: string,
    idx: number,
    providerId: string,
    modelId: string,
    types: string[]
  ) => void;
}

export const AliasTableRow: React.FC<AliasTableRowProps> = ({
  alias,
  providers,
  cooldowns,
  testStates,
  onEdit,
  onDelete,
  onToggleTarget,
  onTestTarget,
}) => {
  return (
    <tr className="hover:bg-surface-elevated">
      <td
        className="border-b border-border px-4 py-3 text-left text-foreground"
        style={{ fontWeight: 600, paddingLeft: '24px' }}
      >
        <div onClick={() => onEdit(alias)} className="flex cursor-pointer items-center gap-2">
          <span className="font-mono">{alias.id}</span>
        </div>
      </td>
      <td className="border-b border-border px-4 py-3 text-left text-foreground">
        <ModelTypeBadge type={alias.type} />
      </td>
      <td className="border-b border-border px-4 py-3 text-left text-foreground">
        {alias.aliases && alias.aliases.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {alias.aliases.map((a) => (
              <Pill key={a} size="sm" tone="neutral">
                <span className="font-mono">{a}</span>
              </Pill>
            ))}
          </div>
        ) : (
          <span className="text-xs text-foreground-subtle">—</span>
        )}
      </td>
      <td className="border-b border-border px-4 py-3 text-left text-foreground">
        <span className="text-[11px] capitalize text-foreground-muted">
          {alias.selector || 'random'} / {alias.priority || 'selector'}
        </span>
      </td>
      <td className="border-b border-border px-4 py-3 text-left text-foreground">
        {alias.metadata ? (
          <Pill size="sm" tone="accent" className="capitalize">
            {alias.metadata.source}
          </Pill>
        ) : (
          <span className="text-xs text-foreground-subtle">—</span>
        )}
      </td>
      <td className="border-b border-border px-4 py-3 text-left text-foreground">
        <div className="flex flex-col gap-1.5">
          {alias.targets.map((t, i) => {
            const provider = providers.find((p) => p.id === t.provider);
            const isProviderDisabled = provider?.enabled === false;
            const isTargetDisabled = t.enabled === false;
            const isDisabled = isProviderDisabled || isTargetDisabled;
            const testKey = `${alias.id}-${i}`;
            const testState = testStates[testKey];

            const cooldown = cooldowns.find(
              (c) => c.provider === t.provider && c.model === t.model && !c.accountId
            );
            const isCoolingDown = !!cooldown;
            const cooldownMinutes = cooldown ? Math.ceil(cooldown.timeRemainingMs / 60000) : 0;

            return (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2 text-xs transition-opacity',
                  isDisabled ? 'text-danger line-through opacity-70' : 'text-foreground-muted'
                )}
              >
                {isCoolingDown && (
                  <div
                    className="flex items-center gap-1 text-[11px] font-medium text-warning"
                    title={`On cooldown for ${cooldownMinutes}m`}
                  >
                    <Clock className="size-3" strokeWidth={1.75} />
                    <span>{cooldownMinutes}m</span>
                  </div>
                )}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isDisabled) {
                      let testApiTypes: string[] = ['chat'];
                      if (alias.type === 'embeddings') testApiTypes = ['embeddings'];
                      else if (alias.type === 'image') testApiTypes = ['images'];
                      else if (alias.type === 'responses') testApiTypes = ['responses'];
                      onTestTarget(alias.id, i, t.provider, t.model, testApiTypes);
                    }
                  }}
                  className={cn(
                    'mr-4 flex cursor-pointer items-center transition-opacity',
                    isDisabled && 'cursor-not-allowed opacity-50'
                  )}
                >
                  {testState?.loading ? (
                    <Loader2
                      className="size-3.5 animate-spin text-foreground-muted"
                      strokeWidth={1.75}
                    />
                  ) : testState?.showResult && testState.result === 'success' ? (
                    <CheckCircle className="size-3.5 text-success" strokeWidth={1.75} />
                  ) : testState?.showResult && testState.result === 'error' ? (
                    <XCircle className="size-3.5 text-danger" strokeWidth={1.75} />
                  ) : (
                    <Play
                      className={cn(
                        'size-3.5 text-accent',
                        isDisabled ? 'invisible' : 'opacity-60'
                      )}
                      strokeWidth={1.75}
                    />
                  )}
                </div>
                <Switch
                  checked={t.enabled !== false}
                  onCheckedChange={(val) => onToggleTarget(alias, i, val)}
                  disabled={isProviderDisabled}
                  className="scale-75"
                />
                <div className="flex-1 truncate font-mono">
                  {t.provider} → {t.model}
                  {testState?.showResult && testState.message && (
                    <span
                      className={cn(
                        'ml-2 text-[11px] italic',
                        testState.result === 'success' ? 'text-success' : 'text-danger'
                      )}
                    >
                      {testState.message}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </td>
      <td
        className="border-b border-border px-4 py-3 text-foreground"
        style={{ paddingRight: '24px', textAlign: 'right' }}
      >
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(alias);
            }}
            className="rounded p-1 text-foreground-muted opacity-60 transition-all hover:bg-surface-elevated hover:text-foreground hover:opacity-100"
            aria-label="Edit alias"
          >
            <Edit2 className="size-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(alias);
            }}
            className="rounded p-1 text-foreground-muted opacity-60 transition-all hover:bg-danger-subtle hover:text-danger hover:opacity-100"
            aria-label="Delete alias"
          >
            <Trash2 className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </td>
    </tr>
  );
};
