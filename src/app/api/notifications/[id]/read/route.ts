import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { markNotificationRead } from '@/modules/notifications/notification.service';
import { success, error } from '@/lib/api-response';

export async function POST(
  req: NextRequest,
  { params }: RouteContext<'/api/notifications/[id]/read'>,
) {
  try {
    const { id } = await params;
    const user = await getSessionUser(req);
    await markNotificationRead(user, id);
    return success({ read: true });
  } catch (e) {
    return error(e);
  }
}
