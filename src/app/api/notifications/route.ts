import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { listNotificationsQuerySchema } from '@/modules/notifications/notification.schema';
import { listNotificationsForUser } from '@/modules/notifications/notification.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const query = listNotificationsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const result = await listNotificationsForUser(user, query);
    return success(result);
  } catch (e) {
    return error(e);
  }
}
