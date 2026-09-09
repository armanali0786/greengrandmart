import type { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { firebaseAdminAuth } from '@/lib/firebase-admin';
import {
  anonymizeUser,
  findOrCreateUserForFirebaseUid,
  findUserByFirebaseUid,
  updateUserProfile,
} from '@/modules/auth/auth.repository';
import { ReauthenticationRequiredError, UnauthenticatedError } from '@/modules/auth/auth.errors';
import type { UpdateProfileInput } from '@/modules/auth/auth.schema';
import type { SessionUser } from '@/modules/auth/auth.types';
import { countRecentEvents, recordEvent } from '@/lib/rate-limit';
import { RateLimitedError } from '@/lib/errors';

const REAUTH_MAX_AGE_SECONDS = 5 * 60;

const LOGIN_LOCKOUT_WINDOW_SECONDS = 15 * 60;
const LOGIN_LOCKOUT_MAX_FAILURES = 5;

function loginFailureKey(email: string): string {
  return `login_failed:email:${email.trim().toLowerCase()}`;
}

/**
 * App-level login lockout (docs/Product_Spec_Requirements.md "Auth": 5 failed
 * attempts/email/15min), independent of Firebase's own throttling — Firebase
 * only verifies credentials, it doesn't expose a lockout policy we control.
 * Called client-side BEFORE attempting sign-in; only recordLoginFailure()
 * below adds to the count, so a correct password never consumes the budget.
 */
export async function checkLoginLockout(email: string): Promise<void> {
  const count = await countRecentEvents(loginFailureKey(email), LOGIN_LOCKOUT_WINDOW_SECONDS);
  if (count >= LOGIN_LOCKOUT_MAX_FAILURES) {
    throw new RateLimitedError('Too many failed attempts. Please try again in 15 minutes.');
  }
}

export async function recordLoginFailure(email: string): Promise<void> {
  await recordEvent(loginFailureKey(email));
}

function extractBearerToken(req: NextRequest): string {
  const header = req.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new UnauthenticatedError();
  }
  return token;
}

/**
 * Verifies the Firebase ID token on every call — never cached, per
 * AGENTS.md §3.3 ("Every protected route/action must call token verification
 * before doing anything else"). Throws UnauthenticatedError on any failure
 * (missing header, expired/invalid/revoked token) rather than leaking why.
 */
export async function verifyFirebaseToken(req: NextRequest): Promise<DecodedIdToken> {
  const token = extractBearerToken(req);
  try {
    return await firebaseAdminAuth.verifyIdToken(token);
  } catch {
    throw new UnauthenticatedError();
  }
}

/**
 * Verifies the token AND resolves it to our own `users` row. This is what
 * every protected route/module should call to get the acting user — never
 * trust a `userId` from the request body/query (AGENTS.md §3.2).
 */
export async function getSessionUser(req: NextRequest): Promise<SessionUser> {
  const decoded = await verifyFirebaseToken(req);
  const user = await findUserByFirebaseUid(decoded.uid);
  if (!user) {
    throw new UnauthenticatedError('Session not established. Please sign in again.');
  }
  return user;
}

/**
 * Called only from POST /api/auth/session: verifies the token and creates
 * the `users` row on first login if it doesn't exist yet. `clientName` (see
 * auth.schema.ts establishSessionSchema) takes priority over the token's
 * `name` claim, which lags a client-side updateProfile() call until the
 * token is refreshed.
 */
export async function establishSession(
  req: NextRequest,
  clientName?: string,
): Promise<{ user: SessionUser; isNewUser: boolean }> {
  const decoded = await verifyFirebaseToken(req);
  return findOrCreateUserForFirebaseUid({
    firebaseUid: decoded.uid,
    email: decoded.email ?? '',
    name:
      clientName ??
      (decoded.name as string | undefined) ??
      decoded.email?.split('@')[0] ??
      'Customer',
  });
}

/** GET/PATCH /api/auth/me share this — resolves the caller to a fresh row. */
export async function getMyProfile(req: NextRequest): Promise<SessionUser> {
  return getSessionUser(req);
}

export async function updateMyProfile(
  req: NextRequest,
  input: UpdateProfileInput,
): Promise<SessionUser> {
  const user = await getSessionUser(req);
  return updateUserProfile(user.id, input);
}

/**
 * DELETE /api/auth/me: anonymizes the Postgres row and deletes the Firebase
 * user outright (unlike Postgres, there's no FK constraint holding it back,
 * and a deleted account shouldn't remain sign-in-able). Requires the ID
 * token's `auth_time` to be recent — the client re-authenticates
 * (reauthenticateWithCredential) and gets a fresh token before calling this,
 * per docs/Product_Spec_Requirements.md §1.4; checking auth_time server-side
 * is defense in depth against a stale token being replayed, not just a
 * client-side gate.
 */
export async function deleteMyAccount(req: NextRequest): Promise<void> {
  const decoded = await verifyFirebaseToken(req);
  const authAgeSeconds = Date.now() / 1000 - decoded.auth_time;
  if (authAgeSeconds > REAUTH_MAX_AGE_SECONDS) {
    throw new ReauthenticationRequiredError();
  }

  const user = await findUserByFirebaseUid(decoded.uid);
  if (!user) throw new UnauthenticatedError();

  await anonymizeUser(user.id);
  await firebaseAdminAuth.deleteUser(decoded.uid);
}
