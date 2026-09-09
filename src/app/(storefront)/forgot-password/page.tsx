'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { sendPasswordResetEmail } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { getFirebaseAuth } from '@/lib/firebase-client';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/modules/auth/auth.schema';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), mode: 'onBlur' });

  async function onSubmit(data: ForgotPasswordInput) {
    setFormError(null);
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), data.email, {
        url: `${window.location.origin}/reset-password`,
        handleCodeInApp: true,
      });
      setSent(true);
    } catch (error) {
      // auth/user-not-found is deliberately NOT surfaced as a distinct
      // message — doing so would let an attacker enumerate registered
      // emails. Show the same "check your email" state either way.
      if (error instanceof FirebaseError && error.code === 'auth/user-not-found') {
        setSent(true);
        return;
      }
      setFormError('Something went wrong. Please try again.');
    }
  }

  if (sent) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12 text-center sm:px-6">
        <h1 className="text-foreground text-2xl font-semibold">Check your email</h1>
        <p className="text-muted text-sm">
          If an account exists for that address, we&apos;ve sent a link to reset your password.
        </p>
        <Link href="/login" className="text-primary-700 font-medium hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12 sm:px-6">
      <div>
        <h1 className="text-foreground text-2xl font-semibold">Reset your password</h1>
        <p className="text-muted mt-1 text-sm">
          Enter your email and we&apos;ll send you a link to reset your password.
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

        {formError && (
          <p role="alert" className="bg-error-bg text-error rounded-[10px] px-3 py-2 text-sm">
            {formError}
          </p>
        )}

        <Button type="submit" loading={isSubmitting} className="w-full">
          Send reset link
        </Button>
      </form>

      <Link
        href="/login"
        className="text-primary-700 text-center text-sm font-medium hover:underline"
      >
        Back to log in
      </Link>
    </div>
  );
}
