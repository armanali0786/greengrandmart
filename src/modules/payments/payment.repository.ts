import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { PaymentStatus } from '@/modules/payments/payment.types';

type TxClient = Prisma.TransactionClient;

export interface PaymentRow {
  id: string;
  orderId: string;
  razorpayOrderId: string | null;
  status: string;
  amount: number;
}

/**
 * The most recent Payment row for an order — the "live" one a client-confirm
 * or webhook event should reconcile against. A retried payment creates a new
 * row rather than overwriting the old one, so old failed/abandoned attempts
 * stay in the audit trail (docs/Data_Model_DB_Schema.md's ON DELETE RESTRICT
 * rationale: never lose financial history).
 */
export async function findLatestPaymentForOrder(orderId: string): Promise<PaymentRow | null> {
  return db.payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
}

export async function findPaymentByRazorpayOrderId(
  razorpayOrderId: string,
): Promise<PaymentRow | null> {
  return db.payment.findFirst({ where: { razorpayOrderId } });
}

export async function createPaymentRow(params: {
  orderId: string;
  razorpayOrderId: string;
  amount: number;
}): Promise<PaymentRow> {
  return db.payment.create({
    data: {
      orderId: params.orderId,
      razorpayOrderId: params.razorpayOrderId,
      amount: params.amount,
      status: 'created',
    },
  });
}

export async function updatePaymentStatus(
  tx: TxClient | typeof db,
  paymentId: string,
  status: PaymentStatus,
): Promise<void> {
  await tx.payment.update({ where: { id: paymentId }, data: { status } });
}

export async function createPaymentAttemptRow(
  tx: TxClient | typeof db,
  params: {
    paymentId: string;
    razorpayPaymentId: string | null;
    razorpaySignature: string | null;
    status: string;
    rawResponse?: unknown;
  },
): Promise<void> {
  await tx.paymentAttempt.create({
    data: {
      paymentId: params.paymentId,
      razorpayPaymentId: params.razorpayPaymentId,
      razorpaySignature: params.razorpaySignature,
      status: params.status,
      rawResponse: params.rawResponse as Prisma.InputJsonValue | undefined,
    },
  });
}

/**
 * Idempotency guard (docs/Data_Model_DB_Schema.md UNIQUE(provider,
 * event_id)). Relies on the DB constraint racing safely under concurrency —
 * not a read-then-write check, which two concurrent webhook deliveries could
 * both pass. Returns the new row's id to process, or null if this event was
 * already recorded (caller should acknowledge 200 without reprocessing).
 */
export async function insertWebhookEventIfNew(params: {
  provider: string;
  eventId: string;
  eventType: string;
  payload: unknown;
}): Promise<string | null> {
  try {
    const row = await db.webhookEvent.create({
      data: {
        provider: params.provider,
        eventId: params.eventId,
        eventType: params.eventType,
        payload: params.payload as Prisma.InputJsonValue,
      },
    });
    return row.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null;
    throw e;
  }
}

export async function markWebhookEventProcessed(id: string): Promise<void> {
  await db.webhookEvent.update({ where: { id }, data: { processedAt: new Date() } });
}

/**
 * Used by the refunds module (never the reverse — Architecture.md §4: "refunds
 * calls payments, not the other way around") to find the actual Razorpay
 * payment id to refund against. The most recent *captured* attempt is
 * authoritative — a captured payment can't later become uncaptured, so
 * "most recent" and "the one that's actually captured" always agree.
 */
export async function findCapturedPaymentForOrder(
  orderId: string,
): Promise<{ paymentId: string; razorpayPaymentId: string } | null> {
  const attempt = await db.paymentAttempt.findFirst({
    where: { status: 'captured', payment: { orderId } },
    orderBy: { attemptedAt: 'desc' },
    select: { paymentId: true, razorpayPaymentId: true },
  });
  if (!attempt || !attempt.razorpayPaymentId) return null;
  return { paymentId: attempt.paymentId, razorpayPaymentId: attempt.razorpayPaymentId };
}
