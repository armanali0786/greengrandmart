import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { createPromotionSchema } from '@/modules/pricing/pricing.schema';
import { createPromotion, listPromotionsForAdmin } from '@/modules/pricing/promotion.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const promotions = await listPromotionsForAdmin(user);
    return success(promotions);
  } catch (e) {
    return error(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const body = createPromotionSchema.parse(await req.json());
    const promotion = await createPromotion(user, body);
    return success(promotion, 201);
  } catch (e) {
    return error(e);
  }
}
