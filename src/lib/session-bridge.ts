import type { User } from 'firebase/auth';

/**
 * Bridges a verified Firebase identity into our own `users` table (creates
 * it on first login) via POST /api/auth/session. Called explicitly, right
 * after each sign-in flow's own Firebase call — not automatically from
 * useAuth, see that hook's comment for why (a race with updateProfile()).
 *
 * Also merges any guest cart (docs/API_Spec.md `POST /cart/merge`) into the
 * now-identified user's cart, right here rather than duplicated at each of
 * the three call sites (signup/login/Google) — a merge failure is swallowed
 * rather than blocking sign-in, since losing a guest cart merge is much
 * less bad than failing a login over it.
 */
export async function establishSession(firebaseUser: User, name?: string): Promise<void> {
  const idToken = await firebaseUser.getIdToken();
  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(name ? { name } : {}),
  });
  await fetch('/api/cart/merge', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  }).catch(() => {});
}
