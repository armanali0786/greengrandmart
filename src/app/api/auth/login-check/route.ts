import type { NextRequest } from 'next/server';
import { loginLockoutSchema } from '@/modules/auth/auth.schema';
import { checkLoginLockout } from '@/modules/auth/auth.service';
import { success, error } from '@/lib/api-response';

/**
 * Pre-flight check called client-side before attempting a Firebase
 * email/password sign-in, so a locked-out email never reaches Firebase at
 * all. No auth required — the caller isn't signed in yet.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = loginLockoutSchema.parse(await req.json());
    await checkLoginLockout(email);
    return success({ allowed: true });
  } catch (e) {
    return error(e);
  }
}
