import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { markAllNotificationsRead } from '@/modules/notifications/notification.service';
import { success, error } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    await markAllNotificationsRead(user);
    return success({ read: true });
  } catch (e) {
    return error(e);
  }
}
