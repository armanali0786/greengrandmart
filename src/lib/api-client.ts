import { getFirebaseAuth } from '@/lib/firebase-client';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Client-side fetch wrapper for our own authenticated API routes: attaches
 * the current Firebase ID token as a Bearer header and unwraps the standard
 * {success, data | error} envelope (docs/API_Spec.md), throwing ApiError on
 * failure so callers can use normal try/catch instead of checking `.success`.
 */
export async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new ApiError('UNAUTHENTICATED', 'You must be signed in to do that.', 401);

  const idToken = await user.getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  const json = await res.json();
  if (!json.success) {
    throw new ApiError(json.error.code, json.error.message, res.status);
  }
  return json.data as T;
}

/**
 * Like authFetch, but for endpoints that work for both signed-in and guest
 * callers (cart/checkout, docs/API_Spec.md §1.1) — attaches a Bearer token
 * when one exists, otherwise sends no Authorization header and relies on
 * the browser sending the guest session_id cookie automatically.
 *
 * Waits for authStateReady() first: right after a fresh page load/navigation
 * (not just app boot), the Firebase SDK restores `currentUser` from IndexedDB
 * asynchronously, so a component that renders immediately (like the Header's
 * cart badge, which isn't gated behind a RequireAuth loading state the way
 * account pages are) can otherwise read `currentUser` as null for a signed-in
 * user and silently call the cart API as a guest — merging into the wrong
 * cart, or worse, creating a stray new guest cart right after a cart merge
 * cleared the old guest cookie. authFetch doesn't need this: it's only ever
 * called from pages already gated on useAuth()'s own loading flag.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  const idToken = user ? await user.getIdToken() : null;

  const res = await fetch(path, {
    ...init,
    headers: {
      ...(idToken && { Authorization: `Bearer ${idToken}` }),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  const json = await res.json();
  if (!json.success) {
    throw new ApiError(json.error.code, json.error.message, res.status);
  }
  return json.data as T;
}
