'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase-client';
import { establishSession } from '@/lib/session-bridge';
import { toAuthErrorMessage } from '@/lib/firebase-auth-errors';
import { loginSchema, type LoginInput } from '@/modules/auth/auth.schema';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { GoogleSignInButton } from '@/components/storefront/GoogleSignInButton';

export default function LoginPage() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), mode: 'onBlur' });

  async function onSubmit(data: LoginInput) {
    setFormError(null);

    const lockoutCheck = await fetch('/api/auth/login-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email }),
    });
    if (lockoutCheck.status === 429) {
      setFormError('Too many failed attempts. Please try again in 15 minutes.');
      return;
    }

    try {
      const credential = await signInWithEmailAndPassword(
        getFirebaseAuth(),
        data.email,
        data.password,
      );
      await establishSession(credential.user);
      router.push('/');
    } catch (error) {
      // Fire-and-forget: a slow/failed record call shouldn't block showing
      // the user their (already-known) sign-in error.
      fetch('/api/auth/login-failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      }).catch(() => {});
      setFormError(toAuthErrorMessage(error));
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12 sm:px-6">
      <div>
        <h1 className="text-foreground text-2xl font-semibold">Log in</h1>
        <p className="text-muted mt-1 text-sm">
          New to GreenGrandMart?{' '}
          <Link href="/signup" className="text-primary-700 font-medium hover:underline">
            Create an account
          </Link>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Link
          href="/forgot-password"
          className="text-primary-700 -mt-2 self-end text-sm font-medium hover:underline"
        >
          Forgot password?
        </Link>

        {formError && (
          <p role="alert" className="bg-error-bg text-error rounded-[10px] px-3 py-2 text-sm">
            {formError}
          </p>
        )}

        <Button type="submit" loading={isSubmitting} className="w-full">
          Log in
        </Button>
      </form>

      <div className="text-muted flex items-center gap-3 text-xs">
        <div className="bg-border h-px flex-1" />
        or
        <div className="bg-border h-px flex-1" />
      </div>

      <GoogleSignInButton onError={setFormError} />
    </div>
  );
}
