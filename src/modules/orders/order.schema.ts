import { z } from 'zod';
import { shipmentDetailsSchema } from '@/modules/shipping/shipping.schema';

const orderStatusValues = [
  'pending_payment',
  'payment_failed',
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancel_requested',
  'cancelled',
  'return_requested',
  'return_approved',
  'returned',
  'refund_pending',
  'refunded',
] as const;

export const checkoutSchema = z.object({
  shippingAddressId: z.string().uuid(),
  billingAddressId: z.string().uuid().optional(),
  // 'cod' isn't accepted yet: Product_Spec_Requirements.md §5.1 requires
  // phone OTP verification before a COD order can be placed, and OTP
  // (MSG91) is Phase 9's job — restricting the accepted value here keeps
  // that gap visible at the API boundary instead of failing deep inside
  // the service.
  paymentMethod: z.literal('online'),
  couponCode: z.string().trim().min(1).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

// docs/API_Spec.md's own sample body for this endpoint includes
// `trackingNumber` alongside `status` — shipmentDetailsSchema folds in
// carrier/estimatedDelivery too, all optional and only meaningful once the
// order moves into a shipment-relevant status (shipment.service.ts decides
// that, not this schema).
export const updateOrderStatusSchema = z.object({
  status: z.enum(orderStatusValues),
  note: z.string().trim().max(1000).optional(),
  shipment: shipmentDetailsSchema.optional(),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(orderStatusValues).optional(),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
