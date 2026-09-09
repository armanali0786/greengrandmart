import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { requireRole } from '@/modules/auth/auth.guard';
import type { SessionUser } from '@/modules/auth/auth.types';
import { withAudit } from '@/modules/admin/audit';
import * as repo from '@/modules/pricing/coupon.repository';
import type { CouponRow } from '@/modules/pricing/coupon.repository';
import { CouponInvalidError } from '@/modules/pricing/pricing.errors';
import type { CreateCouponInput, UpdateCouponInput } from '@/modules/pricing/pricing.schema';
import type { CouponPreview, CouponSummary, PricingScope } from '@/modules/pricing/pricing.types';
import { matchesScope } from '@/modules/pricing/scope';

function toCouponSummary(row: CouponRow): CouponSummary {
  return {
    id: row.id,
    code: row.code,
    type: row.type as CouponSummary['type'],
    value: row.value,
    maxDiscount: row.maxDiscount,
    minCartValue: row.minCartValue,
    startsAt: row.startsAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    usageLimitTotal: row.usageLimitTotal,
    usageLimitPerUser: row.usageLimitPerUser,
    firstOrderOnly: row.firstOrderOnly,
    appliesTo: row.appliesTo as PricingScope,
    active: row.active,
    redemptionCount: row._count.redemptions,
  };
}

export interface EligibleCartLine {
  productId: string;
  categoryId: string | null;
  brandId: string | null;
  /** The line's amount *after* promotions — what a coupon discount is computed against. */
  amount: number;
}

export interface CouponApplication {
  coupon: CouponRow;
  discount: number;
  /** Sum of amounts for lines the coupon's scope actually applies to — used to allocate the discount per line for GST. */
  eligibleLineTotal: number;
}

/**
 * Core coupon check — shared by /coupons/validate (preview-only) and
 * computeOrderTotal (the real quote), so a preview can never promise a
 * discount the real quote wouldn't also give. Every failure throws a
 * CouponInvalidError with its own specific message (Product_Spec_Requirements.md
 * §4.2: never a generic "invalid coupon").
 */
export async function checkCoupon(
  userId: string,
  code: string,
  cartLines: EligibleCartLine[],
): Promise<CouponApplication> {
  const normalizedCode = code.trim().toUpperCase();
  const coupon = await repo.findCouponByCode(normalizedCode);
  if (!coupon || !coupon.active) {
    throw new CouponInvalidError('This coupon code is not valid.');
  }

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    throw new CouponInvalidError('This coupon is not active yet.');
  }
  if (coupon.expiresAt && coupon.expiresAt < now) {
    throw new CouponInvalidError('This coupon has expired.');
  }

  if (coupon.usageLimitTotal !== null && coupon._count.redemptions >= coupon.usageLimitTotal) {
    throw new CouponInvalidError('This coupon has reached its usage limit.');
  }

  const userRedemptions = await repo.countCouponRedemptionsForUser(coupon.id, userId);
  if (userRedemptions >= coupon.usageLimitPerUser) {
    throw new CouponInvalidError("You've already used this coupon.");
  }

  if (coupon.firstOrderOnly) {
    const priorOrders = await repo.countOrdersForUser(userId);
    if (priorOrders > 0) {
      throw new CouponInvalidError('This coupon is only valid on your first order.');
    }
  }

  const cartTotal = cartLines.reduce((sum, l) => sum + l.amount, 0);
  if (cartTotal < coupon.minCartValue) {
    throw new CouponInvalidError(
      `This coupon requires a minimum order of ₹${(coupon.minCartValue / 100).toFixed(0)}.`,
    );
  }

  const scope = coupon.appliesTo as PricingScope;
  const eligibleLines = cartLines.filter((line) => matchesScope(scope, line));
  const eligibleLineTotal = eligibleLines.reduce((sum, l) => sum + l.amount, 0);
  if (eligibleLineTotal <= 0) {
    throw new CouponInvalidError('This coupon does not apply to any items in your cart.');
  }

  let discount =
    coupon.type === 'percentage'
      ? Math.round((eligibleLineTotal * coupon.value) / 100)
      : coupon.value;
  if (coupon.maxDiscount !== null) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, eligibleLineTotal);

  return { coupon, discount, eligibleLineTotal };
}

export async function validateCouponPreview(
  userId: string,
  code: string,
  cartLines: EligibleCartLine[],
): Promise<CouponPreview> {
  const { coupon, discount } = await checkCoupon(userId, code, cartLines);
  return {
    valid: true,
    type: coupon.type as CouponPreview['type'],
    value: coupon.value,
    estimatedDiscount: discount,
  };
}

// ── Admin CRUD ──────────────────────────────────────────────────────────

export async function listCouponsForAdmin(user: SessionUser): Promise<CouponSummary[]> {
  requireRole(user, ['admin', 'staff']);
  const rows = await repo.listCoupons();
  return rows.map(toCouponSummary);
}

function isUniqueConstraintError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

export async function createCoupon(
  user: SessionUser,
  input: CreateCouponInput,
): Promise<CouponSummary> {
  requireRole(user, ['admin', 'staff']);
  try {
    const row = await withAudit({
      actorUserId: user.id,
      action: 'COUPON_CREATED',
      entityType: 'coupon',
      entityId: (result) => result.id,
      mutate: () => repo.createCouponRow(input),
    });
    return toCouponSummary(row);
  } catch (e) {
    if (isUniqueConstraintError(e))
      throw new ConflictError('This coupon code is already in use.', 'code');
    throw e;
  }
}

export async function updateCoupon(
  user: SessionUser,
  id: string,
  input: UpdateCouponInput,
): Promise<CouponSummary> {
  requireRole(user, ['admin', 'staff']);
  const before = await repo.findCouponById(id);
  if (!before) throw new NotFoundError('Coupon not found.');

  try {
    const row = await withAudit({
      actorUserId: user.id,
      action: 'COUPON_UPDATED',
      entityType: 'coupon',
      entityId: id,
      before: toCouponSummary(before),
      after: (result) => toCouponSummary(result),
      mutate: () => repo.updateCouponRow(id, input),
    });
    return toCouponSummary(row);
  } catch (e) {
    if (isUniqueConstraintError(e))
      throw new ConflictError('This coupon code is already in use.', 'code');
    throw e;
  }
}
