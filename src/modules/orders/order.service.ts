import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { requireOwnership, requireRole } from '@/modules/auth/auth.guard';
import type { SessionUser } from '@/modules/auth/auth.types';
import { releaseReservationsForOrder } from '@/modules/inventory/inventory.service';
import { getShipmentView, recordShipmentProgress } from '@/modules/shipping/shipment.service';
import { findReturnsForOrder } from '@/modules/returns/return.repository';
import { withAudit } from '@/modules/admin/audit';
import * as jobService from '@/modules/jobs/job.service';
import type { NotificationTrigger } from '@/modules/jobs/job.types';
import * as repo from '@/modules/orders/order.repository';
import type {
  AdminOrderListRow,
  OrderDetailRow,
  OrderListRow,
} from '@/modules/orders/order.repository';
import { InvalidOrderStateError } from '@/modules/orders/order.errors';
import {
  canAdminTransition,
  canTransition,
  isCustomerCancelable,
} from '@/modules/orders/order-status-machine';
import type { ListOrdersQuery, UpdateOrderStatusInput } from '@/modules/orders/order.schema';
import type {
  AddressSnapshot,
  AdminOrderSummary,
  OrderDetail,
  OrderStatus,
  OrderSummary,
} from '@/modules/orders/order.types';

/** docs/Product_Spec_Requirements.md §10.1's trigger list — every order status the customer should hear about by email/push; anything not listed here (e.g. cancel_requested, return_requested/approved — the latter two have their own return.service.ts triggers) doesn't get a job. */
const STATUS_TO_TRIGGER: Partial<Record<OrderStatus, NotificationTrigger>> = {
  processing: 'order_processing',
  packed: 'order_packed',
  shipped: 'order_shipped',
  out_for_delivery: 'order_out_for_delivery',
  delivered: 'order_delivered',
  cancelled: 'order_cancelled',
};

async function enqueueStatusNotification(
  orderId: string,
  userId: string,
  status: OrderStatus,
): Promise<void> {
  const trigger = STATUS_TO_TRIGGER[status];
  if (!trigger) return;
  try {
    await jobService.enqueue('send_email', { trigger, userId, orderId });
    await jobService.enqueue('send_push', { trigger, userId, orderId });
  } catch (e) {
    console.error(`Failed to enqueue ${trigger} notification for order ${orderId}`, e);
  }
}

function toOrderSummary(row: OrderListRow): OrderSummary {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status as OrderStatus,
    grandTotal: row.grandTotal,
    placedAt: row.placedAt.toISOString(),
    firstItemName: row.items[0]?.productNameSnapshot ?? null,
    itemCount: row._count.items,
  };
}

async function toOrderDetail(row: OrderDetailRow): Promise<OrderDetail> {
  const status = row.status as OrderStatus;
  const [shipment, returns] = await Promise.all([
    getShipmentView(row.id),
    findReturnsForOrder(row.id),
  ]);
  // Most recent return per item — an item can only ever have one active
  // return at a time (return.service.ts's findActiveReturnForItem), but a
  // rejected one doesn't block the display of a later attempt existing.
  const returnStatusByItem = new Map<string, string>();
  for (const r of [...returns].reverse()) {
    returnStatusByItem.set(r.orderItemId, r.status);
  }
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status,
    subtotal: row.subtotal,
    discountTotal: row.discountTotal,
    couponDiscount: row.couponDiscount,
    shippingFee: row.shippingFee,
    taxTotal: row.taxTotal,
    grandTotal: row.grandTotal,
    shippingAddress: row.shippingAddress as unknown as AddressSnapshot,
    billingAddress: row.billingAddress as unknown as AddressSnapshot,
    placedAt: row.placedAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productNameSnapshot: item.productNameSnapshot,
      skuSnapshot: item.skuSnapshot,
      variantAttrsSnapshot: item.variantAttrsSnapshot as Record<string, string>,
      unitPrice: item.unitPrice,
      discount: item.discount,
      taxAmount: item.taxAmount,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
      returnStatus: returnStatusByItem.get(item.id) ?? null,
    })),
    statusHistory: row.statusHistory.map((h) => ({
      fromStatus: h.fromStatus as OrderStatus | null,
      toStatus: h.toStatus as OrderStatus,
      note: h.note,
      createdAt: h.createdAt.toISOString(),
    })),
    shipment,
    canCancel: isCustomerCancelable(status),
  };
}

function toAdminOrderSummary(row: AdminOrderListRow): AdminOrderSummary {
  return { ...toOrderSummary(row), customerName: row.user.name, customerEmail: row.user.email };
}

export async function listOrdersForUser(
  user: SessionUser,
  query: ListOrdersQuery,
): Promise<{ items: OrderSummary[]; page: number; limit: number; total: number }> {
  const { rows, total } = await repo.findOrdersForUser(user.id, query);
  return { items: rows.map(toOrderSummary), page: query.page, limit: query.limit, total };
}

async function getOwnedOrderOrThrow(user: SessionUser, orderId: string): Promise<OrderDetailRow> {
  const order = await repo.findOrderById(orderId);
  if (!order) throw new NotFoundError('Order not found.');
  requireOwnership(user, order.userId);
  return order;
}

export async function getOrderForUser(user: SessionUser, orderId: string): Promise<OrderDetail> {
  const order = await getOwnedOrderOrThrow(user, orderId);
  return toOrderDetail(order);
}

/**
 * docs/Product_Spec_Requirements.md §5.2: "Customers can cancel only while
 * status is Confirmed or Processing (not after Packed)." Releases every
 * reservation tied to the order (restoring stock) in the same transaction
 * as the status change, so a crash mid-cancel can't leave stock held
 * against a cancelled order.
 */
export async function cancelOrder(user: SessionUser, orderId: string): Promise<OrderDetail> {
  const existing = await getOwnedOrderOrThrow(user, orderId);
  const fromStatus = existing.status as OrderStatus;
  if (!isCustomerCancelable(fromStatus)) {
    throw new InvalidOrderStateError(
      `This order can no longer be cancelled (current status: ${fromStatus}).`,
    );
  }

  await db.$transaction(async (tx) => {
    await releaseReservationsForOrder(tx, orderId);
    await repo.updateOrderStatusRow(tx, orderId, 'cancelled');
    await repo.createStatusHistoryRow(tx, {
      orderId,
      fromStatus,
      toStatus: 'cancelled',
      changedBy: user.id,
      note: 'Cancelled by customer',
    });
  });

  await enqueueStatusNotification(orderId, user.id, 'cancelled');

  const updated = await repo.findOrderById(orderId);
  if (!updated) throw new NotFoundError('Order not found.');
  return toOrderDetail(updated);
}

/**
 * Best-effort order-status advance shared by the returns and refunds
 * modules — a no-op if the order isn't currently in a state this transition
 * is legal from. Both callers already enforce their own invariants (returns:
 * "one active return in flight per order"; refunds: only `type === 'full'`
 * attempts this at all), so this is defense in depth, not the primary
 * guard — a `NotFoundError`/thrown validation error here would be the wrong
 * failure mode for what's meant to be a secondary status reflection, not
 * the return/refund action itself.
 */
export async function advanceOrderIfLegal(
  tx: Prisma.TransactionClient,
  orderId: string,
  to: OrderStatus,
  changedBy: string | null,
  note: string | null,
): Promise<void> {
  const order = await repo.findOrderByIdForUpdate(tx, orderId);
  if (!order) return;
  const from = order.status as OrderStatus;
  if (!canTransition(from, to)) return;
  await repo.updateOrderStatusRow(tx, orderId, to);
  await repo.createStatusHistoryRow(tx, {
    orderId,
    fromStatus: from,
    toStatus: to,
    changedBy,
    note,
  });
}

// ── Admin ───────────────────────────────────────────────────────────────

export async function listOrdersForAdmin(
  user: SessionUser,
  query: ListOrdersQuery,
): Promise<{ items: AdminOrderSummary[]; page: number; limit: number; total: number }> {
  requireRole(user, ['admin', 'staff']);
  const { rows, total } = await repo.findOrdersForAdmin(query);
  return { items: rows.map(toAdminOrderSummary), page: query.page, limit: query.limit, total };
}

export async function getOrderForAdmin(user: SessionUser, orderId: string): Promise<OrderDetail> {
  requireRole(user, ['admin', 'staff']);
  const order = await repo.findOrderById(orderId);
  if (!order) throw new NotFoundError('Order not found.');
  return toOrderDetail(order);
}

/**
 * docs/API_Spec.md `PATCH /admin/orders/:id/status`. Every write is
 * audit-logged (AGENTS.md §7: order.status is a sensitive admin write) and
 * validated against the state machine — canAdminTransition specifically
 * excludes pending_payment→confirmed, which only the payment webhook
 * (Phase 7) may ever perform.
 */
export async function updateOrderStatusAdmin(
  user: SessionUser,
  orderId: string,
  input: UpdateOrderStatusInput,
): Promise<OrderDetail> {
  requireRole(user, ['admin', 'staff']);
  const existing = await repo.findOrderById(orderId);
  if (!existing) throw new NotFoundError('Order not found.');
  const fromStatus = existing.status as OrderStatus;

  if (fromStatus === input.status) {
    throw new InvalidOrderStateError(`Order is already '${fromStatus}'.`);
  }
  if (!canAdminTransition(fromStatus, input.status)) {
    throw new InvalidOrderStateError(
      `Cannot move from '${fromStatus}' directly to '${input.status}'.`,
    );
  }

  await withAudit({
    actorUserId: user.id,
    action: 'ORDER_STATUS_CHANGED',
    entityType: 'order',
    entityId: orderId,
    before: { status: fromStatus },
    after: () => ({ status: input.status }),
    mutate: () =>
      db.$transaction(async (tx) => {
        // A cancellation reached through this path (e.g. cancel_requested →
        // cancelled) must release stock the same way a customer-initiated
        // cancel does — the state machine is what decides whether this
        // transition is a cancellation, not a hardcoded status check here.
        if (input.status === 'cancelled') {
          await releaseReservationsForOrder(tx, orderId);
        }
        await repo.updateOrderStatusRow(tx, orderId, input.status);
        await repo.createStatusHistoryRow(tx, {
          orderId,
          fromStatus,
          toStatus: input.status,
          changedBy: user.id,
          note: input.note ?? null,
        });
        await recordShipmentProgress(tx, orderId, input.status, input.shipment);
      }),
  });

  await enqueueStatusNotification(orderId, existing.userId, input.status);

  const updated = await repo.findOrderById(orderId);
  if (!updated) throw new NotFoundError('Order not found.');
  return toOrderDetail(updated);
}
