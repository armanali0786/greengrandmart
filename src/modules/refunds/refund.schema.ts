import { z } from 'zod';

const refundTypeValues = ['full', 'partial', 'item', 'shipping'] as const;
const refundStatusValues = ['pending', 'processing', 'completed', 'failed'] as const;

/** docs/API_Spec.md `POST /admin/refunds`. */
export const initiateRefundSchema = z.object({
  orderId: z.string().uuid(),
  type: z.enum(refundTypeValues),
  amount: z.number().int().positive(),
  reason: z.string().trim().max(1000).optional(),
});
export type InitiateRefundInput = z.infer<typeof initiateRefundSchema>;

export const listRefundsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(refundStatusValues).optional(),
});
export type ListRefundsQuery = z.infer<typeof listRefundsQuerySchema>;
