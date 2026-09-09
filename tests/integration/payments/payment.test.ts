import { createHmac } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { env } from '@/config/env';
import { createTestUser, deleteTestUser } from '../../fixtures/users';
import { createTestAddress } from '../../fixtures/addresses';
import { createTestVariant, deleteTestProduct } from '../../fixtures/catalog';
import { addItem } from '@/modules/cart/cart.service';
import { createOrder } from '@/modules/orders/checkout.service';
import {
  confirmPayment,
  processWebhookEvent,
  retryPayment,
} from '@/modules/payments/payment.service';
import { PaymentVerificationError } from '@/modules/payments/payment.errors';
import { InvalidOrderStateError } from '@/modules/orders/order.errors';
import { ForbiddenError } from '@/modules/auth/auth.errors';

async function deleteTestOrder(orderId: string): Promise<void> {
  await db.paymentAttempt.deleteMany({ where: { payment: { orderId } } });
  await db.payment.deleteMany({ where: { orderId } });
  await db.couponRedemption.deleteMany({ where: { orderId } });
  await db.inventoryReservation.deleteMany({ where: { orderId } });
  await db.orderStatusHistory.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.delete({ where: { id: orderId } }).catch(() => {});
}

function paymentSignature(razorpayOrderId: string, razorpayPaymentId: string): string {
  return createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
}

function webhookBody(event: string, razorpayOrderId: string, razorpayPaymentId: string): string {
  return JSON.stringify({
    id: `evt_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
    event,
    payload: {
      payment: {
        entity: { id: razorpayPaymentId, order_id: razorpayOrderId, amount: 1, status: event },
      },
    },
  });
}

function webhookSignature(rawBody: string): string {
  return createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
}

async function setupOrder(quantity = 1, price = 50000) {
  const user = await createTestUser();
  const address = await createTestAddress(user.id);
  const { productId, variantId } = await createTestVariant(10, { price });
  await addItem({ userId: user.id }, { variantId, quantity });
  const result = await createOrder(user, {
    shippingAddressId: address.id,
    paymentMethod: 'online',
  });
  return { user, address, productId, variantId, result };
}

describe('payment.service.confirmPayment', () => {
  it('accepts a validly signed payment and records a pending attempt, without confirming the order', async () => {
    const { user, productId, result } = await setupOrder();
    try {
      const payment = await db.payment.findFirstOrThrow({ where: { orderId: result.orderId } });
      const razorpayPaymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const signature = paymentSignature(payment.razorpayOrderId!, razorpayPaymentId);

      const confirmed = await confirmPayment(user, {
        orderId: result.orderId,
        razorpayPaymentId,
        razorpaySignature: signature,
      });
      expect(confirmed.status).toBe('pending_confirmation');

      const updatedPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(updatedPayment.status).toBe('pending'); // NOT 'captured' — only the webhook can do that

      const order = await db.order.findUniqueOrThrow({ where: { id: result.orderId } });
      expect(order.status).toBe('pending_payment'); // unchanged

      const attempts = await db.paymentAttempt.findMany({ where: { paymentId: payment.id } });
      expect(attempts).toHaveLength(1);
      expect(attempts[0].status).toBe('pending');
    } finally {
      await deleteTestOrder(result.orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('rejects an invalid signature and records a failed attempt', async () => {
    const { user, productId, result } = await setupOrder();
    try {
      const payment = await db.payment.findFirstOrThrow({ where: { orderId: result.orderId } });

      await expect(
        confirmPayment(user, {
          orderId: result.orderId,
          razorpayPaymentId: 'pay_forged',
          razorpaySignature: 'deadbeef00',
        }),
      ).rejects.toThrow(PaymentVerificationError);

      const attempts = await db.paymentAttempt.findMany({ where: { paymentId: payment.id } });
      expect(attempts).toHaveLength(1);
      expect(attempts[0].status).toBe('failed');

      const order = await db.order.findUniqueOrThrow({ where: { id: result.orderId } });
      expect(order.status).toBe('pending_payment');
    } finally {
      await deleteTestOrder(result.orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it("rejects confirming another customer's order", async () => {
    const { productId, result } = await setupOrder();
    const attacker = await createTestUser();
    try {
      await expect(
        confirmPayment(attacker, {
          orderId: result.orderId,
          razorpayPaymentId: 'pay_x',
          razorpaySignature: 'ab',
        }),
      ).rejects.toThrow(ForbiddenError);
    } finally {
      await deleteTestOrder(result.orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(attacker.id);
    }
  });
});

describe('payment.service.retryPayment', () => {
  it('creates a new Payment row against the same order while still pending_payment', async () => {
    const { user, productId, result } = await setupOrder();
    try {
      const retried = await retryPayment(user, result.orderId);
      expect(retried.razorpayOrderId).toBeTruthy();
      expect(retried.razorpayOrderId).not.toBe(result.razorpayOrderId);

      const payments = await db.payment.findMany({ where: { orderId: result.orderId } });
      expect(payments).toHaveLength(2);
    } finally {
      await deleteTestOrder(result.orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('refuses to retry an order that is no longer pending_payment', async () => {
    const { user, productId, result } = await setupOrder();
    try {
      await db.order.update({ where: { id: result.orderId }, data: { status: 'cancelled' } });
      await expect(retryPayment(user, result.orderId)).rejects.toThrow(InvalidOrderStateError);
    } finally {
      await deleteTestOrder(result.orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });
});

describe('payment.service.processWebhookEvent', () => {
  it('rejects a badly signed webhook before any processing', async () => {
    const body = webhookBody('payment.captured', 'order_x', 'pay_x');
    const parsedId = (JSON.parse(body) as { id: string }).id;

    await expect(processWebhookEvent(body, 'not-a-real-signature')).rejects.toThrow(
      PaymentVerificationError,
    );
    await expect(processWebhookEvent(body, null)).rejects.toThrow(PaymentVerificationError);

    // Signature verification must happen strictly before any DB write —
    // nothing was ever recorded for this forged body.
    const event = await db.webhookEvent.findFirst({ where: { eventId: parsedId } });
    expect(event).toBeNull();
  });

  it('payment.captured confirms the order and converts the reservation to a sale', async () => {
    const { user, productId, variantId, result } = await setupOrder(3, 20000);
    try {
      const payment = await db.payment.findFirstOrThrow({ where: { orderId: result.orderId } });
      const razorpayPaymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const body = webhookBody('payment.captured', payment.razorpayOrderId!, razorpayPaymentId);
      const signature = webhookSignature(body);

      const outcome = await processWebhookEvent(body, signature);
      expect(outcome.ok).toBe(true);
      expect(outcome.reason).toBeUndefined();

      const order = await db.order.findUniqueOrThrow({ where: { id: result.orderId } });
      expect(order.status).toBe('confirmed');

      const history = await db.orderStatusHistory.findMany({ where: { orderId: result.orderId } });
      expect(history.some((h) => h.toStatus === 'confirmed')).toBe(true);

      const updatedPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(updatedPayment.status).toBe('captured');

      const inv = await db.inventory.findUniqueOrThrow({ where: { variantId } });
      expect(inv.reservedQty).toBe(0);
      expect(inv.soldQty).toBe(3);
      expect(inv.availableQty).toBe(7); // unchanged by conversion — already decremented at reserve time

      const reservation = await db.inventoryReservation.findFirstOrThrow({
        where: { orderId: result.orderId },
      });
      expect(reservation.status).toBe('converted');
    } finally {
      await deleteTestOrder(result.orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('a duplicate webhook delivery (same event id) is acknowledged but not reprocessed', async () => {
    const { user, productId, variantId, result } = await setupOrder();
    try {
      const payment = await db.payment.findFirstOrThrow({ where: { orderId: result.orderId } });
      const razorpayPaymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const body = webhookBody('payment.captured', payment.razorpayOrderId!, razorpayPaymentId);
      const signature = webhookSignature(body);

      const first = await processWebhookEvent(body, signature);
      expect(first.reason).toBeUndefined();
      const second = await processWebhookEvent(body, signature);
      expect(second.reason).toBe('duplicate');

      const history = await db.orderStatusHistory.findMany({
        where: { orderId: result.orderId, toStatus: 'confirmed' },
      });
      expect(history).toHaveLength(1); // exactly one state change, not two

      const inv = await db.inventory.findUniqueOrThrow({ where: { variantId } });
      expect(inv.soldQty).toBe(1); // not double-converted
    } finally {
      await deleteTestOrder(result.orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('payment.failed records the failure but leaves the order pending_payment so it can be retried', async () => {
    const { user, productId, variantId, result } = await setupOrder();
    try {
      const payment = await db.payment.findFirstOrThrow({ where: { orderId: result.orderId } });
      const razorpayPaymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const body = webhookBody('payment.failed', payment.razorpayOrderId!, razorpayPaymentId);
      const signature = webhookSignature(body);

      await processWebhookEvent(body, signature);

      const order = await db.order.findUniqueOrThrow({ where: { id: result.orderId } });
      expect(order.status).toBe('pending_payment'); // NOT flipped to payment_failed directly

      const updatedPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(updatedPayment.status).toBe('failed');

      const inv = await db.inventory.findUniqueOrThrow({ where: { variantId } });
      expect(inv.reservedQty).toBe(1); // reservation untouched — still retryable
    } finally {
      await deleteTestOrder(result.orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('an unrecognized event type (e.g. a future refund.* event) is safely ignored, not an error', async () => {
    const { user, productId, result } = await setupOrder();
    try {
      const payment = await db.payment.findFirstOrThrow({ where: { orderId: result.orderId } });
      const body = webhookBody('refund.processed', payment.razorpayOrderId!, 'pay_irrelevant');
      const signature = webhookSignature(body);

      const outcome = await processWebhookEvent(body, signature);
      expect(outcome.ok).toBe(true);

      const order = await db.order.findUniqueOrThrow({ where: { id: result.orderId } });
      expect(order.status).toBe('pending_payment');

      const event = await db.webhookEvent.findFirst({ where: { eventType: 'refund.processed' } });
      expect(event).not.toBeNull();
      expect(event?.processedAt).not.toBeNull(); // recorded and marked processed even though it's a no-op
    } finally {
      await deleteTestOrder(result.orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('payment.captured is a no-op once the order is already confirmed (defense in depth beyond event-id idempotency)', async () => {
    const { user, productId, result } = await setupOrder();
    try {
      await db.order.update({ where: { id: result.orderId }, data: { status: 'confirmed' } });
      const payment = await db.payment.findFirstOrThrow({ where: { orderId: result.orderId } });
      const razorpayPaymentId = `pay_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
      // A different event id than any prior one — simulates a second,
      // distinct captured-style event, not a literal duplicate delivery.
      const body = webhookBody('payment.captured', payment.razorpayOrderId!, razorpayPaymentId);
      const signature = webhookSignature(body);

      await processWebhookEvent(body, signature);

      const history = await db.orderStatusHistory.findMany({
        where: { orderId: result.orderId, toStatus: 'confirmed' },
      });
      expect(history).toHaveLength(0); // the only 'confirmed' row would come from this handler, and it correctly declined to write one
    } finally {
      await deleteTestOrder(result.orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });
});
