import { Input } from '../ui/Input';
import { SectionCard } from '../ui/SectionCard';
import { ProviderApiUrlsEditor } from './ProviderApiUrlsEditor';
import { ProviderOAuthEditor } from './ProviderOAuthEditor';
import type { ProviderFormApi } from '../../hooks/useProviderForm';

export function ProviderConnectionTab({ f }: { f: ProviderFormApi }) {
  return (
    <div className="flex flex-col gap-3">
      <SectionCard title="Provider details">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            onChange={(e) => f.setEditingProvider({ ...f.editingProvider, name: e.target.value })}
            placeholder="e.g. OpenAI Production"
          />
        </div>
      </SectionCard>

      <ProviderApiUrlsEditor
        isOAuthMode={f.isOAuthMode}
        getPrimaryEntry={f.getPrimaryEntry}
        setPrimaryEntry={f.setPrimaryEntry}
        editingProvider={f.editingProvider}
        setEditingProvider={f.setEditingProvider}
        OAUTH_PROVIDERS={f.OAUTH_PROVIDERS}
        isApiBaseUrlsOpen={f.isApiBaseUrlsOpen}
        setIsApiBaseUrlsOpen={f.setIsApiBaseUrlsOpen}
        getApiBaseUrlMap={f.getApiBaseUrlMap}
        addAdditionalBaseUrlEntry={f.addAdditionalBaseUrlEntry}
        updateApiBaseUrlEntry={f.updateApiBaseUrlEntry}
        removeApiBaseUrlEntry={f.removeApiBaseUrlEntry}
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
    </div>
  );
}
