import React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '../../components/ui-v2/form';
import { Input } from '../../components/ui-v2/input';
import { Button } from '../../components/ui-v2/button';
import { Switch } from '../../components/ui-v2/switch';
import { Section } from '../../components/ui-v2/section';
import { Pill } from '../../components/chips/Pill';
import {
  mcpServerFormSchema,
  type McpServerFormValues,
  headersToEntries,
  entriesToHeaders,
} from './server-schema';
import { useSaveMcpServer } from '../../hooks/queries/useMcp';
import type { McpServer } from '../../lib/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, this is an edit. Use the original name to detect rename. */
  editingName?: string | null;
  /** Initial values when editing. */
  initial?: McpServer | null;
}

const emptyDefaults: McpServerFormValues = {
  name: '',
  upstreamUrl: '',
  enabled: true,
  headers: [],
};

export const McpServerSheet: React.FC<Props> = ({ open, onOpenChange, editingName, initial }) => {
  const isEditing = !!editingName;
  const save = useSaveMcpServer();

  const form = useForm<McpServerFormValues>({
    resolver: zodResolver(mcpServerFormSchema),
    defaultValues: emptyDefaults,
  });

  // Reset form when opening for a different record.
  React.useEffect(() => {
    if (!open) return;
    if (isEditing && initial) {
      form.reset({
        name: editingName ?? '',
        upstreamUrl: initial.upstream_url ?? '',
        enabled: initial.enabled,
        headers: headersToEntries(initial.headers),
      });
    } else {
      form.reset(emptyDefaults);
    }
  }, [open, editingName, initial, isEditing, form]);

  const headers = useFieldArray({
    control: form.control,
    name: 'headers',
  });

  const onSubmit = async (values: McpServerFormValues) => {
    const server: McpServer = {
      upstream_url: values.upstreamUrl,
      enabled: values.enabled,
      headers: entriesToHeaders(values.headers),
    };
    try {
      await save.mutateAsync({ name: values.name, server });
      toast.success(isEditing ? 'Server updated' : 'Server created');
      onOpenChange(false);
    } catch (e) {
      toast.error(`Failed to save: ${(e as Error).message}`);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle>{isEditing ? `Edit ${editingName}` : 'New MCP server'}</SheetTitle>
          <SheetDescription>
            Configure the upstream MCP endpoint and any custom headers.
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
                        placeholder="my-mcp"
                        disabled={isEditing}
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    </FormControl>
                    <FormDescription>
                      Lowercase letters, digits, hyphens, underscores. 2–63 chars. Cannot be changed
                      after creation.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="upstreamUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Upstream URL *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="https://mcp.example.com/v1"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-md border border-border bg-surface-elevated px-3 py-2.5">
                    <div className="space-y-0.5">
                      <FormLabel className="m-0">Enabled</FormLabel>
                      <FormDescription className="m-0">
                        Disabled servers are skipped during routing.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <Section
                title="Headers"
                collapsible
                defaultOpen={headers.fields.length > 0}
                rightSlot={
                  <>
                    <Pill tone={headers.fields.length > 0 ? 'accent' : 'neutral'} size="sm">
                      {headers.fields.length}
                    </Pill>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        headers.append({ key: '', value: '' });
                      }}
                    >
                      <Plus strokeWidth={1.75} />
                    </Button>
                  </>
                }
                bodyClassName="space-y-2"
              >
                {headers.fields.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-surface-sunken px-3 py-2 text-xs text-foreground-muted">
                    No custom headers.
                  </p>
                ) : (
                  headers.fields.map((field, idx) => (
                    <div key={field.id} className="flex items-start gap-2">
                      <div className="flex-1">
                        <FormField
                          control={form.control}
                          name={`headers.${idx}.key`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  {...f}
                                  placeholder="Authorization"
                                  aria-label={`Header ${idx + 1} name`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex-1">
                        <FormField
                          control={form.control}
                          name={`headers.${idx}.value`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  {...f}
                                  placeholder="Bearer …"
                                  aria-label={`Header ${idx + 1} value`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-foreground-muted hover:text-danger"
                        aria-label="Remove header"
                        onClick={() => headers.remove(idx)}
                      >
                        <Trash2 strokeWidth={1.75} />
                      </Button>
                    </div>
                  ))
                )}
              </Section>
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
                {save.isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Create server'}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
};
