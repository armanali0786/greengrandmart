import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createTestUser, deleteTestUser } from '../../fixtures/users';
import {
  createTestBrand,
  createTestCategory,
  createTestVariant,
  deleteTestBrand,
  deleteTestCategory,
  deleteTestProduct,
} from '../../fixtures/catalog';
import { computeOrderTotal } from '@/modules/pricing/pricing.service';
import { checkCoupon } from '@/modules/pricing/coupon.service';
import { CouponInvalidError } from '@/modules/pricing/pricing.errors';
import type { Prisma } from '@prisma/client';

const SELLER_STATE = 'Maharashtra'; // matches SELLER_STATE in .env.local/.env.example

async function createTestCoupon(overrides: Partial<Prisma.CouponCreateInput> = {}) {
  return db.coupon.create({
    data: {
      code: `TEST${randomUUID().slice(0, 8).toUpperCase()}`,
      type: 'percentage',
      value: 10,
      minCartValue: 0,
      usageLimitPerUser: 1,
      firstOrderOnly: false,
      active: true,
      appliesTo: { scope: 'all' },
      ...overrides,
    },
  });
}

async function deleteTestCoupon(id: string) {
  await db.couponRedemption.deleteMany({ where: { couponId: id } });
  await db.coupon.delete({ where: { id } }).catch(() => {});
}

async function createTestPromotion(rules: Prisma.InputJsonValue, type: string) {
  return db.promotion.create({
    data: { name: `Test Promo ${randomUUID()}`, type, rules, active: true },
  });
}

async function deleteTestPromotion(id: string) {
  await db.promotion.delete({ where: { id } }).catch(() => {});
}

describe('pricing service: computeOrderTotal', () => {
  it('computes subtotal and splits GST as CGST+SGST for an intra-state order', async () => {
    const { productId, variantId } = await createTestVariant(10, { price: 100000, gstRate: 18 });
    const user = await createTestUser();
    try {
      const result = await computeOrderTotal({
        userId: user.id,
        items: [{ variantId, quantity: 2 }],
        shippingState: SELLER_STATE,
      });
      expect(result.subtotal).toBe(200000);
      expect(result.taxTotal).toBe(36000); // 18% of 200000
      expect(result.cgst).toBe(18000);
      expect(result.sgst).toBe(18000);
      expect(result.igst).toBe(0);
      expect(result.grandTotal).toBe(200000 + 36000 + result.shippingFee);
    } finally {
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('charges IGST (not CGST/SGST) for an inter-state order', async () => {
    const { productId, variantId } = await createTestVariant(10, { price: 100000, gstRate: 18 });
    const user = await createTestUser();
    try {
      const result = await computeOrderTotal({
        userId: user.id,
        items: [{ variantId, quantity: 1 }],
        shippingState: 'Karnataka',
      });
      expect(result.igst).toBe(18000);
      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
    } finally {
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('uses the variant sale price, not the base price, for the subtotal', async () => {
    const { productId, variantId } = await createTestVariant(10, {
      price: 100000,
      salePrice: 80000,
    });
    const user = await createTestUser();
    try {
      const result = await computeOrderTotal({
        userId: user.id,
        items: [{ variantId, quantity: 1 }],
        shippingState: SELLER_STATE,
      });
      expect(result.subtotal).toBe(80000);
    } finally {
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('waives shipping above the free-shipping threshold and charges the flat fee below it', async () => {
    const { productId: cheapId, variantId: cheapVariant } = await createTestVariant(10, {
      price: 10000,
    });
    const user = await createTestUser();
    try {
      const below = await computeOrderTotal({
        userId: user.id,
        items: [{ variantId: cheapVariant, quantity: 1 }],
        shippingState: SELLER_STATE,
      });
      expect(below.shippingFee).toBeGreaterThan(0);

      const above = await computeOrderTotal({
        userId: user.id,
        items: [{ variantId: cheapVariant, quantity: 20 }], // 200000 paise, well above default threshold
        shippingState: SELLER_STATE,
      });
      expect(above.shippingFee).toBe(0);
    } finally {
      await deleteTestProduct(cheapId);
      await deleteTestUser(user.id);
    }
  });

  it('applies a category_discount promotion scoped to a category, and only the highest-value match wins', async () => {
    const category = await createTestCategory();
    const { productId, variantId } = await createTestVariant(10, {
      price: 100000,
      categoryId: category.id,
    });
    const user = await createTestUser();
    const promoSmall = await createTestPromotion(
      {
        type: 'category_discount',
        discountType: 'percentage',
        value: 5,
        scope: { scope: 'categories', categoryIds: [category.id] },
      },
      'category_discount',
    );
    const promoBig = await createTestPromotion(
      {
        type: 'category_discount',
        discountType: 'percentage',
        value: 20,
        scope: { scope: 'categories', categoryIds: [category.id] },
      },
      'category_discount',
    );
    try {
      const result = await computeOrderTotal({
        userId: user.id,
        items: [{ variantId, quantity: 1 }],
        shippingState: SELLER_STATE,
      });
      // Best match (20%) wins, not both stacked (5%+20%).
      expect(result.productDiscount).toBe(20000);
    } finally {
      await deleteTestPromotion(promoSmall.id);
      await deleteTestPromotion(promoBig.id);
      await deleteTestProduct(productId);
      await deleteTestCategory(category.id);
      await deleteTestUser(user.id);
    }
  });

  it('a category_discount promotion does not affect products outside its scope', async () => {
    const category = await createTestCategory();
    const { productId, variantId } = await createTestVariant(10, { price: 100000 }); // no category
    const user = await createTestUser();
    const promo = await createTestPromotion(
      {
        type: 'category_discount',
        discountType: 'percentage',
        value: 50,
        scope: { scope: 'categories', categoryIds: [category.id] },
      },
      'category_discount',
    );
    try {
      const result = await computeOrderTotal({
        userId: user.id,
        items: [{ variantId, quantity: 1 }],
        shippingState: SELLER_STATE,
      });
      expect(result.productDiscount).toBe(0);
    } finally {
      await deleteTestPromotion(promo.id);
      await deleteTestProduct(productId);
      await deleteTestCategory(category.id);
      await deleteTestUser(user.id);
    }
  });

  it('applies a coupon, caps it at maxDiscount, and allocates it across lines for GST', async () => {
    const { productId, variantId } = await createTestVariant(10, { price: 100000, gstRate: 10 });
    const user = await createTestUser();
    const coupon = await createTestCoupon({ type: 'percentage', value: 50, maxDiscount: 30000 });
    try {
      const result = await computeOrderTotal({
        userId: user.id,
        items: [{ variantId, quantity: 1 }],
        shippingState: SELLER_STATE,
        couponCode: coupon.code,
      });
      // 50% of 100000 = 50000, capped at maxDiscount 30000.
      expect(result.couponDiscount).toBe(30000);
      // GST charged on the post-coupon taxable amount: (100000-30000)*10% = 7000.
      expect(result.taxTotal).toBe(7000);
    } finally {
      await deleteTestCoupon(coupon.id);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('rejects a coupon below its minimum cart value with a specific message', async () => {
    const { productId, variantId } = await createTestVariant(1, { price: 5000 });
    const user = await createTestUser();
    const coupon = await createTestCoupon({ minCartValue: 100000 });
    try {
      await expect(
        computeOrderTotal({
          userId: user.id,
          items: [{ variantId, quantity: 1 }],
          shippingState: SELLER_STATE,
          couponCode: coupon.code,
        }),
      ).rejects.toThrow(/minimum order/i);
    } finally {
      await deleteTestCoupon(coupon.id);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('rejects an expired coupon distinctly from a not-yet-active one', async () => {
    const user = await createTestUser();
    const expired = await createTestCoupon({ expiresAt: new Date(Date.now() - 86400000) });
    const notYetActive = await createTestCoupon({ startsAt: new Date(Date.now() + 86400000) });
    try {
      await expect(checkCoupon(user.id, expired.code, [])).rejects.toThrow(/expired/i);
      await expect(checkCoupon(user.id, notYetActive.code, [])).rejects.toThrow(/not active yet/i);
    } finally {
      await deleteTestCoupon(expired.id);
      await deleteTestCoupon(notYetActive.id);
      await deleteTestUser(user.id);
    }
  });

  it('rejects a coupon the same user has already redeemed', async () => {
    const user = await createTestUser();
    const { productId, variantId } = await createTestVariant(1, { price: 100000 });
    const coupon = await createTestCoupon();
    try {
      // Simulate a prior redemption directly (real redemption is Phase 6/7's job).
      const order = await db.order.create({
        data: {
          orderNumber: `TEST-${randomUUID()}`,
          userId: user.id,
          subtotal: 100000,
          grandTotal: 100000,
          shippingAddress: {},
          billingAddress: {},
        },
      });
      await db.couponRedemption.create({
        data: { couponId: coupon.id, userId: user.id, orderId: order.id },
      });

      await expect(
        checkCoupon(user.id, coupon.code, [
          { productId, categoryId: null, brandId: null, amount: 100000 },
        ]),
      ).rejects.toThrow(/already used/i);

      await db.couponRedemption.deleteMany({ where: { couponId: coupon.id } });
      await db.order.delete({ where: { id: order.id } });
    } finally {
      await deleteTestCoupon(coupon.id);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('rejects a coupon whose total usage limit is already reached', async () => {
    const user = await createTestUser();
    const coupon = await createTestCoupon({ usageLimitTotal: 1 });
    const otherUser = await createTestUser();
    try {
      const order = await db.order.create({
        data: {
          orderNumber: `TEST-${randomUUID()}`,
          userId: otherUser.id,
          subtotal: 100000,
          grandTotal: 100000,
          shippingAddress: {},
          billingAddress: {},
        },
      });
      await db.couponRedemption.create({
        data: { couponId: coupon.id, userId: otherUser.id, orderId: order.id },
      });

      await expect(checkCoupon(user.id, coupon.code, [])).rejects.toThrow(CouponInvalidError);

      await db.couponRedemption.deleteMany({ where: { couponId: coupon.id } });
      await db.order.delete({ where: { id: order.id } });
    } finally {
      await deleteTestCoupon(coupon.id);
      await deleteTestUser(user.id);
      await deleteTestUser(otherUser.id);
    }
  });

  it('rejects a first-order-only coupon for a user who has already ordered', async () => {
    const user = await createTestUser();
    const coupon = await createTestCoupon({ firstOrderOnly: true });
    try {
      const order = await db.order.create({
        data: {
          orderNumber: `TEST-${randomUUID()}`,
          userId: user.id,
          subtotal: 100000,
          grandTotal: 100000,
          shippingAddress: {},
          billingAddress: {},
        },
      });

      await expect(checkCoupon(user.id, coupon.code, [])).rejects.toThrow(/first order/i);

      await db.order.delete({ where: { id: order.id } });
    } finally {
      await deleteTestCoupon(coupon.id);
      await deleteTestUser(user.id);
    }
  });

  it("rejects a coupon scoped to a brand the cart doesn't contain", async () => {
    const brand = await createTestBrand();
    const user = await createTestUser();
    const coupon = await createTestCoupon({ appliesTo: { scope: 'brands', brandIds: [brand.id] } });
    try {
      await expect(
        checkCoupon(user.id, coupon.code, [
          { productId: randomUUID(), categoryId: null, brandId: null, amount: 100000 },
        ]),
      ).rejects.toThrow(/does not apply/i);
    } finally {
      await deleteTestCoupon(coupon.id);
      await deleteTestBrand(brand.id);
      await deleteTestUser(user.id);
    }
  });
});
