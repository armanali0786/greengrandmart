import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { CreatePromotionInput, UpdatePromotionInput } from '@/modules/pricing/pricing.schema';

export async function listPromotions(): Promise<Prisma.PromotionGetPayload<object>[]> {
  return db.promotion.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function findPromotionById(
  id: string,
): Promise<Prisma.PromotionGetPayload<object> | null> {
  return db.promotion.findUnique({ where: { id } });
}

/**
 * Active promotions right now, for computeOrderTotal — filters active=true
 * and the optional starts_at/expires_at window in SQL rather than in app
 * code, since this can run on every quote/cart-preview request.
 */
export async function findActivePromotions(): Promise<Prisma.PromotionGetPayload<object>[]> {
  const now = new Date();
  return db.promotion.findMany({
    where: {
      active: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
    },
  });
}

export async function createPromotionRow(
  input: CreatePromotionInput,
): Promise<Prisma.PromotionGetPayload<object>> {
  return db.promotion.create({
    data: {
      name: input.name,
      type: input.rules.type,
      rules: input.rules as unknown as Prisma.InputJsonValue,
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
      active: input.active,
    },
  });
}

export async function updatePromotionRow(
  id: string,
  input: UpdatePromotionInput,
): Promise<Prisma.PromotionGetPayload<object>> {
  return db.promotion.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.rules !== undefined && {
        type: input.rules.type,
        rules: input.rules as unknown as Prisma.InputJsonValue,
      }),
      ...(input.startsAt !== undefined && { startsAt: input.startsAt }),
      ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
      ...(input.active !== undefined && { active: input.active }),
    },
  });
}
