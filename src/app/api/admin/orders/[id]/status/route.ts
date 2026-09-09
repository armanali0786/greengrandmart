import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { updateOrderStatusSchema } from '@/modules/orders/order.schema';
import { updateOrderStatusAdmin } from '@/modules/orders/order.service';
import { success, error } from '@/lib/api-response';

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<'/api/admin/orders/[id]/status'>,
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const body = updateOrderStatusSchema.parse(await req.json());
    const order = await updateOrderStatusAdmin(user, id, body);
    return success(order);
  } catch (e) {
    return error(e);
  }
}
