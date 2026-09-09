'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase-client';
import { toAuthErrorMessage } from '@/lib/firebase-auth-errors';
import { resetPasswordSchema, type ResetPasswordInput } from '@/modules/auth/auth.schema';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get('oobCode');

  const [codeState, setCodeState] = useState<'checking' | 'valid' | 'invalid'>(
    oobCode ? 'checking' : 'invalid',
  );
  const [email, setEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema), mode: 'onBlur' });

  useEffect(() => {
    if (!oobCode) return;
    verifyPasswordResetCode(getFirebaseAuth(), oobCode)
      .then((verifiedEmail) => {
        setEmail(verifiedEmail);
        setCodeState('valid');
      })
      .catch(() => setCodeState('invalid'));
  }, [oobCode]);

  async function onSubmit(data: ResetPasswordInput) {
    if (!oobCode) return;
    setFormError(null);
    try {
      await confirmPasswordReset(getFirebaseAuth(), oobCode, data.password);
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (error) {
      setFormError(toAuthErrorMessage(error));
    }
  }

  if (codeState === 'checking') {
    return <p className="text-muted px-4 py-12 text-center text-sm">Checking your link…</p>;
  }

  if (codeState === 'invalid') {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12 text-center sm:px-6">
        <h1 className="text-foreground text-2xl font-semibold">Link expired or invalid</h1>
        <p className="text-muted text-sm">Password reset links are valid for a limited time.</p>
        <Link href="/forgot-password" className="text-primary-700 font-medium hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12 text-center sm:px-6">
        <h1 className="text-foreground text-2xl font-semibold">Password updated</h1>
        <p className="text-muted text-sm">Redirecting you to log in…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12 sm:px-6">
      <div>
        <h1 className="text-foreground text-2xl font-semibold">Set a new password</h1>
        {email && <p className="text-muted mt-1 text-sm">For {email}</p>}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />

        {formError && (
          <p role="alert" className="bg-error-bg text-error rounded-[10px] px-3 py-2 text-sm">
            {formError}
          </p>
        )}

        <Button type="submit" loading={isSubmitting} className="w-full">
          Update password
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="text-muted px-4 py-12 text-center text-sm">Loading…</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
