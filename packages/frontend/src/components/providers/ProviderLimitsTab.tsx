import { useState } from 'react';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { DebouncedInput } from '../ui/DebouncedInput';
import { SectionCard } from '../ui/SectionCard';
import { ToggleRow } from './ToggleRow';
import { NotConfigured } from './KVSection';
import { ProviderQuotaEditor } from './ProviderQuotaEditor';
import type { ProviderFormApi } from '../../hooks/useProviderForm';

export function ProviderLimitsTab({ f }: { f: ProviderFormApi }) {
  const [isStallOpen, setIsStallOpen] = useState(false);
  const { editingProvider, setEditingProvider } = f;

  const hasCustomStallOverride =
    editingProvider.stallTtfbBytes != null ||
    editingProvider.stallMinBps != null ||
    editingProvider.stallWindowMs != null ||
    editingProvider.stallGracePeriodMs != null;

  return (
    <div className="flex flex-col gap-3">
      <ProviderQuotaEditor
        editingProvider={f.editingProvider}
        setEditingProvider={f.setEditingProvider}
        selectedQuotaCheckerType={f.selectedQuotaCheckerType}
        selectableQuotaCheckerTypes={f.selectableQuotaCheckerTypes}
        isOAuthMode={f.isOAuthMode}
        oauthCheckerType={f.oauthCheckerType}
        quotaValidationError={f.quotaValidationError}
      />

      <SectionCard title="Timeouts & concurrency">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <Input
            label="Timeout"
            hint="1–3600s"
            type="number"
            step="1"
            min="1"
            max="3600"
            placeholder="Global default"
            value={
              editingProvider.timeoutMs != null ? Math.round(editingProvider.timeoutMs / 1000) : ''
            }
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                setEditingProvider({ ...editingProvider, timeoutMs: undefined });
              } else {
                const seconds = Number(raw);
                if (Number.isFinite(seconds) && seconds >= 1 && seconds <= 3600) {
                  setEditingProvider({ ...editingProvider, timeoutMs: seconds * 1000 });
                }
              }
            }}
          />
          <DebouncedInput
            label="TTFB Timeout (s)"
            hint="5–120"
            type="number"
            placeholder="Global default"
            value={
              editingProvider.stallTtfbMs != null
                ? String(Math.round(editingProvider.stallTtfbMs / 1000))
                : ''
            }
            onChange={(val: string) => {
              const num = Number(val);
              if (val === '') {
                setEditingProvider({ ...editingProvider, stallTtfbMs: undefined });
              } else if (Number.isFinite(num) && num >= 5 && num <= 120) {
                setEditingProvider({ ...editingProvider, stallTtfbMs: num * 1000 });
              }
            }}
          />
          <Input
            label="Max Concurrency"
            hint="across all models"
            type="number"
            step="1"
            min="1"
            placeholder="No limit"
            value={editingProvider.maxConcurrency != null ? editingProvider.maxConcurrency : ''}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                setEditingProvider({ ...editingProvider, maxConcurrency: undefined });
              } else {
                const val = Number(raw);
                if (Number.isFinite(val) && val >= 1) {
                  setEditingProvider({ ...editingProvider, maxConcurrency: val });
                }
              }
            }}
          />
        </div>
      </SectionCard>

      <SectionCard title="Cooldowns">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col divide-y divide-border">
            <ToggleRow
              label="Disable Cooldowns"
              description="Provider will never be placed on cooldown."
              warning="Use only for providers with reliable external rate-limit handling."
              checked={editingProvider.disableCooldown || false}
              onChange={(checked) =>
                setEditingProvider({ ...editingProvider, disableCooldown: checked })
              }
            />
            <ToggleRow
              label="Cooldown on Stall"
              description="Stall detection cancellations also trigger cooldown for this provider."
              checked={editingProvider.stallCooldown || false}
              onChange={(checked) =>
                setEditingProvider({ ...editingProvider, stallCooldown: checked })
              }
            />
          </div>

          <SectionCard
            size="sm"
            title="Stall Detection Overrides"
            collapsible
            open={isStallOpen}
            onOpenChange={setIsStallOpen}
            extra={
              hasCustomStallOverride ? (
                <Badge status="neutral" noDot>
                  Custom
                </Badge>
              ) : (
                <NotConfigured />
              )
            }
          >
            <div className="flex flex-col gap-2">
              <div className="font-sans text-[11px] leading-snug text-foreground-muted">
                Override the global stall detection settings for this provider. Leave empty to use
                the global setting for each field.
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <DebouncedInput
                  label="TTFB Byte Threshold"
                  hint="50–10k"
                  type="number"
                  placeholder="Global default"
                  value={
                    editingProvider.stallTtfbBytes != null
                      ? String(editingProvider.stallTtfbBytes)
                      : ''
                  }
                  onChange={(val: string) => {
                    const num = Number(val);
                    if (val === '') {
                      setEditingProvider({ ...editingProvider, stallTtfbBytes: undefined });
                    } else if (Number.isFinite(num) && num >= 50 && num <= 10000) {
                      setEditingProvider({ ...editingProvider, stallTtfbBytes: num });
                    }
                  }}
                />
                <DebouncedInput
                  label="Min Bytes/Sec"
                  hint="50–5k"
                  type="number"
                  placeholder="Global default"
                  value={
                    editingProvider.stallMinBps != null ? String(editingProvider.stallMinBps) : ''
                  }
                  onChange={(val: string) => {
                    const num = Number(val);
                    if (val === '') {
                      setEditingProvider({ ...editingProvider, stallMinBps: undefined });
                    } else if (Number.isFinite(num) && num >= 50 && num <= 5000) {
                      setEditingProvider({ ...editingProvider, stallMinBps: num });
                    }
                  }}
                />
                <DebouncedInput
                  label="Stall Window (s)"
                  hint="3–30"
                  type="number"
                  placeholder="Global default"
                  value={
                    editingProvider.stallWindowMs != null
                      ? String(Math.round(editingProvider.stallWindowMs / 1000))
                      : ''
                  }
                  onChange={(val: string) => {
                    const num = Number(val);
                    if (val === '') {
                      setEditingProvider({ ...editingProvider, stallWindowMs: undefined });
                    } else if (Number.isFinite(num) && num >= 3 && num <= 30) {
                      setEditingProvider({ ...editingProvider, stallWindowMs: num * 1000 });
                    }
                  }}
                />
                <DebouncedInput
                  label="Grace Period (s)"
                  hint="0–120"
                  type="number"
                  placeholder="Global default"
                  value={
                    editingProvider.stallGracePeriodMs != null
                      ? String(Math.round(editingProvider.stallGracePeriodMs / 1000))
                      : ''
                  }
                  onChange={(val: string) => {
                    const num = Number(val);
                    if (val === '') {
                      setEditingProvider({
                        ...editingProvider,
                        stallGracePeriodMs: undefined,
                      });
                    } else if (Number.isFinite(num) && num >= 0 && num <= 120) {
                      setEditingProvider({
                        ...editingProvider,
                        stallGracePeriodMs: num * 1000,
                      });
                    }
                  }}
                />
              </div>
            </div>
          </SectionCard>
        </div>
      </SectionCard>
    </div>
  );
}
