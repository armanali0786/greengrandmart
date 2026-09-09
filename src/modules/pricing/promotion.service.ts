import type { Prisma } from '@prisma/client';
import { NotFoundError } from '@/lib/errors';
import { requireRole } from '@/modules/auth/auth.guard';
import type { SessionUser } from '@/modules/auth/auth.types';
import { withAudit } from '@/modules/admin/audit';
import * as repo from '@/modules/pricing/promotion.repository';
import type { CreatePromotionInput, UpdatePromotionInput } from '@/modules/pricing/pricing.schema';
import type { PromotionRules, PromotionSummary } from '@/modules/pricing/pricing.types';

type PromotionRow = Prisma.PromotionGetPayload<object>;

function toPromotionSummary(row: PromotionRow): PromotionSummary {
  return {
    id: row.id,
    name: row.name,
    type: row.type as PromotionSummary['type'],
    rules: row.rules as unknown as PromotionRules,
    startsAt: row.startsAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    active: row.active,
  };
}

/** Used by pricing.service.ts's computeOrderTotal — every currently-active promotion, rules already parsed. */
export async function getActivePromotionRules(): Promise<PromotionRules[]> {
  const rows = await repo.findActivePromotions();
  return rows.map((row) => row.rules as unknown as PromotionRules);
}

export async function listPromotionsForAdmin(user: SessionUser): Promise<PromotionSummary[]> {
  requireRole(user, ['admin', 'staff']);
  const rows = await repo.listPromotions();
  return rows.map(toPromotionSummary);
}

export async function createPromotion(
  user: SessionUser,
  input: CreatePromotionInput,
): Promise<PromotionSummary> {
  requireRole(user, ['admin', 'staff']);
  const row = await withAudit({
    actorUserId: user.id,
    action: 'PROMOTION_CREATED',
    entityType: 'promotion',
    entityId: (result) => result.id,
    mutate: () => repo.createPromotionRow(input),
  });
  return toPromotionSummary(row);
}

export async function updatePromotion(
  user: SessionUser,
  id: string,
  input: UpdatePromotionInput,
): Promise<PromotionSummary> {
  requireRole(user, ['admin', 'staff']);
  const before = await repo.findPromotionById(id);
  if (!before) throw new NotFoundError('Promotion not found.');

  const row = await withAudit({
    actorUserId: user.id,
    action: 'PROMOTION_UPDATED',
    entityType: 'promotion',
    entityId: id,
    before: toPromotionSummary(before),
    after: (result) => toPromotionSummary(result),
    mutate: () => repo.updatePromotionRow(id, input),
  });
  return toPromotionSummary(row);
}
