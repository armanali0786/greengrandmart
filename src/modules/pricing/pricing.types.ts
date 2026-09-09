export type CouponType = 'percentage' | 'fixed';

export type PricingScope =
  | { scope: 'all' }
  | { scope: 'products'; productIds: string[] }
  | { scope: 'categories'; categoryIds: string[] }
  | { scope: 'brands'; brandIds: string[] };

export interface CouponSummary {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  maxDiscount: number | null;
  minCartValue: number;
  startsAt: string | null;
  expiresAt: string | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number;
  firstOrderOnly: boolean;
  appliesTo: PricingScope;
  active: boolean;
  redemptionCount: number;
}

/**
 * Only 'category_discount' and 'free_shipping' are implemented this phase —
 * see the Phase 5 addendum in Product_Spec_Requirements.md §4.3 for why
 * 'sale_price'/'bogo'/'bundle' (also listed in the DB CHECK constraint) are
 * deferred.
 */
export type PromotionType = 'category_discount' | 'free_shipping';

export interface CategoryDiscountRules {
  type: 'category_discount';
  discountType: CouponType;
  value: number;
  scope: PricingScope;
}

export interface FreeShippingRules {
  type: 'free_shipping';
  minCartValue: number;
}

export type PromotionRules = CategoryDiscountRules | FreeShippingRules;

export interface PromotionSummary {
  id: string;
  name: string;
  type: PromotionType;
  rules: PromotionRules;
  startsAt: string | null;
  expiresAt: string | null;
  active: boolean;
}

export interface QuoteLine {
  variantId: string;
  sku: string;
  attributes: Record<string, string>;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  promotionDiscount: number;
  couponDiscount: number;
  gstRate: number;
  taxAmount: number;
}

export interface OrderTotalBreakdown {
  subtotal: number;
  productDiscount: number;
  couponDiscount: number;
  shippingFee: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  grandTotal: number;
  lines: QuoteLine[];
}

export interface CouponPreview {
  valid: true;
  type: CouponType;
  value: number;
  estimatedDiscount: number;
}
