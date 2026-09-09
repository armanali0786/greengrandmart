import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { RefundStatus, RefundType } from '@/modules/refunds/refund.types';

export interface RefundRow {
  id: string;
  orderId: string;
  paymentId: string;
  type: string;
  amount: number;
  status: string;
  providerRefundId: string | null;
  reason: string | null;
  createdBy: string | null;
  createdAt: Date;
}

const ACTIVE: RefundStatus[] = ['pending', 'processing'];

/** Backs the "only one refund in flight per order" rule (docs/API_Spec.md's documented duplicate-refund error). */
export async function findActiveRefundForOrder(orderId: string): Promise<RefundRow | null> {
  return db.refund.findFirst({ where: { orderId, status: { in: ACTIVE } } });
}

export async function sumRefundedForOrder(orderId: string): Promise<number> {
  const result = await db.refund.aggregate({
    where: { orderId, status: { in: [...ACTIVE, 'completed'] } },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

export async function createRefundRow(params: {
  orderId: string;
  paymentId: string;
  type: RefundType;
  amount: number;
  reason: string | null;
  createdBy: string;
}): Promise<RefundRow> {
  return db.refund.create({ data: params });
}

export async function updateRefundStatusRow(
  id: string,
  status: RefundStatus,
  providerRefundId?: string,
): Promise<void> {
  await db.refund.update({
    where: { id },
    data: { status, ...(providerRefundId !== undefined && { providerRefundId }) },
  });
}

export async function findRefundById(id: string): Promise<RefundRow | null> {
  return db.refund.findUnique({ where: { id } });
}

export async function findRefundByProviderRefundId(
  providerRefundId: string,
): Promise<RefundRow | null> {
  return db.refund.findFirst({ where: { providerRefundId } });
}

const adminRefundInclude = {
  order: { select: { orderNumber: true, user: { select: { name: true, email: true } } } },
} satisfies Prisma.RefundInclude;

export type AdminRefundRow = Prisma.RefundGetPayload<{ include: typeof adminRefundInclude }>;

export async function findRefundsForAdmin(params: {
  page: number;
  limit: number;
  status?: RefundStatus;
}): Promise<{ rows: AdminRefundRow[]; total: number }> {
  const where: Prisma.RefundWhereInput = params.status ? { status: params.status } : {};
  const [rows, total] = await Promise.all([
    db.refund.findMany({
      where,
      include: adminRefundInclude,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    db.refund.count({ where }),
  ]);
  return { rows, total };
}
