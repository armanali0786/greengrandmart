import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createTestUser, deleteTestUser } from '../../fixtures/users';
import { createTestAddress } from '../../fixtures/addresses';
import { createTestVariant, deleteTestProduct } from '../../fixtures/catalog';
import { deleteJobsForOrder } from '../../fixtures/jobs';
import { addItem } from '@/modules/cart/cart.service';
import { createOrder } from '@/modules/orders/checkout.service';
import { getOrderForUser, updateOrderStatusAdmin } from '@/modules/orders/order.service';
import type { SessionUser } from '@/modules/auth/auth.types';

async function deleteTestOrder(orderId: string): Promise<void> {
  await deleteJobsForOrder(orderId);
  await db.shipmentTrackingEvent.deleteMany({ where: { shipment: { orderId } } });
  await db.shipment.deleteMany({ where: { orderId } });
  await db.payment.deleteMany({ where: { orderId } });
  await db.orderStatusHistory.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.delete({ where: { id: orderId } }).catch(() => {});
}

async function admin(): Promise<SessionUser> {
  return createTestUser({ role: 'admin' });
}

describe('shipment.service (via order.service.updateOrderStatusAdmin)', () => {
  it('creates a shipment on first entry into a shipment-relevant status, with carrier/tracking', async () => {
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
      await db.order.update({ where: { id: orderId }, data: { status: 'processing' } });

      const updated = await updateOrderStatusAdmin(adminUser, orderId, {
        status: 'packed',
        shipment: { carrier: 'BlueDart', trackingNumber: 'BD12345' },
      });

      expect(updated.shipment).not.toBeNull();
      expect(updated.shipment?.carrier).toBe('BlueDart');
      expect(updated.shipment?.trackingNumber).toBe('BD12345');
      expect(updated.shipment?.status).toBe('packed');
      expect(updated.shipment?.trackingEvents).toHaveLength(1);
      expect(updated.shipment?.trackingEvents[0].status).toBe('packed');

      const shipments = await db.shipment.findMany({ where: { orderId } });
      expect(shipments).toHaveLength(1);
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
      await deleteTestUser(adminUser.id);
    }
  });

  it('updates the same shipment (not a second one) and appends tracking events on later transitions', async () => {
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
      await db.order.update({ where: { id: orderId }, data: { status: 'processing' } });

      await updateOrderStatusAdmin(adminUser, orderId, {
        status: 'packed',
        shipment: { carrier: 'BlueDart', trackingNumber: 'BD12345' },
      });
      const afterShipped = await updateOrderStatusAdmin(adminUser, orderId, { status: 'shipped' });

      const shipments = await db.shipment.findMany({ where: { orderId } });
      expect(shipments).toHaveLength(1); // still just one shipment row
      expect(afterShipped.shipment?.status).toBe('shipped');
      expect(afterShipped.shipment?.carrier).toBe('BlueDart'); // carried over, not cleared
      expect(afterShipped.shipment?.trackingEvents).toHaveLength(2);

      const order = await getOrderForUser(user, orderId);
      expect(order.shipment?.trackingEvents.map((e) => e.status)).toEqual(['packed', 'shipped']);
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
      await deleteTestUser(adminUser.id);
    }
  });

  it('does not create a shipment for a non-shipment-relevant status change', async () => {
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

      const updated = await updateOrderStatusAdmin(adminUser, orderId, { status: 'processing' });
      expect(updated.shipment).toBeNull();
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
      await deleteTestUser(adminUser.id);
    }
  });
});
