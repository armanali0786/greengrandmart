'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { authFetch, ApiError } from '@/lib/api-client';
import { createCategorySchema, type CreateCategoryInput } from '@/modules/catalog/catalog.schema';
import type { CategoryNode } from '@/modules/catalog/catalog.types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

function flatten(nodes: CategoryNode[], depth = 0): (CategoryNode & { depth: number })[] {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flatten(n.children, depth + 1)]);
}

export default function AdminCategoriesPage() {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const {
    data: tree,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['categories'],
    queryFn: () => authFetch<CategoryNode[]>('/api/admin/categories'),
  });
  const flat = tree ? flatten(tree) : [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryNode | null>(null);
  const [deleting, setDeleting] = useState<CategoryNode | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['categories'] });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateCategoryInput>({ resolver: zodResolver(createCategorySchema) });

  function openCreate() {
    reset({ name: '', slug: '' });
    setEditing(null);
    setFormError(null);
    setFormOpen(true);
  }
  function openEdit(category: CategoryNode) {
    reset({ name: category.name, slug: category.slug });
    setEditing(category);
    setFormError(null);
    setFormOpen(true);
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/api/admin/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      show({ message: 'Category deleted.', variant: 'success' });
    },
    onError: (e) =>
      show({
        message: e instanceof ApiError ? e.message : 'Could not delete category.',
        variant: 'error',
      }),
  });

  async function onSubmit(data: CreateCategoryInput) {
    setFormError(null);
    try {
      if (editing) {
        await authFetch(`/api/admin/categories/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
      } else {
        await authFetch('/api/admin/categories', { method: 'POST', body: JSON.stringify(data) });
      }
      invalidate();
      setFormOpen(false);
      show({ message: editing ? 'Category updated.' : 'Category created.', variant: 'success' });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Something went wrong.';
      setFormError(message);
      show({ message, variant: 'error' });
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-foreground text-2xl font-semibold">Categories</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New category
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
          Failed to load categories.
        </p>
      ) : flat.length === 0 ? (
        <p className="border-border bg-surface text-muted rounded-[10px] border px-4 py-16 text-center text-sm">
          No categories yet.
        </p>
      ) : (
        <div className="border-border divide-border bg-surface divide-y overflow-hidden rounded-[10px] border">
          {flat.map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between px-4 py-3"
              style={{ paddingLeft: `${1 + category.depth * 1.5}rem` }}
            >
              <div>
                <p className="text-foreground text-sm font-medium">{category.name}</p>
                <p className="text-muted text-xs">/{category.slug}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => openEdit(category)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleting(category)}>
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
        title={editing ? 'Edit category' : 'New category'}
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
              {editing ? 'Save changes' : 'Create category'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleteMutation.mutateAsync(deleting!.id).then(() => {})}
        title="Delete this category?"
        description={`"${deleting?.name}" will be removed. Products in it are not deleted, just uncategorized.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
