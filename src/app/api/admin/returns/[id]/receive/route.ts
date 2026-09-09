import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { returnNoteSchema } from '@/modules/returns/return.schema';
import { markItemReceived } from '@/modules/returns/return.service';
import { success, error } from '@/lib/api-response';

export async function POST(
  req: NextRequest,
  { params }: RouteContext<'/api/admin/returns/[id]/receive'>,
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const body = returnNoteSchema.parse(await req.json().catch(() => ({})));
    const result = await markItemReceived(user, id, body.note);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
