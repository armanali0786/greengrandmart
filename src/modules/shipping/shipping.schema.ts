import { z } from 'zod';

/**
 * Optional fields folded into `PATCH /admin/orders/:id/status`'s body
 * (docs/API_Spec.md's own example: `{ "status": "packed", "trackingNumber":
 * null }`) rather than a separate endpoint — that's the only shipment
 * mechanism the doc actually shows.
 */
export const shipmentDetailsSchema = z.object({
  carrier: z.string().min(1).max(120).optional(),
  trackingNumber: z.string().min(1).max(120).optional(),
  estimatedDelivery: z.coerce.date().optional(),
});
export type ShipmentDetailsInput = z.infer<typeof shipmentDetailsSchema>;
