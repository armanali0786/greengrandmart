import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createTestUser, deleteTestUser } from '../../fixtures/users';
import { createTestAddress } from '../../fixtures/addresses';
import { createTestVariant, deleteTestProduct } from '../../fixtures/catalog';
import { deleteJobsForOrder } from '../../fixtures/jobs';
import { addItem } from '@/modules/cart/cart.service';
import { createOrder } from '@/modules/orders/checkout.service';
import {
  cancelOrder,
  getOrderForUser,
  updateOrderStatusAdmin,
} from '@/modules/orders/order.service';
import { InvalidOrderStateError } from '@/modules/orders/order.errors';
import { OutOfStockError } from '@/modules/inventory/inventory.errors';
import { NotFoundError } from '@/lib/errors';
import type { SessionUser } from '@/modules/auth/auth.types';

async function getInventory(variantId: string) {
  return db.inventory.findUniqueOrThrow({ where: { variantId } });
}

async function deleteTestOrder(orderId: string): Promise<void> {
  await deleteJobsForOrder(orderId);
  await db.couponRedemption.deleteMany({ where: { orderId } });
  await db.inventoryReservation.deleteMany({ where: { orderId } });
  await db.payment.deleteMany({ where: { orderId } });
  await db.orderStatusHistory.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.delete({ where: { id: orderId } }).catch(() => {});
}

async function admin(): Promise<SessionUser> {
  return createTestUser({ role: 'admin' });
}

describe('checkout.service.createOrder', () => {
  it('creates a pending_payment order, reserves stock, and snapshots the item', async () => {
    const user = await createTestUser();
    const address = await createTestAddress(user.id);
    const { productId, variantId } = await createTestVariant(10, { price: 50000, gstRate: 12 });
    let orderId: string | undefined;
    try {
      await addItem({ userId: user.id }, { variantId, quantity: 2 });

      const result = await createOrder(user, {
        shippingAddressId: address.id,
        paymentMethod: 'online',
      });
      orderId = result.orderId;

      expect(result.orderNumber).toMatch(/^GGM-\d{4}-\d{6}$/);
      expect(result.razorpayOrderId).toBeTruthy();
      expect(result.amount).toBeGreaterThan(0);

      const inv = await getInventory(variantId);
      expect(inv.availableQty).toBe(8); // 10 - 2 reserved
      expect(inv.reservedQty).toBe(2);

      const order = await getOrderForUser(user, orderId);
      expect(order.status).toBe('pending_payment');
      expect(order.items).toHaveLength(1);
      expect(order.items[0].quantity).toBe(2);
      expect(order.items[0].unitPrice).toBe(50000);
      expect(order.statusHistory).toHaveLength(1);
      expect(order.statusHistory[0].toStatus).toBe('pending_payment');

      // Cart is converted, not left with stale items.
      const cart = await db.cart.findFirst({ where: { userId: user.id } });
      expect(cart?.status).toBe('converted');
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('rejects checkout with an empty cart', async () => {
    const user = await createTestUser();
    const address = await createTestAddress(user.id);
    try {
      await expect(
        createOrder(user, { shippingAddressId: address.id, paymentMethod: 'online' }),
      ).rejects.toThrow(NotFoundError);
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it('rejects checkout when a cart item exceeds available stock, and creates no order', async () => {
    const user = await createTestUser();
    const address = await createTestAddress(user.id);
    const { productId, variantId } = await createTestVariant(1, { price: 10000 });
    try {
      await addItem({ userId: user.id }, { variantId, quantity: 1 });
      // Drain stock after adding to cart, simulating another buyer winning the race.
      await db.inventory.update({ where: { variantId }, data: { availableQty: 0 } });

      await expect(
        createOrder(user, { shippingAddressId: address.id, paymentMethod: 'online' }),
      ).rejects.toThrow(OutOfStockError);

      const orderCount = await db.order.count({ where: { userId: user.id } });
      expect(orderCount).toBe(0);
    } finally {
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('redeems a coupon as part of order creation', async () => {
    const user = await createTestUser();
    const address = await createTestAddress(user.id);
    const { productId, variantId } = await createTestVariant(10, { price: 100000 });
    const coupon = await db.coupon.create({
      data: {
        code: `CHK${randomUUID().slice(0, 6).toUpperCase()}`,
        type: 'percentage',
        value: 10,
        appliesTo: { scope: 'all' },
      },
    });
    let orderId: string | undefined;
    try {
      await addItem({ userId: user.id }, { variantId, quantity: 1 });
      const result = await createOrder(user, {
        shippingAddressId: address.id,
        paymentMethod: 'online',
        couponCode: coupon.code,
      });
      orderId = result.orderId;

      const redemption = await db.couponRedemption.findFirst({
        where: { couponId: coupon.id, userId: user.id },
      });
      expect(redemption).not.toBeNull();
      expect(redemption?.orderId).toBe(orderId);

      const order = await getOrderForUser(user, orderId);
      expect(order.couponDiscount).toBe(10000); // 10% of 100000
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await db.couponRedemption.deleteMany({ where: { couponId: coupon.id } });
      await db.coupon.delete({ where: { id: coupon.id } });
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });
});

describe('order state machine', () => {
  it('cancelOrder releases the reservation and restores stock, only from confirmed/processing', async () => {
    const user = await createTestUser();
    const address = await createTestAddress(user.id);
    const { productId, variantId } = await createTestVariant(10, { price: 20000 });
    let orderId: string | undefined;
    try {
      await addItem({ userId: user.id }, { variantId, quantity: 3 });
      const result = await createOrder(user, {
        shippingAddressId: address.id,
        paymentMethod: 'online',
      });
      orderId = result.orderId;

      // pending_payment isn't cancelable per Product_Spec_Requirements.md §5.2.
      await expect(cancelOrder(user, orderId)).rejects.toThrow(InvalidOrderStateError);

      // Move it to 'confirmed' the way only the (future) payment webhook may —
      // simulated here via a direct DB write, since no admin/customer path
      // is allowed to perform this transition (see canAdminTransition).
      await db.order.update({ where: { id: orderId }, data: { status: 'confirmed' } });

      const cancelled = await cancelOrder(user, orderId);
      expect(cancelled.status).toBe('cancelled');

      const inv = await getInventory(variantId);
      expect(inv.availableQty).toBe(10);
      expect(inv.reservedQty).toBe(0);
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it("rejects cancelling another customer's order", async () => {
    const owner = await createTestUser();
    const attacker = await createTestUser();
    const address = await createTestAddress(owner.id);
    const { productId, variantId } = await createTestVariant(5, { price: 10000 });
    let orderId: string | undefined;
    try {
      await addItem({ userId: owner.id }, { variantId, quantity: 1 });
      const result = await createOrder(owner, {
        shippingAddressId: address.id,
        paymentMethod: 'online',
      });
      orderId = result.orderId;
      await db.order.update({ where: { id: orderId }, data: { status: 'confirmed' } });

      await expect(cancelOrder(attacker, orderId)).rejects.toThrow();
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(owner.id);
      await deleteTestUser(attacker.id);
    }
  });

  it('admin can advance an order through the fulfillment pipeline, but not skip steps', async () => {
    const user = await createTestUser();
    const adminUser = await admin();
    const address = await createTestAddress(user.id);
    const { productId, variantId } = await createTestVariant(5, { price: 10000 });
    let orderId: string | undefined;
    try {
      await addItem({ userId: user.id }, { variantId, quantity: 1 });
      const result = await createOrder(user, {
        shippingAddressId: address.id,
        paymentMethod: 'online',
      });
      orderId = result.orderId;
      await db.order.update({ where: { id: orderId }, data: { status: 'confirmed' } });

      // Cannot skip processing/packed/shipped/out_for_delivery straight to delivered.
      await expect(
        updateOrderStatusAdmin(adminUser, orderId, { status: 'delivered' }),
      ).rejects.toThrow(InvalidOrderStateError);

      const processing = await updateOrderStatusAdmin(adminUser, orderId, {
        status: 'processing',
      });
      expect(processing.status).toBe('processing');

      const packed = await updateOrderStatusAdmin(adminUser, orderId, {
        status: 'packed',
        note: 'Packed at warehouse',
      });
      expect(packed.status).toBe('packed');
      expect(packed.statusHistory.at(-1)?.note).toBe('Packed at warehouse');
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
      await deleteTestUser(adminUser.id);
    }
  });

  it('admin cannot confirm a pending_payment order directly — only the payment webhook may', async () => {
    const user = await createTestUser();
    const adminUser = await admin();
    const address = await createTestAddress(user.id);
    const { productId, variantId } = await createTestVariant(5, { price: 10000 });
    let orderId: string | undefined;
    try {
      await addItem({ userId: user.id }, { variantId, quantity: 1 });
      const result = await createOrder(user, {
        shippingAddressId: address.id,
        paymentMethod: 'online',
      });
      orderId = result.orderId;

      await expect(
        updateOrderStatusAdmin(adminUser, orderId, { status: 'confirmed' }),
      ).rejects.toThrow(InvalidOrderStateError);
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
      await deleteTestUser(adminUser.id);
    }
  });

  it('a non-admin cannot update order status', async () => {
    const user = await createTestUser();
    const address = await createTestAddress(user.id);
    const { productId, variantId } = await createTestVariant(5, { price: 10000 });
    let orderId: string | undefined;
    try {
      await addItem({ userId: user.id }, { variantId, quantity: 1 });
      const result = await createOrder(user, {
        shippingAddressId: address.id,
        paymentMethod: 'online',
      });
      orderId = result.orderId;

      await expect(
        updateOrderStatusAdmin(user, orderId, { status: 'payment_failed' }),
      ).rejects.toThrow();
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });
});
