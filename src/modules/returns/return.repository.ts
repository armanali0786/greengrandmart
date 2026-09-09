import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { ReturnStatus } from '@/modules/returns/return.types';

type TxClient = Prisma.TransactionClient;

export interface ReturnRow {
  id: string;
  orderId: string;
  orderItemId: string;
  reason: string;
  status: string;
  requestedAt: Date;
  updatedAt: Date;
}

const NON_TERMINAL: ReturnStatus[] = ['requested', 'approved', 'item_received'];

/** Backs the "one return in flight at a time per order" rule (return.service.ts). */
export async function findActiveReturnForOrder(
  tx: TxClient | typeof db,
  orderId: string,
): Promise<ReturnRow | null> {
  return tx.return.findFirst({ where: { orderId, status: { in: NON_TERMINAL } } });
}

export async function findActiveReturnForItem(
  tx: TxClient | typeof db,
  orderItemId: string,
): Promise<ReturnRow | null> {
  return tx.return.findFirst({
    where: { orderItemId, status: { in: [...NON_TERMINAL, 'completed'] } },
  });
}

export async function createReturnRow(
  tx: TxClient,
  params: { orderId: string; orderItemId: string; reason: string },
): Promise<ReturnRow> {
  return tx.return.create({ data: params });
}

export async function findReturnById(id: string): Promise<ReturnRow | null> {
  return db.return.findUnique({ where: { id } });
}

export async function findReturnByIdForUpdate(tx: TxClient, id: string): Promise<ReturnRow | null> {
  const rows = await tx.$queryRaw<ReturnRow[]>`
    SELECT id, order_id AS "orderId", order_item_id AS "orderItemId", reason, status,
           requested_at AS "requestedAt", updated_at AS "updatedAt"
    FROM returns WHERE id = ${id}::uuid FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function updateReturnStatusRow(
  tx: TxClient | typeof db,
  id: string,
  status: ReturnStatus,
): Promise<void> {
  await tx.return.update({ where: { id }, data: { status } });
}

export async function findReturnsForOrder(orderId: string): Promise<ReturnRow[]> {
  return db.return.findMany({ where: { orderId }, orderBy: { requestedAt: 'desc' } });
}

const adminReturnInclude = {
  order: { select: { orderNumber: true, user: { select: { name: true, email: true } } } },
  orderItem: { select: { productNameSnapshot: true } },
} satisfies Prisma.ReturnInclude;

export type AdminReturnRow = Prisma.ReturnGetPayload<{ include: typeof adminReturnInclude }>;

export async function findReturnsForAdmin(params: {
  page: number;
  limit: number;
  status?: ReturnStatus;
}): Promise<{ rows: AdminReturnRow[]; total: number }> {
  const where: Prisma.ReturnWhereInput = params.status ? { status: params.status } : {};
  const [rows, total] = await Promise.all([
    db.return.findMany({
      where,
      include: adminReturnInclude,
      orderBy: { requestedAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    db.return.count({ where }),
  ]);
  return { rows, total };
}
