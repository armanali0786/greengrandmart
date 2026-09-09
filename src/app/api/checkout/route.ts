import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { checkoutSchema } from '@/modules/orders/order.schema';
import { createOrder } from '@/modules/orders/checkout.service';
import { success, error } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const body = checkoutSchema.parse(await req.json());
    const result = await createOrder(user, body);
    return success(result, 201);
  } catch (e) {
    return error(e);
  }
}
