import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { getCart } from '@/modules/cart/cart.service';
import { validateCouponSchema } from '@/modules/pricing/pricing.schema';
import { previewCoupon } from '@/modules/pricing/pricing.service';
import { success, error } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const body = validateCouponSchema.parse(await req.json());
    const cart = await getCart({ userId: user.id });
    const items = cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    const preview = await previewCoupon(user.id, body.code, items);
    return success(preview);
  } catch (e) {
    return error(e);
  }
}
