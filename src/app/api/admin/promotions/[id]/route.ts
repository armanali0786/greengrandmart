import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { updatePromotionSchema } from '@/modules/pricing/pricing.schema';
import { updatePromotion } from '@/modules/pricing/promotion.service';
import { success, error } from '@/lib/api-response';

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<'/api/admin/promotions/[id]'>,
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const body = updatePromotionSchema.parse(await req.json());
    const promotion = await updatePromotion(user, id, body);
    return success(promotion);
  } catch (e) {
    return error(e);
  }
}
