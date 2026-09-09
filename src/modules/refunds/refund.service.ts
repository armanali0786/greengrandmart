import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { requireRole } from '@/modules/auth/auth.guard';
import type { SessionUser } from '@/modules/auth/auth.types';
import { withAudit } from '@/modules/admin/audit';
import * as orderRepo from '@/modules/orders/order.repository';
import { advanceOrderIfLegal } from '@/modules/orders/order.service';
import { InvalidOrderStateError } from '@/modules/orders/order.errors';
import { paymentProvider } from '@/modules/payments/payment-provider';
import * as paymentRepo from '@/modules/payments/payment.repository';
import * as repo from '@/modules/refunds/refund.repository';
import type { InitiateRefundInput, ListRefundsQuery } from '@/modules/refunds/refund.schema';
import type {
  AdminRefundSummary,
  RefundStatus,
  RefundType,
  RefundView,
} from '@/modules/refunds/refund.types';

function toRefundView(row: repo.RefundRow): RefundView {
  return {
    id: row.id,
    orderId: row.orderId,
    type: row.type as RefundType,
    amount: row.amount,
    status: row.status as RefundStatus,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAdminSummary(row: repo.AdminRefundRow): AdminRefundSummary {
  return {
    ...toRefundView(row),
    orderNumber: row.order.orderNumber,
    customerName: row.order.user.name,
    customerEmail: row.order.user.email,
  };
}

/**
 * docs/API_Spec.md `POST /admin/refunds`, admin-only (docs/Product_Spec_Requirements.md
 * §13.8: "staff role has no access to refunds initiation"). Money-correctness
 * guards beyond what the doc literally lists: refuses to exceed the order's
 * own grand total across all refunds ever issued against it, and refuses a
 * second refund while one is still pending/processing — matching the
 * documented duplicate-refund error exactly (same INVALID_ORDER_STATE code
 * docs/API_Spec.md shows for it).
 */
export async function initiateRefund(
  user: SessionUser,
  input: InitiateRefundInput,
): Promise<RefundView> {
  requireRole(user, ['admin']);

  const order = await orderRepo.findOrderById(input.orderId);
  if (!order) throw new NotFoundError('Order not found.');

  if (await repo.findActiveRefundForOrder(input.orderId)) {
    throw new InvalidOrderStateError('A refund is already in progress for this order.');
  }

  const captured = await paymentRepo.findCapturedPaymentForOrder(input.orderId);
  if (!captured) {
    throw new InvalidOrderStateError('This order has no captured payment to refund.');
  }

  const alreadyRefunded = await repo.sumRefundedForOrder(input.orderId);
  if (alreadyRefunded + input.amount > order.grandTotal) {
    throw new InvalidOrderStateError('Refund amount would exceed the order total.');
  }

  return withAudit({
    actorUserId: user.id,
    action: 'REFUND_INITIATED',
    entityType: 'refund',
    entityId: (r) => r.id,
    after: (r) => ({
      orderId: input.orderId,
      type: input.type,
      amount: input.amount,
      status: r.status,
    }),
    mutate: async () => {
      const created = await repo.createRefundRow({
        orderId: input.orderId,
        paymentId: captured.paymentId,
        type: input.type,
        amount: input.amount,
        reason: input.reason ?? null,
        createdBy: user.id,
      });

      // docs/Product_Spec_Requirements.md §8.2: idempotency key prevents a
      // network retry of this same admin action from double-refunding —
      // the refund row's own id is stable across retries of this call
      // (Razorpay would see the same key), unlike a freshly-generated UUID.
      const result = await paymentProvider.refundPayment({
        razorpayPaymentId: captured.razorpayPaymentId,
        amount: input.amount,
        idempotencyKey: created.id,
      });

      await repo.updateRefundStatusRow(created.id, 'processing', result.providerRefundId);

      // Only a full-order refund advances the whole order's own status —
      // see the Product_Spec_Requirements.md §8 addendum on why partial/
      // item/shipping refunds don't relabel an otherwise-still-delivered
      // order as globally "Refunded."
      if (input.type === 'full') {
        await db.$transaction((tx) =>
          advanceOrderIfLegal(tx, input.orderId, 'refund_pending', user.id, input.reason ?? null),
        );
      }

      return toRefundView({
        ...created,
        status: 'processing',
        providerRefundId: result.providerRefundId,
      });
    },
  });
}

export async function listRefundsForAdmin(
  user: SessionUser,
  query: ListRefundsQuery,
): Promise<{ items: AdminRefundSummary[]; page: number; limit: number; total: number }> {
  requireRole(user, ['admin']);
  const { rows, total } = await repo.findRefundsForAdmin(query);
  return { items: rows.map(toAdminSummary), page: query.page, limit: query.limit, total };
}

/**
 * Called from payment.service's webhook dispatcher on `refund.processed` /
 * `refund.failed` events — the payments module owns the one webhook
 * endpoint for the whole Razorpay integration, so it routes refund-specific
 * events here rather than duplicating refund state logic in `payments`.
 * Idempotent the same way payment webhooks are: the caller already checked
 * `webhook_events` before this runs, so this only needs to handle "the
 * refund row is already in its terminal state" gracefully (a second delivery
 * of the same logical event, or a slightly-early duplicate).
 */
export async function handleRefundWebhookEvent(params: {
  providerRefundId: string;
  status: 'processed' | 'failed';
  changedBy: string | null;
}): Promise<void> {
  const refund = await repo.findRefundByProviderRefundId(params.providerRefundId);
  if (!refund || refund.status === 'completed' || refund.status === 'failed') return;

  const nextStatus: RefundStatus = params.status === 'processed' ? 'completed' : 'failed';
  await repo.updateRefundStatusRow(refund.id, nextStatus);

  if (nextStatus === 'completed' && (refund.type as RefundType) === 'full') {
    await db.$transaction((tx) =>
      advanceOrderIfLegal(
        tx,
        refund.orderId,
        'refunded',
        params.changedBy,
        'Refund completed (Razorpay webhook).',
      ),
    );
  }
}
