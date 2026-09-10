import { createHmac, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { env } from '@/config/env';
import { createTestUser, deleteTestUser } from '../../fixtures/users';
import { createTestAddress } from '../../fixtures/addresses';
import { createTestVariant, deleteTestProduct } from '../../fixtures/catalog';
import { deleteJobsForOrder } from '../../fixtures/jobs';
import { addItem } from '@/modules/cart/cart.service';
import { createOrder } from '@/modules/orders/checkout.service';
import { processWebhookEvent } from '@/modules/payments/payment.service';
import { initiateRefund } from '@/modules/refunds/refund.service';
import { InvalidOrderStateError } from '@/modules/orders/order.errors';
import { ForbiddenError } from '@/modules/auth/auth.errors';
import type { SessionUser } from '@/modules/auth/auth.types';

async function deleteTestOrder(orderId: string): Promise<void> {
  await deleteJobsForOrder(orderId);
  await db.invoice.deleteMany({ where: { orderId } });
  await db.refund.deleteMany({ where: { orderId } });
  await db.paymentAttempt.deleteMany({ where: { payment: { orderId } } });
  await db.payment.deleteMany({ where: { orderId } });
  await db.orderStatusHistory.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.delete({ where: { id: orderId } }).catch(() => {});
}

async function admin(): Promise<SessionUser> {
  return createTestUser({ role: 'admin' });
}
async function staff(): Promise<SessionUser> {
  return createTestUser({ role: 'staff' });
}

function webhookSignature(rawBody: string): string {
  return createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
}

/** Creates an order and, via the real webhook handler, captures its payment — the only legitimate way this codebase ever reaches a captured PaymentAttempt (needed for a refund to have something to refund against). */
async function setupCapturedOrder(quantity = 1, price = 10000) {
  const user = await createTestUser();
  const address = await createTestAddress(user.id);
  const { productId, variantId } = await createTestVariant(10, { price });
  await addItem({ userId: user.id }, { variantId, quantity });
  const result = await createOrder(user, {
    shippingAddressId: address.id,
    paymentMethod: 'online',
  });

  const payment = await db.payment.findFirstOrThrow({ where: { orderId: result.orderId } });
  const razorpayPaymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const body = JSON.stringify({
    id: `evt_${randomUUID().replace(/-/g, '')}`,
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: razorpayPaymentId,
          order_id: payment.razorpayOrderId,
          amount: result.amount,
          status: 'captured',
        },
      },
    },
  });
  await processWebhookEvent(body, webhookSignature(body));

  return { user, productId, variantId, orderId: result.orderId, grandTotal: result.amount };
}

describe('refund.service.initiateRefund', () => {
  it('creates a processing refund and advances a full-order refund past return_requested→return_approved→returned→refund_pending', async () => {
    const { user, productId, orderId, grandTotal } = await setupCapturedOrder();
    const adminUser = await admin();
    try {
      // Walk the order to 'returned' — the only order status a full refund
      // can legally advance from, per order-status-machine.ts.
      await db.order.update({ where: { id: orderId }, data: { status: 'returned' } });

      const refund = await initiateRefund(adminUser, {
        orderId,
        type: 'full',
        amount: grandTotal,
        reason: 'Customer changed mind',
      });
      expect(refund.status).toBe('processing');
      expect(refund.amount).toBe(grandTotal);

      const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('refund_pending');

      const dbRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
      expect(dbRefund.providerRefundId).toBeTruthy();
    } finally {
      await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
      await deleteTestUser(adminUser.id);
    }
  });

  it('a partial refund does not relabel the order as globally refund_pending', async () => {
    const { user, productId, orderId, grandTotal } = await setupCapturedOrder(1, 30000);
    const adminUser = await admin();
    try {
      // Order stays 'confirmed' — a partial/item refund shouldn't touch it.
      const refund = await initiateRefund(adminUser, {
        orderId,
        type: 'partial',
        amount: Math.floor(grandTotal / 3),
      });
      expect(refund.status).toBe('processing');

      const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('confirmed');
    } finally {
      await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
      await deleteTestUser(adminUser.id);
    }
  });

  it('refuses a second refund while one is already in progress', async () => {
    const { user, productId, orderId } = await setupCapturedOrder();
    const adminUser = await admin();
    try {
      await initiateRefund(adminUser, { orderId, type: 'partial', amount: 1000 });
      await expect(
        initiateRefund(adminUser, { orderId, type: 'partial', amount: 1000 }),
      ).rejects.toThrow(InvalidOrderStateError);
    } finally {
      await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
      await deleteTestUser(adminUser.id);
    }
  });

  it('refuses a refund amount that would exceed the order total', async () => {
    const { user, productId, orderId, grandTotal } = await setupCapturedOrder();
    const adminUser = await admin();
    try {
      await expect(
        initiateRefund(adminUser, { orderId, type: 'full', amount: grandTotal + 1 }),
      ).rejects.toThrow(InvalidOrderStateError);
    } finally {
      await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
      await deleteTestUser(adminUser.id);
    }
  });

  it('refuses a refund against an order with no captured payment', async () => {
    const user = await createTestUser();
    const address = await createTestAddress(user.id);
    const { productId, variantId } = await createTestVariant(5, { price: 10000 });
    const adminUser = await admin();
    let orderId: string | undefined;
    try {
      await addItem({ userId: user.id }, { variantId, quantity: 1 });
      const result = await createOrder(user, {
        shippingAddressId: address.id,
        paymentMethod: 'online',
      });
      orderId = result.orderId;

      await expect(
        initiateRefund(adminUser, { orderId, type: 'full', amount: result.amount }),
      ).rejects.toThrow(InvalidOrderStateError);
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
      await deleteTestUser(adminUser.id);
    }
  });

  it('staff cannot initiate a refund — admin only', async () => {
    const { user, productId, orderId, grandTotal } = await setupCapturedOrder();
    const staffUser = await staff();
    try {
      await expect(
        initiateRefund(staffUser, { orderId, type: 'full', amount: grandTotal }),
      ).rejects.toThrow(ForbiddenError);
    } finally {
      await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
      await deleteTestUser(staffUser.id);
    }
  });
});

describe('refund webhook (refund.processed via the real payments webhook route)', () => {
  it('marks the refund completed and, for a full refund, moves the order to refunded', async () => {
    const { user, productId, orderId, grandTotal } = await setupCapturedOrder();
    const adminUser = await admin();
    try {
      await db.order.update({ where: { id: orderId }, data: { status: 'returned' } });
      const refund = await initiateRefund(adminUser, { orderId, type: 'full', amount: grandTotal });
      const dbRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });

      const body = JSON.stringify({
        id: `evt_${randomUUID().replace(/-/g, '')}`,
        event: 'refund.processed',
        payload: {
          refund: {
            entity: {
              id: dbRefund.providerRefundId,
              payment_id: 'irrelevant_here',
              amount: grandTotal,
              status: 'processed',
            },
          },
        },
      });
      const outcome = await processWebhookEvent(body, webhookSignature(body));
      expect(outcome.ok).toBe(true);

      const updatedRefund = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
      expect(updatedRefund.status).toBe('completed');

      const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('refunded');
    } finally {
      await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
      await deleteTestUser(adminUser.id);
    }
  });

  it('an unrecognized providerRefundId is safely ignored (out-of-order/unrelated delivery)', async () => {
    const body = JSON.stringify({
      id: `evt_${randomUUID().replace(/-/g, '')}`,
      event: 'refund.processed',
      payload: {
        refund: { entity: { id: 'rfnd_unknown', payment_id: 'x', amount: 1, status: 'processed' } },
      },
    });
    const outcome = await processWebhookEvent(body, webhookSignature(body));
    expect(outcome.ok).toBe(true);
  });
});
