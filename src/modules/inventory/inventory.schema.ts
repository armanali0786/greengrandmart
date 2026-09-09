import { z } from 'zod';

// docs/API_Spec.md `POST /admin/inventory/:variantId/adjust`: { type, quantity, note }.
// 'restock' and 'damage' take a positive quantity — direction is implied by
// type, so an admin never types a minus sign for those. 'adjustment' is the
// generic manual-correction bucket (docs/Data_Model_DB_Schema.md's
// inventory_movements.quantity is explicitly signed) and is the one case
// where the admin needs to both add and subtract, so it alone allows a
// negative quantity — not itemized further than this in the docs, see
// AGENTS.md §9 (picking the safest interpretation and stating it in-code).
export const adjustStockSchema = z
  .object({
    type: z.enum(['restock', 'damage', 'adjustment']),
    quantity: z
      .number()
      .int()
      .refine((n) => n !== 0, 'Quantity cannot be zero.'),
    // Required, not optional: it writes to inventory_movements and
    // audit_logs, both of which need a real reason on record.
    note: z.string().trim().min(1, 'A note is required for every stock adjustment.').max(500),
  })
  .refine((v) => v.type === 'adjustment' || v.quantity > 0, {
    message: 'Quantity must be positive for restock and damage.',
    path: ['quantity'],
  });
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
