import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { registerDeviceTokenSchema } from '@/modules/notifications/notification.schema';
import { registerDeviceToken } from '@/modules/notifications/notification.service';
import { success, error } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const body = registerDeviceTokenSchema.parse(await req.json());
    await registerDeviceToken(user, body);
    return success({ registered: true });
  } catch (e) {
    return error(e);
  }
}
