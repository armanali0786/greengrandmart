import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { completeReturn } from '@/modules/returns/return.service';
import { success, error } from '@/lib/api-response';

export async function POST(
  req: NextRequest,
  { params }: RouteContext<'/api/admin/returns/[id]/complete'>,
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const result = await completeReturn(user, id);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
