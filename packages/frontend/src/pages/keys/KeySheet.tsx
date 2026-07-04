/**
 * KeySheet — react-hook-form + zod sheet for creating / editing API keys.
 *
 * Replaces the inline Key Modal in Keys.tsx.
 * Uses the canonical UserQuotaSheet pattern (Phase 4):
 *   - zodResolver wires keyFormSchema to react-hook-form.
 *   - Controller for TagSelect (non-native inputs).
 *   - Calls api.saveKey() directly (no mutation hook yet) + queryClient.invalidateQueries.
 */
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RefreshCw } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { TagSelect } from '../../components/ui/TagSelect';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { KEYS_KEY } from '../../hooks/queries/useKeys';
import { generateUUID } from '../../lib/clipboard';
import { keyFormSchema, toKeyConfig, KEY_FORM_DEFAULTS, type KeyFormValues } from './key-schema';
import type { KeyConfig, UserQuota } from '../../lib/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null for create, non-null for edit (the existing key name) */
  editingKeyName: string | null;
  initial: KeyConfig | null;
  providerIds: string[];
  aliasIds: string[];
  quotas: Record<string, UserQuota>;
}

export const KeySheet: React.FC<Props> = ({
  open,
  onOpenChange,
  editingKeyName,
  initial,
  providerIds,
  aliasIds,
  quotas,
}) => {
  const isEditing = !!editingKeyName;
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = React.useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<KeyFormValues>({
    resolver: zodResolver(keyFormSchema),
    defaultValues: KEY_FORM_DEFAULTS,
  });

  // Re-initialise form values whenever the sheet opens or the record changes.
  React.useEffect(() => {
    if (!open) return;
    if (isEditing && initial) {
      reset({
        key: initial.key,
        secret: initial.secret,
        comment: initial.comment ?? '',
        quotas: initial.quotas ?? [],
        allowedModels: initial.allowedModels ?? [],
        allowedProviders: initial.allowedProviders ?? [],
        excludedModels: initial.excludedModels ?? [],
        excludedProviders: initial.excludedProviders ?? [],
        allowedIps: initial.allowedIps ?? [],
      });
    } else {
      reset({
        ...KEY_FORM_DEFAULTS,
        allowedIps: ['0.0.0.0/0', '::/0'],
      });
    }
  }, [open, editingKeyName, initial, isEditing, reset]);

  const generateKey = () => {
    const uuid = generateUUID();
    setValue('secret', `sk-${uuid}`);
  };

  const onSubmit = async (values: KeyFormValues) => {
    const keyConfig = toKeyConfig(values);
    setIsSaving(true);
    try {
      await api.saveKey(keyConfig, editingKeyName || undefined);
      await queryClient.invalidateQueries({ queryKey: KEYS_KEY });
      onOpenChange(false);
    } catch (e) {
      console.error('Failed to save key', e);
      toast.error(e instanceof Error ? e.message : 'Failed to save key');
    } finally {
      setIsSaving(false);
    }
  };

  const footer = (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => onOpenChange(false)}
        disabled={isSaving}
      >
        Cancel
      </Button>
      <Button type="submit" form="key-sheet-form" isLoading={isSaving}>
        {isEditing ? 'Save changes' : 'Create key'}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={isEditing ? `Edit ${editingKeyName}` : 'Add Key'}
      size="md"
      footer={footer}
    >
      <form id="key-sheet-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {/* Key Name */}
        <div className="flex flex-col gap-1.5">
          <Input
            {...register('key')}
            label="Key Name (ID)"
            placeholder="e.g. production-app-1"
            disabled={isEditing}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            error={errors.key?.message}
            hint={
              isEditing
                ? 'Key ID cannot be changed once created.'
                : 'A unique identifier for this key.'
            }
          />
        </div>

        {/* Secret */}
        <div className="flex flex-col gap-2">
          <label className="font-sans text-[13px] font-medium text-foreground-muted">
            Secret Key
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1">
              <Input
                {...register('secret')}
                placeholder="sk-..."
                type="password"
                error={errors.secret?.message}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={generateKey}
              title="Generate new key"
              className="w-full sm:w-auto"
            >
              <RefreshCw size={16} />
            </Button>
          </div>
          <p className="text-xs text-foreground-muted">
            The secret used to authenticate. Click refresh to generate a secure random key.
          </p>
        </div>

        {/* Comment */}
        <Input
          {...register('comment')}
          label="Comment"
          placeholder="Optional description..."
          error={errors.comment?.message}
        />

        {/* Excluded Model Aliases */}
        <Controller
          control={control}
          name="excludedModels"
          render={({ field }) => (
            <TagSelect
              label="Excluded Model Aliases"
              placeholder="Optional: select model aliases to exclude..."
              options={aliasIds}
              selected={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <p className="text-xs text-foreground-muted -mt-2">
          Optional denylist. If set, this key cannot use these model aliases.
        </p>

        {/* Allowed Model Aliases */}
        <Controller
          control={control}
          name="allowedModels"
          render={({ field }) => (
            <TagSelect
              label="Allowed Model Aliases"
              placeholder="Optional: select model aliases..."
              options={aliasIds}
              selected={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <p className="text-xs text-foreground-muted -mt-2">
          Optional allowlist. If set, this key can only use these configured model aliases.
        </p>

        {/* Excluded Providers */}
        <Controller
          control={control}
          name="excludedProviders"
          render={({ field }) => (
            <TagSelect
              label="Excluded Providers"
              placeholder="Optional: select providers to exclude..."
              options={providerIds}
              selected={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <p className="text-xs text-foreground-muted -mt-2">
          Optional denylist. If set, routing will not use these provider IDs.
        </p>

        {/* Allowed Providers */}
        <Controller
          control={control}
          name="allowedProviders"
          render={({ field }) => (
            <TagSelect
              label="Allowed Providers"
              placeholder="Optional: select providers..."
              options={providerIds}
              selected={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <p className="text-xs text-foreground-muted -mt-2">
          Optional allowlist. If set, routing is limited to these provider IDs.
        </p>

        {/* Allowed IPs */}
        <Controller
          control={control}
          name="allowedIps"
          render={({ field }) => (
            <TagSelect
              label="Allowed IPs"
              placeholder="e.g. 192.168.1.10  10.0.0.0/8  10.1.0.10-20"
              options={[]}
              selected={field.value}
              allowCustom
              splitOnSpace
              onChange={field.onChange}
            />
          )}
        />
        <p className="text-xs text-foreground-muted -mt-2">
          Optional allowlist. Type entries separated by spaces. Empty means allow all;{' '}
          <code>0.0.0.0/0</code> is all IPv4 and <code>::/0</code> all IPv6. Accepts IPv4/IPv6, CIDR
          (e.g. <code>10.0.0.0/8</code>), and ranges (e.g. <code>10.1.0.10-20</code>).
        </p>

        {/* Quota Assignment */}
        <Controller
          control={control}
          name="quotas"
          render={({ field }) => (
            <TagSelect
              label="Quota Assignment"
              placeholder="No quotas — falls back to default quotas, if any..."
              options={Object.keys(quotas).sort()}
              selected={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <p className="text-xs text-foreground-muted -mt-2">
          Optional: assign one or more quotas to this key (usage against each is tracked
          independently). When left empty, this key falls back to the system&apos;s default quotas,
          if any are configured.
        </p>
      </form>
    </Modal>
  );
};
