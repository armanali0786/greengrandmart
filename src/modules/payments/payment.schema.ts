import { z } from 'zod';

/** docs/API_Spec.md `POST /checkout/confirm`. */
export const confirmPaymentSchema = z.object({
  orderId: z.string().uuid(),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;
