import type { Prisma } from '@prisma/client';

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
