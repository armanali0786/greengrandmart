'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { z } from 'zod';
import { getFirebaseAuth, googleAuthProvider } from '@/lib/firebase-client';
import { useAuth } from '@/hooks/useAuth';
import { authFetch } from '@/lib/api-client';
import { toAuthErrorMessage } from '@/lib/firebase-auth-errors';
import { passwordSchema } from '@/modules/auth/auth.schema';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: passwordSchema,
});
type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

const deleteConsequence =
  "This will permanently delete your account and saved addresses. Your past orders are kept for accounting purposes but will no longer show your name or contact details. This can't be undone.";

export default function SecurityPage() {
  const { firebaseUser } = useAuth();
  const router = useRouter();
  const hasPasswordProvider = firebaseUser?.providerData.some((p) => p.providerId === 'password');

  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

  async function onChangePassword(data: ChangePasswordInput) {
    if (!firebaseUser?.email) return;
    setPasswordError(null);
    setPasswordSuccess(false);
    try {
      const credential = EmailAuthProvider.credential(firebaseUser.email, data.currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, data.newPassword);
      setPasswordSuccess(true);
      reset();
    } catch (error) {
      setPasswordError(toAuthErrorMessage(error));
    }
  }

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openDeleteModal() {
    setDeletePassword('');
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function handleDeleteAccount() {
    if (!firebaseUser) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      // Re-authenticate right before deleting so the ID token's auth_time is
      // fresh — the server independently checks this (see
      // modules/auth/auth.service.ts deleteMyAccount), it doesn't just trust
      // that the client did this step.
      if (hasPasswordProvider) {
        const credential = EmailAuthProvider.credential(firebaseUser.email!, deletePassword);
        await reauthenticateWithCredential(firebaseUser, credential);
      } else {
        await reauthenticateWithPopup(firebaseUser, googleAuthProvider);
      }

      await authFetch('/api/auth/me', { method: 'DELETE' });
      await signOut(getFirebaseAuth());
      router.push('/');
    } catch (error) {
      setDeleteError(toAuthErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-10">
      {hasPasswordProvider && (
        <section>
          <h2 className="text-foreground mb-4 text-lg font-semibold">Change password</h2>
          <form
            onSubmit={handleSubmit(onChangePassword)}
            noValidate
            className="flex flex-col gap-4"
          >
            <Input
              label="Current password"
              type="password"
              autoComplete="current-password"
              error={errors.currentPassword?.message}
              {...register('currentPassword')}
            />
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              error={errors.newPassword?.message}
              {...register('newPassword')}
            />
            {passwordSuccess && (
              <p role="status" className="text-success text-sm">
                Password updated.
              </p>
            )}
            {passwordError && (
              <p role="alert" className="bg-error-bg text-error rounded-[10px] px-3 py-2 text-sm">
                {passwordError}
              </p>
            )}
            <Button type="submit" loading={isSubmitting} className="w-fit">
              Update password
            </Button>
          </form>
        </section>
      )}

      <section>
        <h2 className="text-foreground mb-2 text-lg font-semibold">Delete account</h2>
        <p className="text-muted mb-4 text-sm">
          Permanently deletes your account. Your order history is retained for accounting purposes
          but is no longer linked to your name or contact details.
        </p>
        <Button variant="destructive" onClick={openDeleteModal}>
          Delete my account
        </Button>
      </section>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
        preventBackdropClose
      >
        <p className="text-muted text-sm">{deleteConsequence}</p>

        {hasPasswordProvider && (
          <Input
            label="Confirm your password"
            type="password"
            autoComplete="current-password"
            className="mt-4"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
          />
        )}

        {deleteError && (
          <p role="alert" className="bg-error-bg text-error mt-4 rounded-[10px] px-3 py-2 text-sm">
            {deleteError}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteAccount}
            loading={deleting}
            disabled={hasPasswordProvider && deletePassword.length === 0}
          >
            Delete account
          </Button>
        </div>
      </Modal>
    </div>
  );
}
