import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { AddressSnapshot, OrderStatus } from '@/modules/orders/order.types';

type TxClient = Prisma.TransactionClient;

export interface CreateOrderItemInput {
  productId: string;
  variantId: string;
  productNameSnapshot: string;
  skuSnapshot: string;
  variantAttrsSnapshot: Record<string, string>;
  unitPrice: number;
  discount: number;
  taxAmount: number;
  quantity: number;
  lineTotal: number;
}

export interface CreateOrderInput {
  orderNumber: string;
  userId: string;
  subtotal: number;
  discountTotal: number;
  couponDiscount: number;
  shippingFee: number;
  taxTotal: number;
  grandTotal: number;
  shippingAddress: AddressSnapshot;
  billingAddress: AddressSnapshot;
  items: CreateOrderItemInput[];
}

const orderDetailInclude = {
  items: true,
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;

export type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

/**
 * Always called from inside checkout.service's own transaction (which also
 * holds the inventory row locks) — never opens its own. Seeds the first
 * status-history row (pending_payment) in the same insert so an order
 * never exists without at least one history entry.
 */
export async function createOrderRow(
  tx: TxClient,
  input: CreateOrderInput,
): Promise<OrderDetailRow> {
  return tx.order.create({
    data: {
      orderNumber: input.orderNumber,
      userId: input.userId,
      subtotal: input.subtotal,
      discountTotal: input.discountTotal,
      couponDiscount: input.couponDiscount,
      shippingFee: input.shippingFee,
      taxTotal: input.taxTotal,
      grandTotal: input.grandTotal,
      shippingAddress: input.shippingAddress as unknown as Prisma.InputJsonValue,
      billingAddress: input.billingAddress as unknown as Prisma.InputJsonValue,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          productNameSnapshot: item.productNameSnapshot,
          skuSnapshot: item.skuSnapshot,
          variantAttrsSnapshot: item.variantAttrsSnapshot as unknown as Prisma.InputJsonValue,
          unitPrice: item.unitPrice,
          discount: item.discount,
          taxAmount: item.taxAmount,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        })),
      },
      statusHistory: { create: { toStatus: 'pending_payment' } },
    },
    include: orderDetailInclude,
  });
}

export async function createStatusHistoryRow(
  tx: TxClient | typeof db,
  params: {
    orderId: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    changedBy: string | null;
    note: string | null;
  },
): Promise<void> {
  await tx.orderStatusHistory.create({
    data: {
      orderId: params.orderId,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      changedBy: params.changedBy,
      note: params.note,
    },
  });
}

export async function updateOrderStatusRow(
  tx: TxClient | typeof db,
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  await tx.order.update({ where: { id: orderId }, data: { status } });
}

export async function findOrderById(id: string): Promise<OrderDetailRow | null> {
  return db.order.findUnique({ where: { id }, include: orderDetailInclude });
}

/** Locks the order row for checkoutService's cancel/status-update transactions, same FOR-UPDATE-via-transaction pattern as inventory. */
export async function findOrderByIdForUpdate(
  tx: TxClient,
  id: string,
): Promise<{ id: string; userId: string; status: string } | null> {
  const rows = await tx.$queryRaw<{ id: string; userId: string; status: string }[]>`
    SELECT id, user_id AS "userId", status FROM orders WHERE id = ${id}::uuid FOR UPDATE
  `;
  return rows[0] ?? null;
}

const orderListInclude = {
  items: { take: 1, orderBy: { id: 'asc' as const } },
  _count: { select: { items: true } },
} satisfies Prisma.OrderInclude;

export type OrderListRow = Prisma.OrderGetPayload<{ include: typeof orderListInclude }>;

export async function findOrdersForUser(
  userId: string,
  params: { page: number; limit: number; status?: OrderStatus },
): Promise<{ rows: OrderListRow[]; total: number }> {
  const where: Prisma.OrderWhereInput = { userId, ...(params.status && { status: params.status }) };
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      include: orderListInclude,
      orderBy: { placedAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    db.order.count({ where }),
  ]);
  return { rows, total };
}

const adminOrderListInclude = {
  ...orderListInclude,
  user: { select: { name: true, email: true } },
} satisfies Prisma.OrderInclude;

export type AdminOrderListRow = Prisma.OrderGetPayload<{ include: typeof adminOrderListInclude }>;

export async function findOrdersForAdmin(params: {
  page: number;
  limit: number;
  status?: OrderStatus;
}): Promise<{ rows: AdminOrderListRow[]; total: number }> {
  const where: Prisma.OrderWhereInput = params.status ? { status: params.status } : {};
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      include: adminOrderListInclude,
      orderBy: { placedAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    db.order.count({ where }),
  ]);
  return { rows, total };
}

/** Every reservation still 'active' whose expiry has passed — used by the reservation-expiry sweep (cron). */
export async function findExpiredActiveReservationIds(): Promise<
  { id: string; orderId: string | null }[]
> {
  return db.inventoryReservation.findMany({
    where: { status: 'active', expiresAt: { lt: new Date() } },
    select: { id: true, orderId: true },
  });
}
