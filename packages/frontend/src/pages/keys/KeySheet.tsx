import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sparkles } from 'lucide-react';
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
import { keyFormSchema, type KeyFormValues } from './key-schema';
import { MultiSelectChips } from './MultiSelectChips';
import { SecretDisplay } from './SecretDisplay';
import {
  useSaveKey,
  useUserQuotas,
  useProviderIds,
  useAliasIds,
} from '../../hooks/queries/useKeys';
import type { KeyConfig } from '../../lib/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, this is an edit. */
  editing?: KeyConfig | null;
}

const generateSecret = (): string => {
  const uuid = (() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  })();
  return `sk-${uuid}`;
};

const valuesFromKey = (k: KeyConfig | null): KeyFormValues => ({
  key: k?.key ?? '',
  secret: k?.secret ?? generateSecret(),
  comment: k?.comment ?? '',
  quota: k?.quota ?? '',
  allowedProviders: k?.allowedProviders ?? [],
  allowedModels: k?.allowedModels ?? [],
  excludedProviders: k?.excludedProviders ?? [],
  excludedModels: k?.excludedModels ?? [],
});

export const KeySheet: React.FC<Props> = ({ open, onOpenChange, editing }) => {
  const isEditing = !!editing;
  const save = useSaveKey();
  const { data: quotas } = useUserQuotas();
  const { data: providerIds = [] } = useProviderIds();
  const { data: aliasIds = [] } = useAliasIds();

  const [revealedSecret, setRevealedSecret] = React.useState<string | null>(null);

  const form = useForm<KeyFormValues>({
    resolver: zodResolver(keyFormSchema),
    defaultValues: valuesFromKey(editing ?? null),
  });

  React.useEffect(() => {
    if (!open) return;
    setRevealedSecret(null);
    form.reset(valuesFromKey(editing ?? null));
  }, [open, editing, form]);

  const onSubmit = async (values: KeyFormValues) => {
    const payload: KeyConfig = {
      key: values.key,
      secret: values.secret,
      comment: values.comment || undefined,
      quota: values.quota || undefined,
      allowedProviders: values.allowedProviders,
      allowedModels: values.allowedModels,
      excludedProviders: values.excludedProviders,
      excludedModels: values.excludedModels,
    };
    try {
      await save.mutateAsync({
        key: payload,
        oldKey: isEditing ? editing!.key : undefined,
      });
      if (isEditing) {
        toast.success('Key updated');
        onOpenChange(false);
      } else {
        // Reveal the one-time secret instead of immediately closing.
        setRevealedSecret(values.secret);
      }
    } catch (e) {
      toast.error(`Failed to save: ${(e as Error).message}`);
    }
  };

  const quotaOptions = React.useMemo(() => Object.keys(quotas ?? {}).sort(), [quotas]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[600px]">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle>
            {isEditing ? `Edit ${editing!.key}` : revealedSecret ? 'Key created' : 'New API key'}
          </SheetTitle>
          <SheetDescription>
            {revealedSecret
              ? 'Copy the secret now — it will not be shown again.'
              : 'Configure access scope and quota for this key.'}
          </SheetDescription>
        </SheetHeader>

        {revealedSecret ? (
          <div className="flex flex-1 flex-col gap-4 overflow-auto px-6 py-5">
            <SecretDisplay secret={revealedSecret} />
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setRevealedSecret(null);
                  onOpenChange(false);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-1 flex-col overflow-hidden"
            >
              <div className="flex-1 space-y-5 overflow-auto px-6 py-5">
                <FormField
                  control={form.control}
                  name="key"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Key name *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="my-app"
                          disabled={isEditing}
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                      </FormControl>
                      <FormDescription>
                        Identifier shown in logs and dashboards. Cannot be changed after creation.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="secret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Secret *</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            {...field}
                            type="text"
                            placeholder="sk-…"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            className="font-mono"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => field.onChange(generateSecret())}
                          >
                            <Sparkles strokeWidth={1.75} />
                            Generate
                          </Button>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Long random secret. Will be displayed once after creation, never shown in
                        plaintext again.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="comment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comment</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Free-text note (optional)" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="quota"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quota</FormLabel>
                      <Select
                        value={field.value || '__none__'}
                        onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="No quota" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">No quota (unrestricted)</SelectItem>
                          {quotaOptions.map((q) => (
                            <SelectItem key={q} value={q}>
                              {q}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Quotas are managed in the Quotas tab.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="allowedProviders"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Allowed providers</FormLabel>
                      <FormControl>
                        <MultiSelectChips
                          options={providerIds}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Add provider"
                          ariaLabel="Allowed providers"
                        />
                      </FormControl>
                      <FormDescription>Empty = any provider allowed.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="allowedModels"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Allowed models</FormLabel>
                      <FormControl>
                        <MultiSelectChips
                          options={aliasIds}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Add model"
                          ariaLabel="Allowed models"
                        />
                      </FormControl>
                      <FormDescription>Empty = any model alias allowed.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="excludedProviders"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Excluded providers</FormLabel>
                      <FormControl>
                        <MultiSelectChips
                          options={providerIds}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Add provider"
                          ariaLabel="Excluded providers"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="excludedModels"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Excluded models</FormLabel>
                      <FormControl>
                        <MultiSelectChips
                          options={aliasIds}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Add model"
                          ariaLabel="Excluded models"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                  {save.isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Create key'}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </SheetContent>
    </Sheet>
  );
};
