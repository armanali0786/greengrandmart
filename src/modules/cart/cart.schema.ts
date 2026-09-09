import { z } from 'zod';

// Defensive upper bound against malformed/abusive input, not a business
// limit — the real cap on any given add/update is always live stock,
// enforced by inventory.service.getAvailableStock at request time.
const quantitySchema = z.number().int().positive().max(999);

export const addCartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: quantitySchema,
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  quantity: quantitySchema,
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
