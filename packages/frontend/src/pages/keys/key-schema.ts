import { z } from 'zod';

export const keyFormSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Required')
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9_\-]{0,62}$/,
      'Letters, digits, hyphens, underscores; up to 63 chars; must start with a letter or digit.'
    ),
  secret: z
    .string()
    .trim()
    .min(8, 'At least 8 characters')
    .regex(/^[\w\-]+$/, 'Only alphanumerics, hyphens, and underscores'),
  comment: z.string().trim().optional().or(z.literal('')),
  quota: z.string().trim().optional().or(z.literal('')),
  allowedProviders: z.array(z.string()),
  allowedModels: z.array(z.string()),
  excludedProviders: z.array(z.string()),
  excludedModels: z.array(z.string()),
});

export type KeyFormValues = z.infer<typeof keyFormSchema>;
