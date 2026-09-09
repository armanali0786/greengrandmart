import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { listReturnsQuerySchema } from '@/modules/returns/return.schema';
import { listReturnsForAdmin } from '@/modules/returns/return.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const query = listReturnsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const result = await listReturnsForAdmin(user, query);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
