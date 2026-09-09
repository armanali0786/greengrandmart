import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { CreateCouponInput, UpdateCouponInput } from '@/modules/pricing/pricing.schema';

export type CouponRow = Prisma.CouponGetPayload<{
  include: { _count: { select: { redemptions: true } } };
}>;

const withRedemptionCount = {
  include: { _count: { select: { redemptions: true } } },
} satisfies Prisma.CouponDefaultArgs;

export async function findCouponByCode(code: string): Promise<CouponRow | null> {
  return db.coupon.findUnique({ where: { code }, ...withRedemptionCount });
}

export async function findCouponById(id: string): Promise<CouponRow | null> {
  return db.coupon.findUnique({ where: { id }, ...withRedemptionCount });
}

export async function listCoupons(): Promise<CouponRow[]> {
  return db.coupon.findMany({ ...withRedemptionCount, orderBy: { createdAt: 'desc' } });
}

export async function createCouponRow(input: CreateCouponInput): Promise<CouponRow> {
  return db.coupon.create({
    data: {
      code: input.code,
      type: input.type,
      value: input.value,
      maxDiscount: input.maxDiscount,
      minCartValue: input.minCartValue,
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
      usageLimitTotal: input.usageLimitTotal,
      usageLimitPerUser: input.usageLimitPerUser,
      firstOrderOnly: input.firstOrderOnly,
      appliesTo: input.appliesTo as unknown as Prisma.InputJsonValue,
      active: input.active,
    },
    ...withRedemptionCount,
  });
}

export async function updateCouponRow(id: string, input: UpdateCouponInput): Promise<CouponRow> {
  return db.coupon.update({
    where: { id },
    data: {
      ...(input.code !== undefined && { code: input.code }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.value !== undefined && { value: input.value }),
      ...(input.maxDiscount !== undefined && { maxDiscount: input.maxDiscount }),
      ...(input.minCartValue !== undefined && { minCartValue: input.minCartValue }),
      ...(input.startsAt !== undefined && { startsAt: input.startsAt }),
      ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
      ...(input.usageLimitTotal !== undefined && { usageLimitTotal: input.usageLimitTotal }),
      ...(input.usageLimitPerUser !== undefined && {
        usageLimitPerUser: input.usageLimitPerUser,
      }),
      ...(input.firstOrderOnly !== undefined && { firstOrderOnly: input.firstOrderOnly }),
      ...(input.appliesTo !== undefined && {
        appliesTo: input.appliesTo as unknown as Prisma.InputJsonValue,
      }),
      ...(input.active !== undefined && { active: input.active }),
    },
    ...withRedemptionCount,
  });
}

export async function countCouponRedemptionsForUser(
  couponId: string,
  userId: string,
): Promise<number> {
  return db.couponRedemption.count({ where: { couponId, userId } });
}

/** First-order-only check — reads `orders` directly (the table already exists; the Orders module/service is Phase 6). */
export async function countOrdersForUser(userId: string): Promise<number> {
  return db.order.count({ where: { userId } });
}

export interface LockedCoupon {
  id: string;
  usageLimitTotal: number | null;
}

/**
 * Row-locks the coupon for the rest of checkout.service's transaction —
 * closes the race checkCoupon's preview-time read can't (usage_limit_total
 * is enforced by re-counting redemptions under this lock, not by a DB
 * constraint the way per-user redemption is). Must only be called from
 * inside an existing transaction that also inserts the redemption before
 * committing.
 */
export async function lockCouponForRedemption(
  tx: Prisma.TransactionClient,
  code: string,
): Promise<LockedCoupon | null> {
  const rows = await tx.$queryRaw<LockedCoupon[]>`
    SELECT id, usage_limit_total AS "usageLimitTotal" FROM coupons WHERE code = ${code} FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function countRedemptionsForCoupon(
  tx: Prisma.TransactionClient,
  couponId: string,
): Promise<number> {
  return tx.couponRedemption.count({ where: { couponId } });
}

export async function createRedemptionRow(
  tx: Prisma.TransactionClient,
  params: { couponId: string; userId: string; orderId: string },
): Promise<void> {
  await tx.couponRedemption.create({
    data: { couponId: params.couponId, userId: params.userId, orderId: params.orderId },
  });
}
