import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { getOrderForUser } from '@/modules/orders/order.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest, { params }: RouteContext<'/api/orders/[id]'>) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const order = await getOrderForUser(user, id);
    return success(order);
  } catch (e) {
    return error(e);
  }
}
