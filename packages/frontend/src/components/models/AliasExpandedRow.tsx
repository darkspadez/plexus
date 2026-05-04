// packages/frontend/src/components/models/AliasExpandedRow.tsx
import React from 'react';
import { Alias, Cooldown, Model, Provider } from '../../lib/api';
import { MappingsList } from './MappingsList';
import { RoutingAliasesEditor } from './RoutingAliasesEditor';

interface TestState {
  loading: boolean;
  result?: 'success' | 'error';
  message?: string;
  showResult: boolean;
}

interface AliasExpandedRowProps {
  alias: Alias;
  providers: Provider[];
  availableModels: Model[];
  cooldowns: Cooldown[];
  testStates: Record<string, TestState>;
  columnCount: number;
  onUpdateAlias: (next: Alias) => void;
  onTestTarget: (
    aliasId: string,
    index: number,
    provider: string,
    model: string,
    apiTypes: string[]
  ) => void;
}

export const AliasExpandedRow: React.FC<AliasExpandedRowProps> = ({
  alias,
  providers,
  availableModels,
  cooldowns,
  testStates,
  columnCount,
  onUpdateAlias,
  onTestTarget,
}) => {
  const aliasTestApiTypes = (() => {
    if (alias.type === 'embeddings') return ['embeddings'];
    if (alias.type === 'image') return ['images'];
    if (alias.type === 'responses') return ['responses'];
    return ['chat'];
  })();

  return (
    <tr className="bg-surface-subtle">
      <td colSpan={columnCount} className="border-b border-border px-6 py-4">
        <div className="flex flex-col gap-4">
          <RoutingAliasesEditor
            aliases={alias.aliases ?? []}
            onChange={(next) => onUpdateAlias({ ...alias, aliases: next })}
          />
          <MappingsList
            aliasId={alias.id}
            targets={alias.targets}
            providers={providers}
            availableModels={availableModels}
            cooldowns={cooldowns}
            testStates={testStates}
            onChange={(next) => onUpdateAlias({ ...alias, targets: next })}
            onTest={(index, provider, model) =>
              onTestTarget(alias.id, index, provider, model, aliasTestApiTypes)
            }
          />
        </div>
      </td>
    </tr>
  );
};
