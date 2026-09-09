import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { listOrdersQuerySchema } from '@/modules/orders/order.schema';
import { listOrdersForAdmin } from '@/modules/orders/order.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const query = listOrdersQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const result = await listOrdersForAdmin(user, query);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
