import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { updateCouponSchema } from '@/modules/pricing/pricing.schema';
import { updateCoupon } from '@/modules/pricing/coupon.service';
import { success, error } from '@/lib/api-response';

export async function PATCH(req: NextRequest, { params }: RouteContext<'/api/admin/coupons/[id]'>) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const body = updateCouponSchema.parse(await req.json());
    const coupon = await updateCoupon(user, id, body);
    return success(coupon);
  } catch (e) {
    return error(e);
  }
}
