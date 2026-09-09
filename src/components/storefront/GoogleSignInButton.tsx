'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithPopup } from 'firebase/auth';
import { getFirebaseAuth, googleAuthProvider } from '@/lib/firebase-client';
import { establishSession } from '@/lib/session-bridge';
import { toAuthErrorMessage } from '@/lib/firebase-auth-errors';
import { Button } from '@/components/ui/Button';

export function GoogleSignInButton({ onError }: { onError: (message: string) => void }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    try {
      const credential = await signInWithPopup(getFirebaseAuth(), googleAuthProvider);
      await establishSession(credential.user, credential.user.displayName ?? undefined);
      router.push('/');
    } catch (error) {
      onError(toAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      loading={loading}
      onClick={handleClick}
      className="w-full"
    >
      Continue with Google
    </Button>
  );
}
