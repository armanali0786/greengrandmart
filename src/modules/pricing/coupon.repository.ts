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
