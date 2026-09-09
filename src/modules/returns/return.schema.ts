import { z } from 'zod';

const reasonValues = ['damaged', 'wrong_item', 'not_as_described', 'other'] as const;
const returnStatusValues = [
  'requested',
  'approved',
  'rejected',
  'item_received',
  'completed',
] as const;

/** docs/Product_Spec_Requirements.md §8.1: "reason (dropdown: damaged, wrong item, not as described, other + note)". */
export const requestReturnSchema = z.object({
  reason: z.enum(reasonValues),
  note: z.string().trim().max(1000).optional(),
});
export type RequestReturnInput = z.infer<typeof requestReturnSchema>;

export const returnActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().trim().max(1000).optional(),
});
export type ReturnActionInput = z.infer<typeof returnActionSchema>;

export const returnNoteSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
export type ReturnNoteInput = z.infer<typeof returnNoteSchema>;

export const listReturnsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(returnStatusValues).optional(),
});
export type ListReturnsQuery = z.infer<typeof listReturnsQuerySchema>;
