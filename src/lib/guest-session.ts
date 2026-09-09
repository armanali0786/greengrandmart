import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '@/config/env';

const COOKIE_NAME = 'ggm_guest_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * A guest cart's anonymous identifier (docs/API_Spec.md §1.1: "cart/checkout
 * endpoints work with either a logged-in token or a guest session_id
 * cookie"). This is a distinct, documented mechanism from auth session
 * persistence — Security.md's "the app does not implement custom
 * session/cookie logic beyond what Firebase provides" is about not
 * reinventing login sessions, not about this: the cookie carries no
 * identity or privilege, only "which anonymous cart is this," so it can't
 * be used to impersonate a user or escalate access.
 */
export async function getOrCreateGuestSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const sessionId = randomUUID();
  store.set(COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
  return sessionId;
}

/** Read-only — never creates a cookie. Used by the merge endpoint, which only cares whether a guest cart already exists. */
export async function peekGuestSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export async function clearGuestSessionId(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
