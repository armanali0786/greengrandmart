import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { env } from '@/config/env';
import { NotFoundError } from '@/lib/errors';
import type { SessionUser } from '@/modules/auth/auth.types';
import { getAddress } from '@/modules/auth/address.service';
import type { AddressRecord } from '@/modules/auth/address.repository';
import { convertCart, getCart } from '@/modules/cart/cart.service';
import { OutOfStockError } from '@/modules/inventory/inventory.errors';
import { reserveStock } from '@/modules/inventory/inventory.service';
import { computeOrderTotal } from '@/modules/pricing/pricing.service';
import { redeemCoupon } from '@/modules/pricing/coupon.service';
import { paymentProvider } from '@/modules/payments/payment-provider';
import * as repo from '@/modules/orders/order.repository';
import type { CheckoutInput } from '@/modules/orders/order.schema';
import type { AddressSnapshot } from '@/modules/orders/order.types';

function toAddressSnapshot(address: AddressRecord): AddressSnapshot {
  return {
    name: address.name,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    landmark: address.landmark,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
  };
}

function isUniqueConstraintError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/** GGM-2026-483920 — random, not sequential (a sequential counter would need its own lock, contending with every concurrent checkout). Collisions are astronomically unlikely; createOrder retries a few times on one anyway. */
function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const suffix = randomInt(100000, 999999);
  return `GGM-${year}-${suffix}`;
}

export interface CheckoutResult {
  orderId: string;
  orderNumber: string;
  razorpayOrderId: string;
  amount: number;
  keyId: string;
}

/**
 * docs/ECOMMERCE_IMPLEMENTATION_PLAN.md §5.1: quote → checkout creates the
 * order (pending_payment) + reservations inside one transaction, then hands
 * off to the payment provider — never the reverse. Re-validates everything
 * server-side (cart availability, live pricing, coupon) rather than
 * trusting anything the client sent to /checkout/quote earlier; a stale or
 * tampered quote can't buy anything it wasn't actually re-priced for here.
 */
export async function createOrder(
  user: SessionUser,
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const cart = await getCart({ userId: user.id });
  if (cart.items.length === 0) {
    throw new NotFoundError('Your cart is empty.');
  }
  const unavailable = cart.items.find((i) => !i.available);
  if (unavailable) {
    throw new OutOfStockError(
      `"${unavailable.productName}" is no longer available in the quantity in your cart — please update your cart.`,
    );
  }

  const [shippingAddress, billingAddress] = await Promise.all([
    getAddress(user, input.shippingAddressId),
    getAddress(user, input.billingAddressId ?? input.shippingAddressId),
  ]);

  const items = cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
  const breakdown = await computeOrderTotal({
    userId: user.id,
    items,
    shippingState: shippingAddress.state,
    couponCode: input.couponCode,
  });

  const expiresAt = new Date(Date.now() + env.RESERVATION_TTL_MINUTES * 60 * 1000);

  const order = await db.$transaction(async (tx) => {
    let created: repo.OrderDetailRow | undefined;
    // Retries only ever fire on the astronomically unlikely orderNumber
    // collision (see generateOrderNumber) — never on a real business
    // error, which throws immediately below instead of looping.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        created = await repo.createOrderRow(tx, {
          orderNumber: generateOrderNumber(),
          userId: user.id,
          subtotal: breakdown.subtotal,
          discountTotal: breakdown.productDiscount,
          couponDiscount: breakdown.couponDiscount,
          shippingFee: breakdown.shippingFee,
          taxTotal: breakdown.taxTotal,
          grandTotal: breakdown.grandTotal,
          shippingAddress: toAddressSnapshot(shippingAddress),
          billingAddress: toAddressSnapshot(billingAddress),
          items: breakdown.lines.map((line) => ({
            productId: line.productId,
            variantId: line.variantId,
            productNameSnapshot: line.productName,
            skuSnapshot: line.sku,
            variantAttrsSnapshot: line.attributes,
            unitPrice: line.unitPrice,
            discount: line.promotionDiscount + line.couponDiscount,
            taxAmount: line.taxAmount,
            quantity: line.quantity,
            lineTotal: line.lineSubtotal - line.promotionDiscount - line.couponDiscount,
          })),
        });
        break;
      } catch (e) {
        if (isUniqueConstraintError(e) && attempt < 4) continue;
        throw e;
      }
    }
    if (!created) throw new Error('Failed to generate a unique order number.');

    // Stock re-validated and locked here for real — the cart's `available`
    // check above and the quote's pricing are both advisory; this is the
    // one place that actually commits stock, matching AGENTS.md's "stock
    // only ever changes through modules/inventory, inside a transaction
    // with row locks." A failure here (OutOfStockError) rolls back the
    // order insert too — docs/API_Spec.md §5: "order is not created."
    for (const line of breakdown.lines) {
      await reserveStock(tx, {
        variantId: line.variantId,
        quantity: line.quantity,
        orderId: created.id,
        expiresAt,
      });
    }

    if (input.couponCode) {
      await redeemCoupon(tx, { code: input.couponCode, userId: user.id, orderId: created.id });
    }

    await convertCart(cart.id, tx);

    return created;
  });

  // Deliberately outside the transaction: docs/Product_Spec_Requirements.md
  // §6.2 lets the customer retry payment against the same already-created
  // order, so a payment-provider failure here shouldn't roll back an order
  // that's otherwise valid — it just leaves it payable without a Payment
  // row yet (Phase 7's retry endpoint creates one on retry).
  const payment = await paymentProvider.createPayment({
    orderId: order.id,
    amount: breakdown.grandTotal,
  });
  await db.payment.create({
    data: {
      orderId: order.id,
      razorpayOrderId: payment.providerOrderId,
      amount: breakdown.grandTotal,
      status: 'created',
    },
  });

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    razorpayOrderId: payment.providerOrderId,
    amount: breakdown.grandTotal,
    keyId: payment.keyId,
  };
}
