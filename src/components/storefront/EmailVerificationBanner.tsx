'use client';

import { useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { Mail, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

/**
 * docs/Product_Spec_Requirements.md §1.1: the account is usable immediately
 * after signup regardless of verification state — this is a reminder, not a
 * gate. Dismissal is per-session only (component state, not persisted): the
 * account is still unverified next visit, so nagging again is correct, not a
 * bug.
 */
export function EmailVerificationBanner() {
  const { firebaseUser, loading } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  if (loading || !firebaseUser || firebaseUser.emailVerified || dismissed) return null;

  async function handleResend() {
    if (!firebaseUser) return;
    setStatus('sending');
    try {
      await sendEmailVerification(firebaseUser);
      setStatus('sent');
    } catch {
      setStatus('idle');
    }
  }

  return (
    <div className="border-accent-500/40 bg-accent-100 text-foreground border-b px-4 py-2.5 text-sm sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <Mail className="text-accent-600 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="flex-1">
          {status === 'sent'
            ? 'Verification email sent — check your inbox.'
            : 'Please verify your email address.'}
          {status !== 'sent' && (
            <button
              type="button"
              onClick={handleResend}
              disabled={status === 'sending'}
              className="ml-2 font-medium underline underline-offset-2 disabled:opacity-50"
            >
              {status === 'sending' ? 'Sending…' : 'Resend email'}
            </button>
          )}
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="icon-button text-muted hover:text-foreground shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
