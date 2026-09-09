'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase-client';
import { establishSession } from '@/lib/session-bridge';
import { toAuthErrorMessage } from '@/lib/firebase-auth-errors';
import { signUpSchema, type SignUpInput } from '@/modules/auth/auth.schema';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { GoogleSignInButton } from '@/components/storefront/GoogleSignInButton';

export default function SignUpPage() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema), mode: 'onBlur' });

  async function onSubmit(data: SignUpInput) {
    setFormError(null);
    try {
      const credential = await createUserWithEmailAndPassword(
        getFirebaseAuth(),
        data.email,
        data.password,
      );
      await updateProfile(credential.user, { displayName: data.name });
      // updateProfile() mutates credential.user but doesn't itself notify
      // other components' useAuth() listeners — reload() does, so the header
      // picks up the new name immediately instead of showing the email
      // until the next unrelated auth-state event.
      await credential.user.reload();
      await establishSession(credential.user, data.name);
      router.push('/');
    } catch (error) {
      setFormError(toAuthErrorMessage(error));
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12 sm:px-6">
      <div>
        <h1 className="text-foreground text-2xl font-semibold">Create your account</h1>
        <p className="text-muted mt-1 text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-primary-700 font-medium hover:underline">
            Log in
          </Link>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input
          label="Full name"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
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
          Create account
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
