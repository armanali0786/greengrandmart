import type { NextRequest } from 'next/server';
import { establishSessionSchema } from '@/modules/auth/auth.schema';
import { establishSession } from '@/modules/auth/auth.service';
import { success, error } from '@/lib/api-response';

/**
 * Called once right after a successful Firebase sign-in (email/password or
 * Google) to bridge the verified Firebase identity into our own `users`
 * table — creating it on first login, per docs/API_Spec.md. Body is
 * optional (empty on every call after the first).
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const { name } = establishSessionSchema.parse(rawBody ? JSON.parse(rawBody) : {});
    const { user, isNewUser } = await establishSession(req, name);
    return success({ userId: user.id, email: user.email, role: user.role, isNewUser }, 200);
  } catch (e) {
    return error(e);
  }
}
