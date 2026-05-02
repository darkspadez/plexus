import { z } from 'zod';

export const userQuotaFormSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9_\-]{0,62}$/,
      'Letters, digits, hyphens, underscores; up to 63 chars; must start with a letter or digit.'
    ),
  type: z.enum(['rolling', 'daily', 'weekly', 'monthly']),
  limitType: z.enum(['requests', 'tokens', 'cost']),
  limit: z.number().int().min(1, 'Must be at least 1'),
  duration: z.string().trim().default(''),
});

export type UserQuotaFormValues = z.infer<typeof userQuotaFormSchema>;
