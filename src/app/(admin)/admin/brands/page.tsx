'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { authFetch, ApiError } from '@/lib/api-client';
import { createBrandSchema, type CreateBrandInput } from '@/modules/catalog/catalog.schema';
import type { BrandSummary } from '@/modules/catalog/catalog.types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';

export default function AdminBrandsPage() {
  const queryClient = useQueryClient();
  const {
    data: brands,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['brands'],
    queryFn: () => authFetch<BrandSummary[]>('/api/admin/brands'),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BrandSummary | null>(null);
  const [deleting, setDeleting] = useState<BrandSummary | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['brands'] });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateBrandInput>({ resolver: zodResolver(createBrandSchema) });

  function openCreate() {
    reset({ name: '', slug: '' });
    setEditing(null);
    setFormError(null);
    setFormOpen(true);
  }
  function openEdit(brand: BrandSummary) {
    reset({ name: brand.name, slug: brand.slug });
    setEditing(brand);
    setFormError(null);
    setFormOpen(true);
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/api/admin/brands/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
    },
  });

  async function onSubmit(data: CreateBrandInput) {
    setFormError(null);
    try {
      if (editing) {
        await authFetch(`/api/admin/brands/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
      } else {
        await authFetch('/api/admin/brands', { method: 'POST', body: JSON.stringify(data) });
      }
      invalidate();
      setFormOpen(false);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-foreground text-2xl font-semibold">Brands</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New brand
        </Button>
      </div>

      {isLoading ? (
        <div className="border-border divide-border bg-surface divide-y overflow-hidden rounded-[10px] border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-16" />
                <Skeleton className="h-9 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <p
          role="alert"
          className="bg-error-bg text-error rounded-[10px] px-4 py-16 text-center text-sm"
        >
          Failed to load brands.
        </p>
      ) : !brands || brands.length === 0 ? (
        <p className="border-border bg-surface text-muted rounded-[10px] border px-4 py-16 text-center text-sm">
          No brands yet.
        </p>
      ) : (
        <div className="border-border divide-border bg-surface divide-y overflow-hidden rounded-[10px] border">
          {brands.map((brand) => (
            <div key={brand.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-foreground text-sm font-medium">{brand.name}</p>
                <p className="text-muted text-xs">/{brand.slug}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => openEdit(brand)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleting(brand)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit brand' : 'New brand'}
      >
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Input label="Name" error={errors.name?.message} {...register('name')} />
          <Input label="Slug" error={errors.slug?.message} {...register('slug')} />
          {formError && (
            <p role="alert" className="bg-error-bg text-error rounded-[10px] px-3 py-2 text-sm">
              {formError}
            </p>
          )}
          <div className="mt-2 flex gap-3">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editing ? 'Save changes' : 'Create brand'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteMutation.mutateAsync(deleting!.id).then(() => {})}
        title="Delete this brand?"
        description={`"${deleting?.name}" will be removed. Products with this brand are not deleted, just unbranded.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
