import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../components/ui-v2/sheet';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../components/ui-v2/form';
import { Input } from '../../components/ui-v2/input';
import { Button } from '../../components/ui-v2/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui-v2/select';
import { userQuotaFormSchema, type UserQuotaFormValues } from './user-quota-schema';
import { useSaveUserQuota } from '../../hooks/queries/useUserQuotas';
import type { UserQuota } from '../../lib/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingName?: string | null;
  initial?: UserQuota | null;
}

const defaults: UserQuotaFormValues = {
  name: '',
  type: 'rolling',
  limitType: 'requests',
  limit: 1000,
  duration: '1h',
};

export const UserQuotaSheet: React.FC<Props> = ({ open, onOpenChange, editingName, initial }) => {
  const isEditing = !!editingName;
  const save = useSaveUserQuota();

  const form = useForm({
    resolver: zodResolver(userQuotaFormSchema),
    defaultValues: defaults,
  });

  React.useEffect(() => {
    if (!open) return;
    if (isEditing && initial) {
      form.reset({
        name: editingName ?? '',
        type: initial.type,
        limitType: initial.limitType,
        limit: initial.limit,
        duration: initial.duration ?? '',
      });
    } else {
      form.reset(defaults);
    }
  }, [open, editingName, initial, isEditing, form]);

  const watchType = form.watch('type');

  const onSubmit = async (values: UserQuotaFormValues) => {
    if (values.type === 'rolling' && !values.duration) {
      form.setError('duration', {
        message: 'Rolling quotas require a duration (e.g. 1h, 24h, 7d).',
      });
      return;
    }
    const quota: UserQuota = {
      type: values.type,
      limitType: values.limitType,
      limit: values.limit,
      ...(values.type === 'rolling' && values.duration ? { duration: values.duration } : {}),
    };
    try {
      await save.mutateAsync({
        name: values.name,
        quota,
        oldName: isEditing ? editingName! : undefined,
      });
      toast.success(isEditing ? 'Quota updated' : 'Quota created');
      onOpenChange(false);
    } catch (e) {
      toast.error(`Failed to save: ${(e as Error).message}`);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle>{isEditing ? `Edit ${editingName}` : 'New user quota'}</SheetTitle>
          <SheetDescription>
            User quotas attach to API keys via the Keys page and rate-limit their usage by request
            count, token count, or cost.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 space-y-5 overflow-auto px-6 py-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="standard-quota"
                        disabled={isEditing}
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    </FormControl>
                    <FormDescription>
                      Identifier referenced from API keys. Cannot be changed after creation.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="rolling">Rolling</SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="limitType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Limit type *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="requests">Requests</SelectItem>
                          <SelectItem value="tokens">Tokens</SelectItem>
                          <SelectItem value="cost">Cost (USD)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="limit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Limit *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchType === 'rolling' && (
                <FormField
                  control={form.control}
                  name="duration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="1h, 24h, 7d, 30d…"
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                      </FormControl>
                      <FormDescription>
                        Rolling-window length. Combine a number with one of <code>s</code> /{' '}
                        <code>m</code> / <code>h</code> / <code>d</code> / <code>w</code> (e.g.
                        24h).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface px-6 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={save.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Create quota'}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
};
