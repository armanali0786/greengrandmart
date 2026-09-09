import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/modules/auth/auth.service';
import { getOrCreateGuestSessionId } from '@/lib/guest-session';
import type { CartIdentity } from '@/modules/cart/cart.types';

/**
 * docs/API_Spec.md §1.1: "cart/checkout endpoints work with either a
 * logged-in token or a guest session_id cookie." A present Authorization
 * header is verified for real (via getSessionUser) rather than silently
 * falling back to a guest cart on a bad/expired token — a caller sending a
 * token expects to reach their own account's cart, not a fresh guest one.
 */
export async function resolveCartIdentity(req: NextRequest): Promise<CartIdentity> {
  if (req.headers.get('authorization')) {
    const user = await getSessionUser(req);
    return { userId: user.id };
  }
  const sessionId = await getOrCreateGuestSessionId();
  return { sessionId };
}
