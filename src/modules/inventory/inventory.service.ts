import type { Prisma } from '@prisma/client';
import { createInventoryRow } from '@/modules/inventory/inventory.repository';

type TxClient = Prisma.TransactionClient;

/**
 * Minimal Phase-3 slice of the inventory module: creates the 1:1 `inventory`
 * row when a new variant is created (docs/Data_Model_DB_Schema.md — every
 * variant needs one). Full reservation/locking/movement-tracking logic
 * (reserve, release, convertToSale, restock with a reason) is Phase 4's
 * "Inventory & Cart" scope — deliberately not built here, per AGENTS.md §8
 * scope discipline. Always takes an existing `tx` rather than opening its
 * own, per Coding_Standards.md §4 — the catalog module calls this from
 * inside its own product-creation transaction.
 */
export async function initializeStock(
  tx: TxClient,
  variantId: string,
  initialQty: number,
): Promise<void> {
  await createInventoryRow(tx, variantId, initialQty);
}
