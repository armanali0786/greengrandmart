import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createTestUser, deleteTestUser } from '../../fixtures/users';
import { createTestAddress } from '../../fixtures/addresses';
import { createTestVariant, deleteTestProduct } from '../../fixtures/catalog';
import { addItem } from '@/modules/cart/cart.service';
import { createOrder } from '@/modules/orders/checkout.service';
import { sweepExpiredReservations } from '@/modules/orders/reservation-sweep.service';

async function deleteTestOrder(orderId: string): Promise<void> {
  await db.couponRedemption.deleteMany({ where: { orderId } });
  await db.inventoryReservation.deleteMany({ where: { orderId } });
  await db.payment.deleteMany({ where: { orderId } });
  await db.orderStatusHistory.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.delete({ where: { id: orderId } }).catch(() => {});
}

describe('reservation-sweep.service.sweepExpiredReservations', () => {
  it('releases an expired reservation, restores stock, and marks the order payment_failed', async () => {
    const user = await createTestUser();
    const address = await createTestAddress(user.id);
    const { productId, variantId } = await createTestVariant(10, { price: 10000 });
    let orderId: string | undefined;
    try {
      await addItem({ userId: user.id }, { variantId, quantity: 4 });
      const result = await createOrder(user, {
        shippingAddressId: address.id,
        paymentMethod: 'online',
      });
      orderId = result.orderId;

      // Simulate the reservation's 15-minute window having already passed —
      // the real TTL is far too long to wait out in a test.
      await db.inventoryReservation.updateMany({
        where: { orderId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const swept = await sweepExpiredReservations();
      expect(swept.releasedCount).toBeGreaterThanOrEqual(1);
      expect(swept.expiredOrderCount).toBe(1);

      const inv = await db.inventory.findUniqueOrThrow({ where: { variantId } });
      expect(inv.availableQty).toBe(10);
      expect(inv.reservedQty).toBe(0);

      const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('payment_failed');

      const history = await db.orderStatusHistory.findMany({ where: { orderId } });
      expect(history.some((h) => h.toStatus === 'payment_failed')).toBe(true);
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('leaves a confirmed order alone even if its reservation somehow expired', async () => {
    const user = await createTestUser();
    const address = await createTestAddress(user.id);
    const { productId, variantId } = await createTestVariant(10, { price: 10000 });
    let orderId: string | undefined;
    try {
      await addItem({ userId: user.id }, { variantId, quantity: 2 });
      const result = await createOrder(user, {
        shippingAddressId: address.id,
        paymentMethod: 'online',
      });
      orderId = result.orderId;
      await db.order.update({ where: { id: orderId }, data: { status: 'confirmed' } });
      await db.inventoryReservation.updateMany({
        where: { orderId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await sweepExpiredReservations();

      const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('confirmed'); // untouched — only pending_payment orders expire this way
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });
});
