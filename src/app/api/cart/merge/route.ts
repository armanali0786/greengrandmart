import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { peekGuestSessionId, clearGuestSessionId } from '@/lib/guest-session';
import { mergeGuestCart } from '@/modules/cart/cart.service';
import { success, error } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    const sessionId = await peekGuestSessionId();
    if (sessionId) {
      await mergeGuestCart(user.id, sessionId);
      await clearGuestSessionId();
    }
    return success({ merged: !!sessionId });
  } catch (e) {
    return error(e);
  }
}
