import { z } from 'zod';

const uuid = () => z.string().uuid();

export const pricingScopeSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('all') }),
  z.object({ scope: z.literal('products'), productIds: z.array(uuid()).min(1) }),
  z.object({ scope: z.literal('categories'), categoryIds: z.array(uuid()).min(1) }),
  z.object({ scope: z.literal('brands'), brandIds: z.array(uuid()).min(1) }),
]);

const couponCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens, and underscores only.')
  // Product_Spec_Requirements.md §4.2: "coupon code entry is case-insensitive"
  // — normalized to uppercase at the boundary so every downstream lookup
  // (validate, redeem, admin list) compares consistently.
  .transform((v) => v.toUpperCase());

const couponBaseSchema = z.object({
  code: couponCodeSchema,
  type: z.enum(['percentage', 'fixed']),
  value: z.number().int().positive(),
  maxDiscount: z.number().int().positive().optional(),
  minCartValue: z.number().int().nonnegative().default(0),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  usageLimitTotal: z.number().int().positive().optional(),
  // Fixed at 1 — coupon_redemptions' UNIQUE(coupon_id, user_id) constraint
  // (Architecture.md §5.3) enforces at most one redemption per user per
  // coupon regardless of this value; see Product_Spec_Requirements.md
  // §4.3's Phase 5 addendum.
  usageLimitPerUser: z.literal(1).default(1),
  firstOrderOnly: z.boolean().default(false),
  appliesTo: pricingScopeSchema.default({ scope: 'all' }),
  active: z.boolean().default(true),
});

export const createCouponSchema = couponBaseSchema
  .refine((v) => v.type !== 'percentage' || v.value <= 100, {
    message: 'A percentage coupon cannot exceed 100.',
    path: ['value'],
  })
  .refine((v) => !v.startsAt || !v.expiresAt || v.startsAt < v.expiresAt, {
    message: 'Start date must be before expiry date.',
    path: ['expiresAt'],
  });
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

export const updateCouponSchema = couponBaseSchema.partial();
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

const categoryDiscountRulesSchema = z.object({
  type: z.literal('category_discount'),
  discountType: z.enum(['percentage', 'fixed']),
  value: z.number().int().positive(),
  scope: pricingScopeSchema,
});

const freeShippingRulesSchema = z.object({
  type: z.literal('free_shipping'),
  minCartValue: z.number().int().nonnegative().default(0),
});

export const promotionRulesSchema = z.discriminatedUnion('type', [
  categoryDiscountRulesSchema,
  freeShippingRulesSchema,
]);

const promotionBaseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  rules: promotionRulesSchema,
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  active: z.boolean().default(true),
});

export const createPromotionSchema = promotionBaseSchema.refine(
  (v) => !v.startsAt || !v.expiresAt || v.startsAt < v.expiresAt,
  { message: 'Start date must be before expiry date.', path: ['expiresAt'] },
);
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;

export const updatePromotionSchema = promotionBaseSchema.partial();
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;

export const validateCouponSchema = z.object({ code: z.string().trim().min(1) });
export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;

export const checkoutQuoteSchema = z.object({
  couponCode: z.string().trim().min(1).optional(),
  shippingAddressId: uuid(),
});
export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteSchema>;
