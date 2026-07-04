/**
 * UserQuotaSheet — react-hook-form + zod form in the shared <Modal size="md"> sheet.
 *
 * Canonical form pattern for Phase 4 (reference for Phases 5–7):
 *   - zodResolver wires the zod schema to react-hook-form.
 *   - Controller-style field wrappers for native Select (no Radix/shadcn).
 *   - Create + Edit modes driven by `editingName` prop.
 *   - Calls useSaveUserQuota(); success/errors surfaced via useToast().
 */
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Switch } from '../../components/ui/Switch';
import { TagSelect } from '../../components/ui/TagSelect';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../contexts/ToastContext';
import { useSaveUserQuota } from '../../hooks/queries/useUserQuotas';
import {
  userQuotaFormSchema,
  toUserQuotaPayload,
  type UserQuotaFormValues,
} from './user-quota-schema';
import type { UserQuota } from '../../lib/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingName: string | null;
  initial: UserQuota | null;
  /** Enabled provider IDs — options for the scope allow/exclude TagSelects. */
  providerIds: string[];
  /** Union of every model name exposed by any provider — options for the
   * scope model TagSelects (allowCustom covers models not yet synced into a
   * provider's catalog). */
  allModelNames: string[];
}

const defaults: UserQuotaFormValues = {
  name: '',
  type: 'rolling',
  limitType: 'requests',
  limit: 1000,
  duration: '1h',
  shared: false,
  warnAtPercent: '',
  allowedProviders: [],
  excludedProviders: [],
  allowedModels: [],
  excludedModels: [],
};

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'rolling', label: 'Rolling' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const LIMIT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'requests', label: 'Requests' },
  { value: 'tokens', label: 'Tokens' },
  { value: 'cost', label: 'Cost (USD)' },
];

export const UserQuotaSheet: React.FC<Props> = ({
  open,
  onOpenChange,
  editingName,
  initial,
  providerIds,
  allModelNames,
}) => {
  const isEditing = !!editingName;
  const save = useSaveUserQuota();
  const { success: toastSuccess } = useToast();

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<UserQuotaFormValues, unknown, UserQuotaFormValues>({
    resolver: zodResolver(userQuotaFormSchema),
    defaultValues: defaults,
  });

  // Re-initialise form values whenever the sheet opens or the record changes.
  React.useEffect(() => {
    if (!open) return;
    if (isEditing && initial) {
      reset({
        name: editingName ?? '',
        type: initial.type,
        limitType: initial.limitType,
        limit: initial.limit,
        duration: initial.duration ?? '',
        // Pass through verbatim (can be `undefined` for a legacy definition
        // that never carried a `shared` field) — see toUserQuotaPayload.
        shared: initial.shared,
        warnAtPercent: initial.warnAt !== undefined ? String(Math.round(initial.warnAt * 100)) : '',
        allowedProviders: initial.allowedProviders ?? [],
        excludedProviders: initial.excludedProviders ?? [],
        allowedModels: initial.allowedModels ?? [],
        excludedModels: initial.excludedModels ?? [],
      });
    } else {
      reset(defaults);
    }
  }, [open, editingName, initial, isEditing, reset]);

  const watchType = watch('type');

  const onSubmit = (values: UserQuotaFormValues) => {
    const quota = toUserQuotaPayload(values);
    // Use mutate (not mutateAsync) — onError in the hook handles error UX.
    save.mutate(
      { name: values.name, quota, oldName: isEditing ? editingName! : undefined },
      {
        onSuccess: () => {
          toastSuccess(isEditing ? 'Quota updated' : 'Quota created');
          onOpenChange(false);
        },
      }
    );
  };

  const footer = (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => onOpenChange(false)}
        disabled={save.isPending}
      >
        Cancel
      </Button>
      <Button type="submit" form="user-quota-form" isLoading={save.isPending}>
        {isEditing ? 'Save changes' : 'Create quota'}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={isEditing ? `Edit ${editingName}` : 'New User Quota'}
      size="md"
      footer={footer}
    >
      {/* Description */}
      <p className="mb-5 text-sm text-foreground-muted">
        User quotas attach to API keys via the Keys page and rate-limit usage by request count,
        token count, or cost.
      </p>

      <form id="user-quota-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {/* Name */}
        <Input
          {...register('name')}
          label="Name"
          placeholder="standard-quota"
          disabled={isEditing}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          error={errors.name?.message}
          hint={
            isEditing
              ? 'Name cannot be changed after creation.'
              : 'Identifier referenced from API keys. Cannot be changed after creation.'
          }
        />

        {/* Type + Limit type (side by side at sm+) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select
                label="Type"
                value={field.value}
                onChange={field.onChange}
                options={TYPE_OPTIONS}
                error={errors.type?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="limitType"
            render={({ field }) => (
              <Select
                label="Limit type"
                value={field.value}
                onChange={field.onChange}
                options={LIMIT_TYPE_OPTIONS}
                error={errors.limitType?.message}
              />
            )}
          />
        </div>

        {/* Limit */}
        <Input
          {...register('limit', { valueAsNumber: true })}
          type="number"
          min={1}
          label="Limit"
          error={errors.limit?.message}
        />

        {/* Duration — only for rolling */}
        {watchType === 'rolling' && (
          <Input
            {...register('duration')}
            label="Duration"
            placeholder="1h, 24h, 7d, 30d…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            error={errors.duration?.message}
            hint="Rolling-window length. Combine a number with one of s / m / h / d / w (e.g. 24h)."
          />
        )}

        {/* Shared bucket toggle */}
        <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-surface-elevated p-3">
          <div className="min-w-0 flex-1">
            <div className="font-sans text-[13px] font-medium text-foreground">Shared bucket</div>
            <p className="mt-1 text-xs text-foreground-muted">
              Pool usage across every key that references this quota into a single counter, instead
              of tracking each key independently.
            </p>
          </div>
          <Controller
            control={control}
            name="shared"
            render={({ field }) => (
              <Switch
                checked={!!field.value}
                onChange={field.onChange}
                aria-label="Toggle shared quota bucket"
              />
            )}
          />
        </div>

        {/* Warn threshold */}
        <Input
          {...register('warnAtPercent')}
          type="number"
          min={1}
          max={99}
          label="Warn threshold (optional)"
          placeholder="e.g. 80"
          error={errors.warnAtPercent?.message}
          hint="Percent of the limit at which to flag usage as approaching exhaustion. Leave empty to disable early-warning."
        />

        {/* Scope */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border">
          <p className="text-xs font-medium text-foreground-muted">
            Scope (optional — unscoped applies to every provider/model)
          </p>
        </div>

        <Controller
          control={control}
          name="allowedProviders"
          render={({ field }) => (
            <TagSelect
              label="Allowed Providers"
              placeholder="Optional: restrict to these providers..."
              options={providerIds}
              selected={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="excludedProviders"
          render={({ field }) => (
            <TagSelect
              label="Excluded Providers"
              placeholder="Optional: exclude these providers..."
              options={providerIds}
              selected={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="allowedModels"
          render={({ field }) => (
            <TagSelect
              label="Allowed Models"
              placeholder="Optional: restrict to these models..."
              options={allModelNames}
              selected={field.value}
              allowCustom
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="excludedModels"
          render={({ field }) => (
            <TagSelect
              label="Excluded Models"
              placeholder="Optional: exclude these models..."
              options={allModelNames}
              selected={field.value}
              allowCustom
              onChange={field.onChange}
            />
          )}
        />
        <p className="text-xs text-foreground-muted -mt-2">
          Only requests matching the allowed/not-excluded provider and model count against this
          quota. Model names accept free-typing since not every model is synced into a
          provider&apos;s catalog yet.
        </p>
      </form>
    </Modal>
  );
};
