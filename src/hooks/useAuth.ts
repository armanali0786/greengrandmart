'use client';

import { useEffect, useState } from 'react';
import { onIdTokenChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase-client';

interface AuthState {
  firebaseUser: User | null;
  loading: boolean;
}

/**
 * Firebase Auth SDK's own listener, exposed as a hook (docs/Coding_Standards.md
 * §7 "Auth state"). Deliberately does NOT also bridge into POST
 * /api/auth/session here — every sign-in entry point (signup, login,
 * GoogleSignInButton) calls that explicitly right after its own Firebase
 * call, in the order it needs (e.g. signup awaits updateProfile() first, so
 * the correct display name reaches the backend on account creation). Doing
 * it here too raced those explicit calls: an auth-state listener fires the
 * instant a user is created, ahead of a signup page's updateProfile(), so a
 * second concurrent call to /auth/session would only ever see the not-yet-set
 * display name.
 *
 * Uses onIdTokenChanged rather than onAuthStateChanged: the latter only
 * fires on sign-in/sign-out, so a profile update (e.g. updateProfile() at
 * signup) wouldn't otherwise re-render components reading this hook until
 * some unrelated later auth event. onIdTokenChanged also fires on token
 * refresh, which every sign-in flow's own establishSession() call already
 * triggers via getIdToken() — so the header etc. pick up the new name
 * without any extra plumbing.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ firebaseUser: null, loading: true });

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(getFirebaseAuth(), (firebaseUser) => {
      setState({ firebaseUser, loading: false });
    });
    return unsubscribe;
  }, []);

  return state;
}
