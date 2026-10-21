import { z } from 'zod';

export const remarkCategories = {
  POSITIVE: 'Positive', NEEDS_IMPROVEMENT: 'Needs Improvement', GENERAL: 'General',
} as const;
export const remarkSchema = z.object({
  title: z.string().trim().min(1, 'Enter a remark title.').max(160),
  category: z.enum(['POSITIVE', 'NEEDS_IMPROVEMENT', 'GENERAL']),
  description: z.string().trim().min(1, 'Enter a description.').max(3000),
}).strict();
export type RemarkInput = z.infer<typeof remarkSchema>;
