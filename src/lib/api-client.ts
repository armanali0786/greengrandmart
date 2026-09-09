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
