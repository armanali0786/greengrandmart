import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createTestUser, deleteTestUser } from '../../fixtures/users';
import { createTestAddress } from '../../fixtures/addresses';
import { createTestVariant, deleteTestProduct } from '../../fixtures/catalog';
import { addItem } from '@/modules/cart/cart.service';
import { createOrder } from '@/modules/orders/checkout.service';
import { ensureInvoiceForOrder, getInvoiceDownloadUrl } from '@/modules/invoices/invoice.service';

async function deleteTestOrder(orderId: string): Promise<void> {
  await db.invoice.deleteMany({ where: { orderId } });
  await db.payment.deleteMany({ where: { orderId } });
  await db.orderStatusHistory.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.delete({ where: { id: orderId } }).catch(() => {});
}

describe('invoice.service.ensureInvoiceForOrder', () => {
  it('generates a PDF, uploads it, and records exactly one invoice row', async () => {
    const user = await createTestUser();
    const address = await createTestAddress(user.id);
    const { productId, variantId } = await createTestVariant(5, { price: 25000, gstRate: 18 });
    let orderId: string | undefined;
    try {
      await addItem({ userId: user.id }, { variantId, quantity: 2 });
      const result = await createOrder(user, {
        shippingAddressId: address.id,
        paymentMethod: 'online',
      });
      orderId = result.orderId;

      await ensureInvoiceForOrder(orderId);
      const invoice = await db.invoice.findUniqueOrThrow({ where: { orderId } });
      expect(invoice.storagePath).toBe(`invoices/${orderId}.pdf`);

      // Idempotent — a second call is a no-op, not a second row/upload.
      await ensureInvoiceForOrder(orderId);
      const invoices = await db.invoice.findMany({ where: { orderId } });
      expect(invoices).toHaveLength(1);
      expect(invoices[0].id).toBe(invoice.id);

      const url = await getInvoiceDownloadUrl(user, orderId);
      expect(url).toBeTruthy();
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('getInvoiceDownloadUrl throws for an order with no invoice yet', async () => {
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

      await expect(getInvoiceDownloadUrl(user, orderId)).rejects.toThrow();
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });
});
