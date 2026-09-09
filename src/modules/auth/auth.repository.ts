import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { SessionUser } from '@/modules/auth/auth.types';

function toSessionUser(user: {
  id: string;
  firebaseUid: string;
  email: string;
  name: string;
  phone: string | null;
  phoneVerified: boolean;
  role: string;
}): SessionUser {
  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    name: user.name,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    // `role` is a CHECK-constrained text column, not a Prisma enum (see
    // schema.prisma comment) — the DB guarantees it's one of the three values.
    role: user.role as SessionUser['role'],
  };
}

export async function findUserByFirebaseUid(firebaseUid: string): Promise<SessionUser | null> {
  const user = await db.user.findUnique({ where: { firebaseUid, deletedAt: null } });
  return user ? toSessionUser(user) : null;
}

/**
 * Creates the `users` row on first login, or returns the existing one.
 * Called from POST /api/auth/session after Firebase has already verified the
 * caller's identity — this never changes an existing user's role.
 */
export async function findOrCreateUserForFirebaseUid(params: {
  firebaseUid: string;
  email: string;
  name: string;
}): Promise<{ user: SessionUser; isNewUser: boolean }> {
  // Optimistic create, not find-then-create: this can be called concurrently
  // for the same brand-new user (e.g. a signup page's explicit bridge call
  // racing a Google-sign-in or another tab), and a plain find-then-create
  // would let both calls pass the "not found" check before either commits,
  // crashing the loser on the firebase_uid unique constraint. Falling back
  // to a lookup on conflict, rather than upsert, keeps isNewUser unambiguous
  // — it's true only when this call's own insert actually won.
  try {
    const created = await db.user.create({
      data: {
        firebaseUid: params.firebaseUid,
        email: params.email,
        name: params.name,
        role: 'customer',
      },
    });
    return { user: toSessionUser(created), isNewUser: true };
  } catch (e) {
    const isUniqueConstraintError =
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
    if (!isUniqueConstraintError) throw e;

    // Disambiguate firebase_uid vs. email conflicts by re-querying rather
    // than parsing `e.meta.target` — the pg driver adapter doesn't populate
    // it the way the classic engine does. A hit here means it was genuinely
    // the concurrent-create race described above; a miss means the create
    // failed for some other unique constraint (e.g. email), which we must
    // not silently swallow.
    const existing = await findUserByFirebaseUid(params.firebaseUid);
    if (!existing) throw e;
    return { user: existing, isNewUser: false };
  }
}

/**
 * Updates name/phone only (docs/API_Spec.md `PATCH /auth/me`). Changing the
 * phone number resets phoneVerified to false — a verification is tied to the
 * specific number that was OTP-confirmed (modules/otp, Phase 9), not to the
 * account in general, so a new number is unverified until proven otherwise.
 */
export async function updateUserProfile(
  userId: string,
  input: { name?: string; phone?: string },
): Promise<SessionUser> {
  const current = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const phoneChanged = input.phone !== undefined && input.phone !== current.phone;

  const updated = await db.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(phoneChanged && { phoneVerified: false }),
    },
  });
  return toSessionUser(updated);
}

/**
 * Anonymizes PII per docs/Product_Spec_Requirements.md §1.4 and
 * docs/Privacy_Data_Handling.md: name/email/phone stripped, `deleted_at` set
 * (soft delete — the row itself is kept because orders.user_id is
 * ON DELETE RESTRICT, and order records must be retained for accounting/tax
 * purposes). Email is anonymized to a per-user-unique placeholder, not a
 * fixed string, since `email` is UNIQUE and a second deletion would otherwise
 * collide. Addresses are hard-deleted, not anonymized — they're not needed
 * for tax records the way order line items are (Privacy_Data_Handling.md).
 */
export async function anonymizeUser(userId: string): Promise<void> {
  await db.$transaction([
    db.address.deleteMany({ where: { userId } }),
    db.user.update({
      where: { id: userId },
      data: {
        name: 'Deleted User',
        email: `deleted+${userId}@deleted.invalid`,
        phone: null,
        phoneVerified: false,
        deletedAt: new Date(),
      },
    }),
  ]);
}
