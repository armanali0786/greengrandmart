import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { cancelOrder } from '@/modules/orders/order.service';
import { success, error } from '@/lib/api-response';

export async function POST(req: NextRequest, { params }: RouteContext<'/api/orders/[id]/cancel'>) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const order = await cancelOrder(user, id);
    return success(order);
  } catch (e) {
    return error(e);
  }
}
