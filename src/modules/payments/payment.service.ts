import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { requireOwnership } from '@/modules/auth/auth.guard';
import type { SessionUser } from '@/modules/auth/auth.types';
import { InvalidOrderStateError } from '@/modules/orders/order.errors';
import * as orderRepo from '@/modules/orders/order.repository';
import { canTransition } from '@/modules/orders/order-status-machine';
import type { OrderStatus } from '@/modules/orders/order.types';
import { convertReservationsForOrder } from '@/modules/inventory/inventory.service';
import { paymentProvider } from '@/modules/payments/payment-provider';
import { verifyPaymentSignature, verifyWebhookSignature } from '@/modules/payments/signature';
import { PaymentVerificationError } from '@/modules/payments/payment.errors';
import * as repo from '@/modules/payments/payment.repository';
import type { ConfirmPaymentInput } from '@/modules/payments/payment.schema';

// ── Client-confirm (necessary, not sufficient) ─────────────────────────────

export interface ConfirmPaymentResult {
  status: 'pending_confirmation';
}

/**
 * docs/API_Spec.md `POST /checkout/confirm` + Security.md §7: verifies the
 * Razorpay Checkout widget's success callback client-side. This can NEVER
 * move the order to 'confirmed' — docs/AGENTS.md §3 rule 5: only the
 * webhook (processWebhookEvent below) may do that. This just records that a
 * plausible payment happened, so a failed check here is logged as a failed
 * attempt rather than trusted.
 */
export async function confirmPayment(
  user: SessionUser,
  input: ConfirmPaymentInput,
): Promise<ConfirmPaymentResult> {
  const order = await orderRepo.findOrderById(input.orderId);
  if (!order) throw new NotFoundError('Order not found.');
  requireOwnership(user, order.userId);
  if (order.status !== 'pending_payment') {
    throw new InvalidOrderStateError(
      `This order is '${order.status}' and can't accept a new payment confirmation.`,
    );
  }

  const payment = await repo.findLatestPaymentForOrder(input.orderId);
  if (!payment || !payment.razorpayOrderId) {
    throw new NotFoundError('No payment attempt found for this order.');
  }

  const valid = verifyPaymentSignature({
    razorpayOrderId: payment.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    razorpaySignature: input.razorpaySignature,
  });

  await repo.createPaymentAttemptRow(db, {
    paymentId: payment.id,
    razorpayPaymentId: input.razorpayPaymentId,
    razorpaySignature: input.razorpaySignature,
    status: valid ? 'pending' : 'failed',
  });

  if (!valid) {
    throw new PaymentVerificationError();
  }

  await repo.updatePaymentStatus(db, payment.id, 'pending');
  return { status: 'pending_confirmation' };
}

// ── Retry ───────────────────────────────────────────────────────────────

export interface RetryPaymentResult {
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  keyId: string;
}

/**
 * docs/Product_Spec_Requirements.md §6.2: "customer can retry payment (new
 * payment attempt against the same order)." Only while the order is still
 * pending_payment — once the reservation-expiry cron sweep flips it to the
 * terminal payment_failed, the customer starts a new checkout instead (see
 * order-status-machine.ts). Creates a fresh Payment row rather than mutating
 * the failed one, at the order's own already-priced grandTotal — never
 * re-priced here, since the order snapshot is authoritative.
 */
export async function retryPayment(
  user: SessionUser,
  orderId: string,
): Promise<RetryPaymentResult> {
  const order = await orderRepo.findOrderById(orderId);
  if (!order) throw new NotFoundError('Order not found.');
  requireOwnership(user, order.userId);
  if (order.status !== 'pending_payment') {
    throw new InvalidOrderStateError(
      `This order is '${order.status}' — payment can no longer be retried.`,
    );
  }

  const payment = await paymentProvider.createPayment({
    orderId: order.id,
    amount: order.grandTotal,
  });
  const created = await repo.createPaymentRow({
    orderId: order.id,
    razorpayOrderId: payment.providerOrderId,
    amount: order.grandTotal,
  });

  return {
    orderId: order.id,
    razorpayOrderId: created.razorpayOrderId!,
    amount: created.amount,
    keyId: payment.keyId,
  };
}

// ── Webhook (the only path to 'confirmed') ─────────────────────────────────

const WEBHOOK_PROVIDER = 'razorpay';

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  status: string;
}

interface RazorpayWebhookPayload {
  id?: string;
  event: string;
  payload: {
    payment?: { entity: RazorpayPaymentEntity };
  };
}

export interface WebhookProcessResult {
  ok: true;
  reason?: 'duplicate' | 'processing_error';
}

/**
 * docs/Architecture.md §5.2 step 4 + Security.md §7 + AGENTS.md §3 rule 5:
 * the single path that can move an order pending_payment → confirmed.
 * `rawBody` must be the untouched request body text — signature is checked
 * against it before any JSON parsing, per docs/API_Spec.md §6. Idempotent
 * via `webhook_events` (provider, event_id): a duplicate delivery is
 * acknowledged but never reprocessed (docs/Product_Spec_Requirements.md
 * §6.3 acceptance criteria).
 */
export async function processWebhookEvent(
  rawBody: string,
  signatureHeader: string | null,
): Promise<WebhookProcessResult> {
  if (!verifyWebhookSignature(rawBody, signatureHeader)) {
    throw new PaymentVerificationError('Webhook signature verification failed.');
  }

  let body: RazorpayWebhookPayload;
  try {
    body = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    throw new PaymentVerificationError('Malformed webhook payload.');
  }

  // Razorpay includes a top-level event id (`evt_...`) on real deliveries;
  // fall back to a composite key only for malformed/synthetic payloads that
  // omit it, so idempotency still degrades safely rather than throwing.
  const eventId = body.id ?? `${body.event}:${body.payload?.payment?.entity?.id ?? 'unknown'}`;

  const webhookEventId = await repo.insertWebhookEventIfNew({
    provider: WEBHOOK_PROVIDER,
    eventId,
    eventType: body.event,
    payload: body,
  });
  if (!webhookEventId) {
    return { ok: true, reason: 'duplicate' };
  }

  try {
    await handleEvent(body);
    await repo.markWebhookEventProcessed(webhookEventId);
  } catch (e) {
    // Never surface a processing failure as a non-200 to Razorpay
    // (docs/API_Spec.md §6: "always responds 200 OK quickly ... the one
    // exception is signature failure"). processedAt stays null, which is
    // exactly the signal docs/Security.md §13's reconciliation job (Phase
    // 12, not built yet) is meant to flag for manual review — not silently
    // swallowed.
    console.error('Webhook processing failed', e);
    return { ok: true, reason: 'processing_error' };
  }

  return { ok: true };
}

async function handleEvent(body: RazorpayWebhookPayload): Promise<void> {
  switch (body.event) {
    case 'payment.captured':
      return handlePaymentCaptured(body);
    case 'payment.authorized':
      return handlePaymentAuthorized(body);
    case 'payment.failed':
      return handlePaymentFailed(body);
    default:
      // Includes refund.* events — refunds are Phase 8's module
      // (modules/refunds calling payments.refundPayment(), per
      // Architecture.md §4's dependency graph). The webhook_events row is
      // already recorded above for idempotency/audit; nothing more to do
      // until that module exists. Any other/unrecognized event type is
      // likewise safely ignored — Razorpay adds new event types over time
      // and an unhandled one must never fail the webhook.
      return;
  }
}

async function handlePaymentCaptured(body: RazorpayWebhookPayload): Promise<void> {
  const entity = body.payload.payment?.entity;
  if (!entity) return;
  const payment = await repo.findPaymentByRazorpayOrderId(entity.order_id);
  if (!payment) {
    console.error(`payment.captured webhook for unknown razorpay_order_id ${entity.order_id}`);
    return;
  }

  await db.$transaction(async (tx) => {
    const order = await orderRepo.findOrderByIdForUpdate(tx, payment.orderId);
    if (!order) return;
    const fromStatus = order.status as OrderStatus;
    // Belt-and-suspenders beyond the webhook_events uniqueness check: a
    // second captured-style event for an already-confirmed order (or any
    // order no longer in pending_payment) must not double-confirm it or
    // double-convert its reservations.
    if (fromStatus !== 'pending_payment' || !canTransition(fromStatus, 'confirmed')) return;

    await repo.updatePaymentStatus(tx, payment.id, 'captured');
    await repo.createPaymentAttemptRow(tx, {
      paymentId: payment.id,
      razorpayPaymentId: entity.id,
      razorpaySignature: null,
      status: 'captured',
      rawResponse: body,
    });
    await orderRepo.updateOrderStatusRow(tx, payment.orderId, 'confirmed');
    await orderRepo.createStatusHistoryRow(tx, {
      orderId: payment.orderId,
      fromStatus,
      toStatus: 'confirmed',
      changedBy: null,
      note: 'Payment captured (Razorpay webhook).',
    });
    await convertReservationsForOrder(tx, payment.orderId);
  });
}

async function handlePaymentAuthorized(body: RazorpayWebhookPayload): Promise<void> {
  const entity = body.payload.payment?.entity;
  if (!entity) return;
  const payment = await repo.findPaymentByRazorpayOrderId(entity.order_id);
  if (!payment) return;

  // Standard Razorpay Checkout auto-captures, so this rarely fires in
  // practice — recorded for completeness but deliberately doesn't confirm
  // the order; only 'captured' does.
  await db.$transaction(async (tx) => {
    await repo.updatePaymentStatus(tx, payment.id, 'authorized');
    await repo.createPaymentAttemptRow(tx, {
      paymentId: payment.id,
      razorpayPaymentId: entity.id,
      razorpaySignature: null,
      status: 'authorized',
      rawResponse: body,
    });
  });
}

async function handlePaymentFailed(body: RazorpayWebhookPayload): Promise<void> {
  const entity = body.payload.payment?.entity;
  if (!entity) return;
  const payment = await repo.findPaymentByRazorpayOrderId(entity.order_id);
  if (!payment) return;

  // Deliberately does NOT touch orders.status — see the AGENTS.md §9
  // addendum this phase added: the order stays pending_payment (reservation
  // still live) so the customer can retry with a new payment attempt
  // against the same order, matching Product_Spec_Requirements.md §6.2. It
  // only ever reaches the terminal payment_failed via the reservation-expiry
  // cron sweep (reservation-sweep.service.ts), never directly from a single
  // failed payment attempt.
  await db.$transaction(async (tx) => {
    await repo.updatePaymentStatus(tx, payment.id, 'failed');
    await repo.createPaymentAttemptRow(tx, {
      paymentId: payment.id,
      razorpayPaymentId: entity.id,
      razorpaySignature: null,
      status: 'failed',
      rawResponse: body,
    });
  });
}
