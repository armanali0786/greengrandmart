import { db } from '@/lib/db';
import { env } from '@/config/env';
import { NotFoundError } from '@/lib/errors';
import { requireOwnership, requireRole } from '@/modules/auth/auth.guard';
import type { SessionUser } from '@/modules/auth/auth.types';
import { withAudit } from '@/modules/admin/audit';
import * as jobService from '@/modules/jobs/job.service';
import * as orderRepo from '@/modules/orders/order.repository';
import { advanceOrderIfLegal } from '@/modules/orders/order.service';
import { restockReturnedItem } from '@/modules/inventory/inventory.service';
import * as repo from '@/modules/returns/return.repository';
import { InvalidReturnStateError, ReturnWindowExpiredError } from '@/modules/returns/return.errors';
import type { ListReturnsQuery, RequestReturnInput } from '@/modules/returns/return.schema';
import type { AdminReturnSummary, ReturnStatus, ReturnView } from '@/modules/returns/return.types';

function toReturnView(row: repo.ReturnRow): ReturnView {
  return {
    id: row.id,
    orderItemId: row.orderItemId,
    reason: row.reason,
    status: row.status as ReturnStatus,
    requestedAt: row.requestedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAdminSummary(row: repo.AdminReturnRow): AdminReturnSummary {
  return {
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    customerName: row.order.user.name,
    customerEmail: row.order.user.email,
    productName: row.orderItem.productNameSnapshot,
    reason: row.reason,
    status: row.status as ReturnStatus,
    requestedAt: row.requestedAt.toISOString(),
  };
}

function formatReason(reason: RequestReturnInput['reason'], note: string | undefined): string {
  return note ? `${reason}: ${note}` : reason;
}

export async function listReturnsForOrder(orderId: string): Promise<ReturnView[]> {
  const rows = await repo.findReturnsForOrder(orderId);
  return rows.map(toReturnView);
}

/**
 * docs/Product_Spec_Requirements.md §8.1: only after `Delivered`, within
 * `RETURN_WINDOW_DAYS` of the delivery event (not the order's placedAt) —
 * looked up from the order's own status history rather than assumed, since
 * "days since delivered" and "days since placed" diverge for anything that
 * took time in transit. See the Product_Spec_Requirements.md §8 addendum
 * for the "one return in flight per order" scoping decision this enforces.
 */
export async function requestReturn(
  user: SessionUser,
  orderId: string,
  orderItemId: string,
  input: RequestReturnInput,
): Promise<ReturnView> {
  const order = await orderRepo.findOrderById(orderId);
  if (!order) throw new NotFoundError('Order not found.');
  requireOwnership(user, order.userId);

  const item = order.items.find((i) => i.id === orderItemId);
  if (!item) throw new NotFoundError('Order item not found.');

  if (order.status !== 'delivered') {
    throw new InvalidReturnStateError(
      `Returns can only be requested after delivery (current status: '${order.status}').`,
    );
  }

  const deliveredEvent = order.statusHistory.find((h) => h.toStatus === 'delivered');
  const deliveredAt = deliveredEvent?.createdAt ?? order.placedAt;
  const windowEnd = new Date(deliveredAt.getTime() + env.RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (new Date() > windowEnd) {
    throw new ReturnWindowExpiredError();
  }

  if (await repo.findActiveReturnForOrder(db, orderId)) {
    throw new InvalidReturnStateError('Another return is already in progress for this order.');
  }
  if (await repo.findActiveReturnForItem(db, orderItemId)) {
    throw new InvalidReturnStateError('A return has already been requested for this item.');
  }

  const reason = formatReason(input.reason, input.note);

  const created = await db.$transaction(async (tx) => {
    const row = await repo.createReturnRow(tx, { orderId, orderItemId, reason });
    await orderRepo.updateOrderStatusRow(tx, orderId, 'return_requested');
    await orderRepo.createStatusHistoryRow(tx, {
      orderId,
      fromStatus: 'delivered',
      toStatus: 'return_requested',
      changedBy: user.id,
      note: `Return requested: ${reason}`,
    });
    return row;
  });

  try {
    await jobService.enqueue('send_email', {
      trigger: 'return_requested',
      userId: order.userId,
      orderId,
    });
    await jobService.enqueue('send_push', {
      trigger: 'return_requested',
      userId: order.userId,
      orderId,
    });
  } catch (e) {
    console.error(`Failed to enqueue return_requested notification for order ${orderId}`, e);
  }

  return toReturnView(created);
}

// ── Admin ───────────────────────────────────────────────────────────────

export async function listReturnsForAdmin(
  user: SessionUser,
  query: ListReturnsQuery,
): Promise<{ items: AdminReturnSummary[]; page: number; limit: number; total: number }> {
  requireRole(user, ['admin', 'staff']);
  const { rows, total } = await repo.findReturnsForAdmin(query);
  return { items: rows.map(toAdminSummary), page: query.page, limit: query.limit, total };
}

export async function approveReturn(
  user: SessionUser,
  returnId: string,
  note: string | undefined,
): Promise<ReturnView> {
  requireRole(user, ['admin', 'staff']);
  const approved = await withAudit({
    actorUserId: user.id,
    action: 'RETURN_APPROVED',
    entityType: 'return',
    entityId: returnId,
    mutate: () =>
      db.$transaction(async (tx) => {
        const ret = await repo.findReturnByIdForUpdate(tx, returnId);
        if (!ret) throw new NotFoundError('Return not found.');
        if (ret.status !== 'requested') {
          throw new InvalidReturnStateError(`Return is '${ret.status}', not 'requested'.`);
        }
        await repo.updateReturnStatusRow(tx, returnId, 'approved');
        await advanceOrderIfLegal(tx, ret.orderId, 'return_approved', user.id, note ?? null);
        return { orderId: ret.orderId, view: toReturnView({ ...ret, status: 'approved' }) };
      }),
  });

  try {
    const order = await orderRepo.findOrderById(approved.orderId);
    if (order) {
      await jobService.enqueue('send_email', {
        trigger: 'return_approved',
        userId: order.userId,
        orderId: approved.orderId,
      });
      await jobService.enqueue('send_push', {
        trigger: 'return_approved',
        userId: order.userId,
        orderId: approved.orderId,
      });
    }
  } catch (e) {
    console.error(
      `Failed to enqueue return_approved notification for order ${approved.orderId}`,
      e,
    );
  }

  return approved.view;
}

export async function rejectReturn(
  user: SessionUser,
  returnId: string,
  note: string | undefined,
): Promise<ReturnView> {
  requireRole(user, ['admin', 'staff']);
  return withAudit({
    actorUserId: user.id,
    action: 'RETURN_REJECTED',
    entityType: 'return',
    entityId: returnId,
    mutate: () =>
      db.$transaction(async (tx) => {
        const ret = await repo.findReturnByIdForUpdate(tx, returnId);
        if (!ret) throw new NotFoundError('Return not found.');
        if (ret.status !== 'requested') {
          throw new InvalidReturnStateError(`Return is '${ret.status}', not 'requested'.`);
        }
        await repo.updateReturnStatusRow(tx, returnId, 'rejected');
        await advanceOrderIfLegal(tx, ret.orderId, 'delivered', user.id, note ?? null);
        return toReturnView({ ...ret, status: 'rejected' });
      }),
  });
}

/** docs/Product_Spec_Requirements.md §8.3: restocking happens here — physical receipt — never on approval alone. */
export async function markItemReceived(
  user: SessionUser,
  returnId: string,
  note: string | undefined,
): Promise<ReturnView> {
  requireRole(user, ['admin', 'staff']);
  return withAudit({
    actorUserId: user.id,
    action: 'RETURN_ITEM_RECEIVED',
    entityType: 'return',
    entityId: returnId,
    mutate: () =>
      db.$transaction(async (tx) => {
        const ret = await repo.findReturnByIdForUpdate(tx, returnId);
        if (!ret) throw new NotFoundError('Return not found.');
        if (ret.status !== 'approved') {
          throw new InvalidReturnStateError(`Return is '${ret.status}', not 'approved'.`);
        }
        const item = await tx.orderItem.findUnique({ where: { id: ret.orderItemId } });
        if (!item) throw new NotFoundError('Order item not found.');

        await repo.updateReturnStatusRow(tx, returnId, 'item_received');
        if (item.variantId) {
          await restockReturnedItem(tx, {
            variantId: item.variantId,
            quantity: item.quantity,
            orderId: ret.orderId,
          });
        }
        await advanceOrderIfLegal(tx, ret.orderId, 'returned', user.id, note ?? null);
        return toReturnView({ ...ret, status: 'item_received' });
      }),
  });
}

/**
 * Final manual bookkeeping step, only after the admin has confirmed the
 * associated refund was processed — see the Product_Spec_Requirements.md §8
 * addendum on why this isn't automatic (no FK link between `returns` and
 * `refunds`, and `refunds` isn't allowed to call back into `returns`).
 */
export async function completeReturn(user: SessionUser, returnId: string): Promise<ReturnView> {
  requireRole(user, ['admin', 'staff']);
  const ret = await repo.findReturnById(returnId);
  if (!ret) throw new NotFoundError('Return not found.');
  if (ret.status !== 'item_received') {
    throw new InvalidReturnStateError(`Return is '${ret.status}', not 'item_received'.`);
  }
  await repo.updateReturnStatusRow(db, returnId, 'completed');
  return toReturnView({ ...ret, status: 'completed' });
}
