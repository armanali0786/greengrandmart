import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { MovementType } from '@/modules/inventory/inventory.types';

type TxClient = Prisma.TransactionClient;

export async function createInventoryRow(
  tx: TxClient,
  variantId: string,
  availableQty: number,
): Promise<void> {
  await tx.inventory.create({
    data: { variantId, availableQty },
  });
}

export interface InventoryRow {
  variantId: string;
  availableQty: number;
  reservedQty: number;
  soldQty: number;
  damagedQty: number;
}

/**
 * Locks the row for the remainder of `tx` (docs/Data_Model_DB_Schema.md §4:
 * "inventory is only ever written to ... inside a transaction with
 * SELECT...FOR UPDATE"). Prisma's query builder can't express FOR UPDATE, so
 * this drops to raw SQL for the read; the write below still goes through the
 * normal Prisma client, inside the same `tx`, so the lock still covers it.
 */
export async function lockInventoryRow(
  tx: TxClient,
  variantId: string,
): Promise<InventoryRow | null> {
  const rows = await tx.$queryRaw<InventoryRow[]>`
    SELECT
      variant_id AS "variantId",
      available_qty AS "availableQty",
      reserved_qty AS "reservedQty",
      sold_qty AS "soldQty",
      damaged_qty AS "damagedQty"
    FROM inventory
    WHERE variant_id = ${variantId}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

export interface InventoryCounterDelta {
  availableQty?: number;
  reservedQty?: number;
  soldQty?: number;
  damagedQty?: number;
}

/** Must only be called while the row is already locked (see lockInventoryRow above). */
export async function applyInventoryDelta(
  tx: TxClient,
  variantId: string,
  delta: InventoryCounterDelta,
): Promise<void> {
  await tx.inventory.update({
    where: { variantId },
    data: {
      ...(delta.availableQty !== undefined && { availableQty: { increment: delta.availableQty } }),
      ...(delta.reservedQty !== undefined && { reservedQty: { increment: delta.reservedQty } }),
      ...(delta.soldQty !== undefined && { soldQty: { increment: delta.soldQty } }),
      ...(delta.damagedQty !== undefined && { damagedQty: { increment: delta.damagedQty } }),
    },
  });
}

/** Read-only, unlocked — for display purposes (cart/PDP live validation), never for reserving. */
export async function findInventoryByVariantIds(
  variantIds: string[],
): Promise<{ variantId: string; availableQty: number }[]> {
  return db.inventory.findMany({
    where: { variantId: { in: variantIds } },
    select: { variantId: true, availableQty: true },
  });
}

export interface ReservationRow {
  id: string;
  variantId: string;
  orderId: string | null;
  cartId: string | null;
  quantity: number;
  status: string;
}

export async function createReservationRow(
  tx: TxClient,
  params: {
    variantId: string;
    quantity: number;
    cartId: string | null;
    orderId: string | null;
    expiresAt: Date;
  },
): Promise<ReservationRow> {
  return tx.inventoryReservation.create({
    data: {
      variantId: params.variantId,
      quantity: params.quantity,
      cartId: params.cartId,
      orderId: params.orderId,
      expiresAt: params.expiresAt,
    },
  });
}

/** Locks the reservation row itself so two concurrent releases/conversions of the same reservation can't double-count. */
export async function lockReservationRow(
  tx: TxClient,
  reservationId: string,
): Promise<ReservationRow | null> {
  const rows = await tx.$queryRaw<ReservationRow[]>`
    SELECT id, variant_id AS "variantId", order_id AS "orderId", cart_id AS "cartId", quantity, status
    FROM inventory_reservations
    WHERE id = ${reservationId}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function markReservationRow(
  tx: TxClient,
  reservationId: string,
  status: 'released' | 'converted',
): Promise<void> {
  await tx.inventoryReservation.update({ where: { id: reservationId }, data: { status } });
}

export async function createMovementRow(
  tx: TxClient,
  params: {
    variantId: string;
    type: MovementType;
    quantity: number;
    referenceType?: string | null;
    referenceId?: string | null;
    note?: string | null;
    createdBy?: string | null;
  },
): Promise<void> {
  await tx.inventoryMovement.create({
    data: {
      variantId: params.variantId,
      type: params.type,
      quantity: params.quantity,
      referenceType: params.referenceType ?? null,
      referenceId: params.referenceId ?? null,
      note: params.note ?? null,
      createdBy: params.createdBy ?? null,
    },
  });
}

interface InventoryListRow {
  id: string;
  sku: string;
  attributes: Prisma.JsonValue;
  productId: string;
  product: { name: string };
  inventory: {
    availableQty: number;
    reservedQty: number;
    soldQty: number;
    damagedQty: number;
    lowStockThreshold: number;
  } | null;
}

export async function findInventoryList(): Promise<InventoryListRow[]> {
  return db.productVariant.findMany({
    where: { product: { deletedAt: null } },
    include: { product: { select: { name: true } }, inventory: true },
    orderBy: { createdAt: 'desc' },
  });
}
