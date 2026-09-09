import { env } from '@/config/env';
import { getVariantsForPricing } from '@/modules/catalog/catalog.service';
import type { VariantPricingSnapshot } from '@/modules/catalog/catalog.types';
import { checkCoupon, validateCouponPreview } from '@/modules/pricing/coupon.service';
import type { EligibleCartLine } from '@/modules/pricing/coupon.service';
import { getActivePromotionRules } from '@/modules/pricing/promotion.service';
import { matchesScope } from '@/modules/pricing/scope';
import type {
  CouponPreview,
  OrderTotalBreakdown,
  PricingScope,
  PromotionRules,
  QuoteLine,
} from '@/modules/pricing/pricing.types';

export interface CartLineInput {
  variantId: string;
  quantity: number;
}

/** Internal working shape — carries categoryId/brandId (needed for scope matching) that the public QuoteLine doesn't expose. */
interface PricedLine extends QuoteLine {
  categoryId: string | null;
  brandId: string | null;
}

function effectivePrice(v: VariantPricingSnapshot): number {
  return v.salePrice ?? v.price;
}

function isCategoryDiscount(
  p: PromotionRules,
): p is Extract<PromotionRules, { type: 'category_discount' }> {
  return p.type === 'category_discount';
}

function isFreeShipping(
  p: PromotionRules,
): p is Extract<PromotionRules, { type: 'free_shipping' }> {
  return p.type === 'free_shipping';
}

/**
 * Live-priced cart lines with automatic promotions already applied.
 * Silently skips a variantId the catalog no longer has a live pricing
 * snapshot for (deleted/archived) — the caller (cart/checkout) is
 * responsible for having already blocked on that via its own
 * OUT_OF_STOCK/availability check; a quote just shouldn't crash on it.
 */
async function priceLines(
  items: CartLineInput[],
  promotions: PromotionRules[],
): Promise<{ lines: PricedLine[]; productDiscount: number }> {
  const snapshots = await getVariantsForPricing(items.map((i) => i.variantId));
  const byId = new Map(snapshots.map((s) => [s.variantId, s]));
  const categoryDiscounts = promotions.filter(isCategoryDiscount);

  const lines: PricedLine[] = [];
  let productDiscount = 0;

  for (const item of items) {
    const snapshot = byId.get(item.variantId);
    if (!snapshot) continue;

    const unitPrice = effectivePrice(snapshot);
    const lineSubtotal = unitPrice * item.quantity;
    const target = {
      productId: snapshot.productId,
      categoryId: snapshot.categoryId,
      brandId: snapshot.brandId,
    };

    // Multiple matching category_discount promotions: the single most
    // generous match wins rather than stacking, since Product_Spec_Requirements.md
    // only specifies promotions stacking *with a coupon*, not with each
    // other — stacking automatic promotions isn't specified and could
    // silently discount a line to ₹0.
    let bestDiscount = 0;
    for (const promo of categoryDiscounts) {
      if (!matchesScope(promo.scope, target)) continue;
      const amount =
        promo.discountType === 'percentage'
          ? Math.round((lineSubtotal * promo.value) / 100)
          : promo.value * item.quantity;
      if (amount > bestDiscount) bestDiscount = amount;
    }
    bestDiscount = Math.min(bestDiscount, lineSubtotal);
    productDiscount += bestDiscount;

    lines.push({
      variantId: snapshot.variantId,
      sku: snapshot.sku,
      attributes: snapshot.attributes,
      productId: snapshot.productId,
      productName: snapshot.productName,
      quantity: item.quantity,
      unitPrice,
      lineSubtotal,
      promotionDiscount: bestDiscount,
      couponDiscount: 0,
      gstRate: snapshot.gstRate,
      taxAmount: 0,
      categoryId: snapshot.categoryId,
      brandId: snapshot.brandId,
    });
  }

  return { lines, productDiscount };
}

/**
 * docs/Product_Spec_Requirements.md §4.1: "Intra-state orders: CGST + SGST
 * split; inter-state: IGST — determined by comparing seller's registered
 * state to shipping address state." Both are free-text (Address.state has
 * no enum/dropdown), so this is a normalized case-insensitive compare —
 * the best available without a state-code enum in the data model.
 */
function isIntraState(shippingState: string): boolean {
  return shippingState.trim().toLowerCase() === env.SELLER_STATE.trim().toLowerCase();
}

export interface ComputeOrderTotalParams {
  userId: string;
  items: CartLineInput[];
  shippingState: string;
  couponCode?: string;
}

/**
 * The single source of truth for order pricing (docs/ECOMMERCE_IMPLEMENTATION_PLAN.md
 * Phase 5: "centralized computeOrderTotal()"). Always re-reads live prices,
 * live active promotions, and re-validates the coupon from scratch — never
 * trusts anything the client sends beyond variantId/quantity/couponCode.
 * Consumed by POST /checkout/quote now, and will be Phase 6/7's checkout
 * order-creation step too (same function, so a quote can never promise a
 * total the real order doesn't also charge).
 */
export async function computeOrderTotal(
  params: ComputeOrderTotalParams,
): Promise<OrderTotalBreakdown> {
  const promotions = await getActivePromotionRules();
  const { lines, productDiscount } = await priceLines(params.items, promotions);
  const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);

  let couponDiscount = 0;
  if (params.couponCode) {
    const eligibleLines: EligibleCartLine[] = lines.map((l) => ({
      productId: l.productId,
      categoryId: l.categoryId,
      brandId: l.brandId,
      amount: l.lineSubtotal - l.promotionDiscount,
    }));
    const { coupon, discount, eligibleLineTotal } = await checkCoupon(
      params.userId,
      params.couponCode,
      eligibleLines,
    );
    couponDiscount = discount;

    // Allocate the coupon discount back onto each eligible line,
    // proportional to its post-promotion amount, so GST — computed per
    // line at that line's own gst_rate — is charged on the correctly
    // discounted taxable value rather than the pre-coupon one.
    if (eligibleLineTotal > 0) {
      const scope = coupon.appliesTo as PricingScope;
      for (const line of lines) {
        if (!matchesScope(scope, line)) continue;
        const lineAfterPromo = line.lineSubtotal - line.promotionDiscount;
        line.couponDiscount = Math.round((lineAfterPromo / eligibleLineTotal) * discount);
      }
      // Per-line rounding can drift from the exact coupon total by a paisa
      // or two — reconcile onto the last eligible line rather than let the
      // breakdown's line-sum silently disagree with couponDiscount.
      const allocated = lines.reduce((sum, l) => sum + l.couponDiscount, 0);
      const drift = discount - allocated;
      if (drift !== 0) {
        const lastEligible = [...lines].reverse().find((l) => matchesScope(scope, l));
        if (lastEligible) lastEligible.couponDiscount += drift;
      }
    }
  }

  const intraState = isIntraState(params.shippingState);
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const line of lines) {
    const taxable = line.lineSubtotal - line.promotionDiscount - line.couponDiscount;
    const lineTax = Math.round((taxable * line.gstRate) / 100);
    line.taxAmount = lineTax;
    if (intraState) {
      const half = Math.floor(lineTax / 2);
      cgst += half;
      sgst += lineTax - half;
    } else {
      igst += lineTax;
    }
  }
  const taxTotal = cgst + sgst + igst;

  const taxableSubtotal = subtotal - productDiscount - couponDiscount;
  const freeShippingActive = promotions
    .filter(isFreeShipping)
    .some((p) => taxableSubtotal >= p.minCartValue);
  const shippingFee =
    freeShippingActive || taxableSubtotal >= env.FREE_SHIPPING_THRESHOLD
      ? 0
      : env.SHIPPING_FLAT_FEE;

  const grandTotal = taxableSubtotal + shippingFee + taxTotal;

  return {
    subtotal,
    productDiscount,
    couponDiscount,
    shippingFee,
    cgst,
    sgst,
    igst,
    taxTotal,
    grandTotal,
    lines: lines.map((line) => ({
      variantId: line.variantId,
      sku: line.sku,
      attributes: line.attributes,
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineSubtotal: line.lineSubtotal,
      promotionDiscount: line.promotionDiscount,
      couponDiscount: line.couponDiscount,
      gstRate: line.gstRate,
      taxAmount: line.taxAmount,
    })),
  };
}

/**
 * POST /coupons/validate — preview only, no shipping/GST breakdown (per
 * docs/API_Spec.md §7's response shape). Still applies active promotions
 * first, same as computeOrderTotal, so the eligible amount a coupon
 * discounts against is the post-promotion one, consistent between preview
 * and the real quote.
 */
export async function previewCoupon(
  userId: string,
  code: string,
  items: CartLineInput[],
): Promise<CouponPreview> {
  const promotions = await getActivePromotionRules();
  const { lines } = await priceLines(items, promotions);
  const eligibleLines: EligibleCartLine[] = lines.map((l) => ({
    productId: l.productId,
    categoryId: l.categoryId,
    brandId: l.brandId,
    amount: l.lineSubtotal - l.promotionDiscount,
  }));
  return validateCouponPreview(userId, code, eligibleLines);
}
