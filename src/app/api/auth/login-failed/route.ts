import type { NextRequest } from 'next/server';
import { loginLockoutSchema } from '@/modules/auth/auth.schema';
import { recordLoginFailure } from '@/modules/auth/auth.service';
import { success, error } from '@/lib/api-response';

/**
 * Records a failed sign-in attempt after Firebase itself rejects the
 * credentials, so the app-level lockout (docs/Product_Spec_Requirements.md
 * "Auth") only counts genuine failures, never a correct password.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = loginLockoutSchema.parse(await req.json());
    await recordLoginFailure(email);
    return success({ recorded: true });
  } catch (e) {
    return error(e);
  }
}
