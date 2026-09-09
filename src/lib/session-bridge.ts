import type { User } from 'firebase/auth';

/**
 * Bridges a verified Firebase identity into our own `users` table (creates
 * it on first login) via POST /api/auth/session. Called explicitly, right
 * after each sign-in flow's own Firebase call — not automatically from
 * useAuth, see that hook's comment for why (a race with updateProfile()).
 */
export async function establishSession(firebaseUser: User, name?: string): Promise<void> {
  const idToken = await firebaseUser.getIdToken();
  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(name ? { name } : {}),
  });
}
