import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { requestReturnSchema } from '@/modules/returns/return.schema';
import { requestReturn } from '@/modules/returns/return.service';
import { success, error } from '@/lib/api-response';

export async function POST(
  req: NextRequest,
  { params }: RouteContext<'/api/orders/[id]/items/[itemId]/return'>,
) {
  try {
    const { id, itemId } = await params;
    const user = await getSessionUser(req);
    const body = requestReturnSchema.parse(await req.json());
    const result = await requestReturn(user, id, itemId, body);
    return success(result, 201);
  } catch (e) {
    return error(e);
  }
}
