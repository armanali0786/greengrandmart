import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { updatePreferencesSchema } from '@/modules/notifications/notification.schema';
import { getPreferences, updatePreferences } from '@/modules/notifications/notification.service';
import { success, error } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const prefs = await getPreferences(user);
    return success(prefs);
  } catch (e) {
    return error(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const body = updatePreferencesSchema.parse(await req.json());
    const prefs = await updatePreferences(user, body);
    return success(prefs);
  } catch (e) {
    return error(e);
  }
}
