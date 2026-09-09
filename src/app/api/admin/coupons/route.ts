import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { createCouponSchema } from '@/modules/pricing/pricing.schema';
import { createCoupon, listCouponsForAdmin } from '@/modules/pricing/coupon.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const coupons = await listCouponsForAdmin(user);
    return success(coupons);
  } catch (e) {
    return error(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const body = createCouponSchema.parse(await req.json());
    const coupon = await createCoupon(user, body);
    return success(coupon, 201);
  } catch (e) {
    return error(e);
  }
}
