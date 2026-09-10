import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { env } from '@/config/env';
import { createTestUser, deleteTestUser } from '../../fixtures/users';
import { createTestAddress } from '../../fixtures/addresses';
import { createTestVariant, deleteTestProduct } from '../../fixtures/catalog';
import { deleteJobsForOrder } from '../../fixtures/jobs';
import { addItem } from '@/modules/cart/cart.service';
import { createOrder } from '@/modules/orders/checkout.service';
import { getOrderForUser } from '@/modules/orders/order.service';
import {
  approveReturn,
  completeReturn,
  markItemReceived,
  rejectReturn,
  requestReturn,
} from '@/modules/returns/return.service';
import { InvalidReturnStateError, ReturnWindowExpiredError } from '@/modules/returns/return.errors';
import { ForbiddenError } from '@/modules/auth/auth.errors';
import type { SessionUser } from '@/modules/auth/auth.types';

async function deleteTestOrder(orderId: string): Promise<void> {
  await deleteJobsForOrder(orderId);
  await db.return.deleteMany({ where: { orderId } });
  await db.payment.deleteMany({ where: { orderId } });
  await db.orderStatusHistory.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.delete({ where: { id: orderId } }).catch(() => {});
}

async function admin(): Promise<SessionUser> {
  return createTestUser({ role: 'admin' });
}

/** Sets order.status = 'delivered' and seeds a delivered status-history row `daysAgo` days back, so requestReturn's window check has something real to measure against. */
async function markDelivered(orderId: string, daysAgo: number): Promise<void> {
  const deliveredAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await db.order.update({ where: { id: orderId }, data: { status: 'delivered' } });
  await db.orderStatusHistory.create({
    data: {
      orderId,
      fromStatus: 'out_for_delivery',
      toStatus: 'delivered',
      createdAt: deliveredAt,
    },
  });
}

async function setupDeliveredOrder(quantity = 1, price = 10000, deliveredDaysAgo = 1) {
  const user = await createTestUser();
  const address = await createTestAddress(user.id);
  const { productId, variantId } = await createTestVariant(10, { price });
  await addItem({ userId: user.id }, { variantId, quantity });
  const result = await createOrder(user, {
    shippingAddressId: address.id,
    paymentMethod: 'online',
  });
  await markDelivered(result.orderId, deliveredDaysAgo);
  const order = await getOrderForUser(user, result.orderId);
  return { user, productId, variantId, orderId: result.orderId, itemId: order.items[0].id };
}

describe('return.service.requestReturn', () => {
  it('creates a return and moves the order to return_requested', async () => {
    const { user, productId, orderId, itemId } = await setupDeliveredOrder();
    try {
      const ret = await requestReturn(user, orderId, itemId, {
        reason: 'damaged',
        note: 'Box crushed',
      });
      expect(ret.status).toBe('requested');
      expect(ret.reason).toBe('damaged: Box crushed');

      const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('return_requested');
    } finally {
      await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('rejects a return request before the order is delivered', async () => {
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
      const order = await getOrderForUser(user, orderId);

      await expect(
        requestReturn(user, orderId, order.items[0].id, { reason: 'damaged' }),
      ).rejects.toThrow(InvalidReturnStateError);
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('rejects a return request outside the configured return window', async () => {
    const { user, productId, orderId, itemId } = await setupDeliveredOrder(
      1,
      10000,
      env.RETURN_WINDOW_DAYS + 1,
    );
    try {
      await expect(requestReturn(user, orderId, itemId, { reason: 'other' })).rejects.toThrow(
        ReturnWindowExpiredError,
      );
    } finally {
      await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('refuses a second concurrent return request for the same order', async () => {
    const { user, productId, orderId, itemId } = await setupDeliveredOrder(2);
    try {
      await requestReturn(user, orderId, itemId, { reason: 'damaged' });
      // Order is now return_requested, not delivered — requestReturn's own
      // status check catches this before the "one at a time" check does,
      // which is the correct and simpler failure mode either way.
      await expect(requestReturn(user, orderId, itemId, { reason: 'other' })).rejects.toThrow(
        InvalidReturnStateError,
      );
    } finally {
      await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });
});

describe('return.service admin actions', () => {
  it('approve → markItemReceived restocks inventory and advances the order to returned', async () => {
    const { user, productId, variantId, orderId, itemId } = await setupDeliveredOrder(3, 10000);
    const adminUser = await admin();
    try {
      const ret = await requestReturn(user, orderId, itemId, { reason: 'wrong_item' });

      const approved = await approveReturn(adminUser, ret.id, 'Looks legit');
      expect(approved.status).toBe('approved');
      let order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('return_approved');

      const invBefore = await db.inventory.findUniqueOrThrow({ where: { variantId } });
      expect(invBefore.availableQty).toBe(7); // 10 - 3 sold

      const received = await markItemReceived(adminUser, ret.id, 'Received at warehouse');
      expect(received.status).toBe('item_received');

      const invAfter = await db.inventory.findUniqueOrThrow({ where: { variantId } });
      expect(invAfter.availableQty).toBe(10); // restocked

      order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('returned');

      const completed = await completeReturn(adminUser, ret.id);
      expect(completed.status).toBe('completed');
    } finally {
      await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
      await deleteTestUser(adminUser.id);
    }
  });

  it('reject bounces the order status back to delivered', async () => {
    const { user, productId, orderId, itemId } = await setupDeliveredOrder(1);
    const adminUser = await admin();
    try {
      const ret = await requestReturn(user, orderId, itemId, {
        reason: 'other',
        note: 'Changed mind',
      });
      const rejected = await rejectReturn(adminUser, ret.id, 'Outside policy');
      expect(rejected.status).toBe('rejected');

      const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('delivered');
    } finally {
      await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
      await deleteTestUser(adminUser.id);
    }
  });

  it('markItemReceived refuses to run on a return that was never approved', async () => {
    const { user, productId, orderId, itemId } = await setupDeliveredOrder(1);
    const adminUser = await admin();
    try {
      const ret = await requestReturn(user, orderId, itemId, { reason: 'damaged' });
      await expect(markItemReceived(adminUser, ret.id, undefined)).rejects.toThrow(
        InvalidReturnStateError,
      );
    } finally {
      await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
      await deleteTestUser(adminUser.id);
    }
  });

  it('a non-admin/staff user cannot approve a return', async () => {
    const { user, productId, orderId, itemId } = await setupDeliveredOrder(1);
    try {
      const ret = await requestReturn(user, orderId, itemId, { reason: 'damaged' });
      await expect(approveReturn(user, ret.id, undefined)).rejects.toThrow(ForbiddenError);
    } finally {
      await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });
});
