import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { returnActionSchema } from '@/modules/returns/return.schema';
import { approveReturn, rejectReturn } from '@/modules/returns/return.service';
import { success, error } from '@/lib/api-response';

/** `{ action: 'approve' | 'reject', note? }` — docs/API_Spec.md has no dedicated returns endpoint; added this phase following the existing admin envelope/role/error conventions (same precedent as `PATCH /admin/promotions/:id`). */
export async function PATCH(req: NextRequest, { params }: RouteContext<'/api/admin/returns/[id]'>) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    const body = returnActionSchema.parse(await req.json());
    const result =
      body.action === 'approve'
        ? await approveReturn(user, id, body.note)
        : await rejectReturn(user, id, body.note);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
