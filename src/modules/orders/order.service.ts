import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { requireOwnership, requireRole } from '@/modules/auth/auth.guard';
import type { SessionUser } from '@/modules/auth/auth.types';
import { releaseReservationsForOrder } from '@/modules/inventory/inventory.service';
import { withAudit } from '@/modules/admin/audit';
import * as repo from '@/modules/orders/order.repository';
import type {
  AdminOrderListRow,
  OrderDetailRow,
  OrderListRow,
} from '@/modules/orders/order.repository';
import { InvalidOrderStateError } from '@/modules/orders/order.errors';
import { canAdminTransition, isCustomerCancelable } from '@/modules/orders/order-status-machine';
import type { ListOrdersQuery, UpdateOrderStatusInput } from '@/modules/orders/order.schema';
import type {
  AddressSnapshot,
  AdminOrderSummary,
  OrderDetail,
  OrderStatus,
  OrderSummary,
} from '@/modules/orders/order.types';

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

function toOrderDetail(row: OrderDetailRow): OrderDetail {
  const status = row.status as OrderStatus;
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
    })),
    statusHistory: row.statusHistory.map((h) => ({
      fromStatus: h.fromStatus as OrderStatus | null,
      toStatus: h.toStatus as OrderStatus,
      note: h.note,
      createdAt: h.createdAt.toISOString(),
    })),
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

  const updated = await repo.findOrderById(orderId);
  if (!updated) throw new NotFoundError('Order not found.');
  return toOrderDetail(updated);
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
      }),
  });

  const updated = await repo.findOrderById(orderId);
  if (!updated) throw new NotFoundError('Order not found.');
  return toOrderDetail(updated);
}
