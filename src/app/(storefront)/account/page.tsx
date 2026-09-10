'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/lib/api-client';
import { updateProfileSchema, type UpdateProfileInput } from '@/modules/auth/auth.schema';
import type { SessionUser } from '@/modules/auth/auth.types';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => authFetch<SessionUser>('/api/auth/me'),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileInput>({ resolver: zodResolver(updateProfileSchema) });

  // Populate the form once the fetch resolves — can't set defaultValues
  // up front since the data doesn't exist at first render.
  useEffect(() => {
    if (user) reset({ name: user.name, phone: user.phone ?? undefined });
  }, [user, reset]);

  const mutation = useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      authFetch<SessionUser>('/api/auth/me', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['auth', 'me'], updated);
      reset({ name: updated.name, phone: updated.phone ?? undefined });
    },
  });

  if (isLoading) {
    return (
      <div className="flex max-w-md flex-col gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-28" />
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <h2 className="text-foreground mb-4 text-lg font-semibold">Profile info</h2>
      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        noValidate
        className="flex flex-col gap-4"
      >
        <Input label="Full name" error={errors.name?.message} {...register('name')} />
        <Input
          label="Email"
          value={user?.email ?? ''}
          disabled
          readOnly
          title="Email is managed by your sign-in provider and can't be changed here."
        />
        <Input
          label="Phone"
          type="tel"
          placeholder="9876543210"
          error={errors.phone?.message}
          {...register('phone')}
        />

        {mutation.isSuccess && !isDirty && (
          <p role="status" className="text-success text-sm">
            Saved.
          </p>
        )}
        {mutation.isError && (
          <p role="alert" className="bg-error-bg text-error rounded-[10px] px-3 py-2 text-sm">
            Couldn&apos;t save your changes. Please try again.
          </p>
        )}

        <Button type="submit" loading={mutation.isPending} disabled={!isDirty} className="w-fit">
          Save changes
        </Button>
      </form>
    </div>
  );
}
