import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { requireRole } from '@/modules/auth/auth.guard';
import type { SessionUser } from '@/modules/auth/auth.types';
import { OutOfStockError } from '@/modules/inventory/inventory.errors';
import * as repo from '@/modules/inventory/inventory.repository';
import type { AdjustStockInput } from '@/modules/inventory/inventory.schema';
import type { InventoryListItem } from '@/modules/inventory/inventory.types';

type TxClient = Prisma.TransactionClient;

/**
 * Creates the 1:1 `inventory` row when a new variant is created
 * (docs/Data_Model_DB_Schema.md — every variant needs one). Always takes an
 * existing `tx` rather than opening its own, per Coding_Standards.md §4 —
 * the catalog module calls this from inside its own product-creation
 * transaction.
 */
export async function initializeStock(
  tx: TxClient,
  variantId: string,
  initialQty: number,
): Promise<void> {
  await repo.createInventoryRow(tx, variantId, initialQty);
}

/**
 * Read-only, unlocked — `available_qty` is already "sellable right now"
 * (docs/Data_Model_DB_Schema.md: "the only number shown to customers"), so
 * this is safe for cart/PDP display without taking a row lock. Never use
 * this result to decide whether a reservation will succeed under
 * concurrency — call reserveStock for that.
 */
export async function getAvailableStock(variantIds: string[]): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map();
  const rows = await repo.findInventoryByVariantIds(variantIds);
  return new Map(rows.map((r) => [r.variantId, r.availableQty]));
}

export interface ReserveStockParams {
  variantId: string;
  quantity: number;
  cartId?: string;
  orderId?: string;
  expiresAt: Date;
}

/**
 * Core rule (Data_Model_DB_Schema.md §4): stock only ever changes through
 * this module, inside a transaction with SELECT...FOR UPDATE on the row.
 * Moves `quantity` from available_qty into reserved_qty so a second
 * concurrent reservation for the same variant can't oversell it — the row
 * lock held for the rest of `tx` is what makes this safe under concurrency,
 * not the availableQty check by itself. Not called by anything yet this
 * phase (checkout, which creates real reservations, is Phase 6/7) — this is
 * the foundational primitive that phase will call, exercised directly by
 * unit tests for now.
 */
export async function reserveStock(tx: TxClient, params: ReserveStockParams): Promise<string> {
  const row = await repo.lockInventoryRow(tx, params.variantId);
  if (!row || row.availableQty < params.quantity) {
    throw new OutOfStockError();
  }
  await repo.applyInventoryDelta(tx, params.variantId, {
    availableQty: -params.quantity,
    reservedQty: params.quantity,
  });
  const reservation = await repo.createReservationRow(tx, {
    variantId: params.variantId,
    quantity: params.quantity,
    cartId: params.cartId ?? null,
    orderId: params.orderId ?? null,
    expiresAt: params.expiresAt,
  });
  return reservation.id;
}

/**
 * Returns a reservation's held quantity back to available_qty — used for
 * payment failures and the (future) expiry sweep cron. Idempotent: a
 * reservation that's already released/converted is a silent no-op, since
 * both the sweep and a payment-failure handler could plausibly race to
 * release the same reservation.
 */
export async function releaseReservation(tx: TxClient, reservationId: string): Promise<void> {
  const reservation = await repo.lockReservationRow(tx, reservationId);
  if (!reservation || reservation.status !== 'active') return;

  await repo.lockInventoryRow(tx, reservation.variantId);
  await repo.applyInventoryDelta(tx, reservation.variantId, {
    availableQty: reservation.quantity,
    reservedQty: -reservation.quantity,
  });
  await repo.markReservationRow(tx, reservationId, 'released');
}

/**
 * Converts a reservation into a completed sale (payment captured webhook,
 * Phase 7) — moves the held quantity from reserved_qty to sold_qty.
 * available_qty is untouched here: it was already decremented at reserve
 * time, so this doesn't further reduce what's sellable, only reclassifies
 * stock that's already spoken for. Also idempotent, for the same reason as
 * releaseReservation. Logs a 'sale' movement (signed negative, per
 * Data_Model_DB_Schema.md's inventory_movements.quantity convention) purely
 * for the admin sales/movement history — it doesn't drive any counter.
 */
export async function convertReservationToSale(tx: TxClient, reservationId: string): Promise<void> {
  const reservation = await repo.lockReservationRow(tx, reservationId);
  if (!reservation || reservation.status !== 'active') return;

  await repo.lockInventoryRow(tx, reservation.variantId);
  await repo.applyInventoryDelta(tx, reservation.variantId, {
    reservedQty: -reservation.quantity,
    soldQty: reservation.quantity,
  });
  await repo.markReservationRow(tx, reservationId, 'converted');
  await repo.createMovementRow(tx, {
    variantId: reservation.variantId,
    type: 'sale',
    quantity: -reservation.quantity,
    referenceType: 'order',
    referenceId: reservation.orderId,
  });
}

/**
 * Releases every still-active reservation tied to an order — used by
 * order cancellation and (later) the reservation-expiry sweep's
 * order-side effect. Looks up reservation ids fresh inside `tx` rather
 * than taking them as a param, so a caller can't accidentally release the
 * wrong order's stock.
 */
export async function releaseReservationsForOrder(tx: TxClient, orderId: string): Promise<void> {
  const ids = await repo.findActiveReservationIdsForOrder(tx, orderId);
  for (const id of ids) {
    await releaseReservation(tx, id);
  }
}

function movementQuantityFor(input: AdjustStockInput): number {
  if (input.type === 'restock') return input.quantity;
  if (input.type === 'damage') return -input.quantity;
  return input.quantity; // 'adjustment' is already signed by the caller
}

/** Admin-only manual stock changes (docs/API_Spec.md `POST /admin/inventory/:variantId/adjust`). */
export async function adjustStock(
  user: SessionUser,
  variantId: string,
  input: AdjustStockInput,
): Promise<{ variantId: string; availableQty: number }> {
  requireRole(user, ['admin', 'staff']);

  return db.$transaction(async (tx) => {
    const row = await repo.lockInventoryRow(tx, variantId);
    if (!row) throw new NotFoundError('Inventory record not found for this variant.');

    const movementQuantity = movementQuantityFor(input);
    const nextAvailable = row.availableQty + movementQuantity;
    if (nextAvailable < 0) {
      throw new OutOfStockError(
        input.type === 'damage'
          ? 'Cannot mark more damaged than is currently available.'
          : 'This adjustment would make available stock negative.',
      );
    }

    const delta: repo.InventoryCounterDelta = { availableQty: movementQuantity };
    if (input.type === 'damage') delta.damagedQty = input.quantity;
    await repo.applyInventoryDelta(tx, variantId, delta);

    await repo.createMovementRow(tx, {
      variantId,
      type: input.type,
      quantity: movementQuantity,
      referenceType: 'admin_adjustment',
      note: input.note,
      createdBy: user.id,
    });

    return { variantId, availableQty: nextAvailable };
  });
}

export async function listInventory(user: SessionUser): Promise<InventoryListItem[]> {
  requireRole(user, ['admin', 'staff']);
  const rows = await repo.findInventoryList();
  return rows.map((row) => ({
    variantId: row.id,
    sku: row.sku,
    attributes: row.attributes as Record<string, string>,
    productId: row.productId,
    productName: row.product.name,
    availableQty: row.inventory?.availableQty ?? 0,
    reservedQty: row.inventory?.reservedQty ?? 0,
    soldQty: row.inventory?.soldQty ?? 0,
    damagedQty: row.inventory?.damagedQty ?? 0,
    lowStockThreshold: row.inventory?.lowStockThreshold ?? 5,
    lowStock: (row.inventory?.availableQty ?? 0) <= (row.inventory?.lowStockThreshold ?? 5),
  }));
}
