import { z } from 'zod';

export const headerEntrySchema = z.object({
  key: z.string().trim().min(1, 'Required'),
  value: z.string().trim().min(1, 'Required'),
});

export const mcpServerFormSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9][a-z0-9\-_]{1,62}$/,
      'Lowercase letters, digits, hyphens, underscores; 2–63 chars; must start with letter or digit.'
    ),
  upstreamUrl: z.string().trim().url('Must be a valid URL'),
  enabled: z.boolean(),
  headers: z.array(headerEntrySchema),
});

export type McpServerFormValues = z.infer<typeof mcpServerFormSchema>;

export const headersToEntries = (
  headers: Record<string, string> | undefined
): { key: string; value: string }[] =>
  Object.entries(headers ?? {}).map(([key, value]) => ({ key, value }));

export const entriesToHeaders = (
  entries: { key: string; value: string }[]
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const { key, value } of entries) {
    if (key.trim() && value.trim()) {
      out[key.trim()] = value.trim();
    }
  }
  return out;
};
