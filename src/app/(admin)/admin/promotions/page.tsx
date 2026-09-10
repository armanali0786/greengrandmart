'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { authFetch, ApiError } from '@/lib/api-client';
import { toRupeeDisplay } from '@/lib/money';
import { PromotionForm } from '@/components/admin/PromotionForm';
import type { CreatePromotionInput } from '@/modules/pricing/pricing.schema';
import type { PromotionSummary } from '@/modules/pricing/pricing.types';
import type { CategoryNode, BrandSummary } from '@/modules/catalog/catalog.types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';

function promotionValueLabel(promotion: PromotionSummary): string {
  if (promotion.rules.type === 'free_shipping') {
    return promotion.rules.minCartValue > 0
      ? `Free shipping above ${toRupeeDisplay(promotion.rules.minCartValue)}`
      : 'Free shipping';
  }
  const { discountType, value, scope } = promotion.rules;
  const amount = discountType === 'percentage' ? `${value}%` : toRupeeDisplay(value);
  const scopeLabel =
    scope.scope === 'all'
      ? 'everything'
      : scope.scope === 'categories'
        ? 'selected categories'
        : 'selected brands';
  return `${amount} off ${scopeLabel}`;
}

function promotionStatus(promotion: PromotionSummary): { label: string; className: string } {
  if (!promotion.active) return { label: 'Inactive', className: 'bg-primary-50 text-muted' };
  if (promotion.expiresAt && new Date(promotion.expiresAt) < new Date()) {
    return { label: 'Expired', className: 'bg-error-bg text-error' };
  }
  return { label: 'Active', className: 'bg-primary-50 text-primary-700' };
}

export default function AdminPromotionsPage() {
  const queryClient = useQueryClient();
  const {
    data: promotions,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin', 'promotions'],
    queryFn: () => authFetch<PromotionSummary[]>('/api/admin/promotions'),
  });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => authFetch<CategoryNode[]>('/api/admin/categories'),
  });
  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: () => authFetch<BrandSummary[]>('/api/admin/brands'),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PromotionSummary | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'promotions'] });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      authFetch(`/api/admin/promotions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      }),
    onSuccess: invalidate,
  });

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setFormOpen(true);
  }
  function openEdit(promotion: PromotionSummary) {
    setEditing(promotion);
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSubmit(input: CreatePromotionInput) {
    setFormError(null);
    try {
      if (editing) {
        await authFetch(`/api/admin/promotions/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(input),
        });
      } else {
        await authFetch('/api/admin/promotions', { method: 'POST', body: JSON.stringify(input) });
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
        <h1 className="text-foreground text-2xl font-semibold">Promotions</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New promotion
        </Button>
      </div>

      {isLoading ? (
        <div className="border-border bg-surface divide-border divide-y overflow-hidden rounded-[10px] border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-9 w-16" />
                <Skeleton className="h-9 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <p
          role="alert"
          className="bg-error-bg text-error rounded-[10px] px-4 py-16 text-center text-sm"
        >
          Failed to load promotions.
        </p>
      ) : !promotions || promotions.length === 0 ? (
        <p className="border-border bg-surface text-muted rounded-[10px] border px-4 py-16 text-center text-sm">
          No promotions yet.
        </p>
      ) : (
        <div className="border-border bg-surface divide-border divide-y overflow-hidden rounded-[10px] border">
          {promotions.map((promotion) => {
            const status = promotionStatus(promotion);
            return (
              <div key={promotion.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-foreground text-sm font-medium">{promotion.name}</p>
                  <p className="text-muted text-xs">{promotionValueLabel(promotion)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${status.className}`}>
                    {status.label}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(promotion)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={toggleActive.isPending && toggleActive.variables?.id === promotion.id}
                    onClick={() =>
                      toggleActive.mutate({ id: promotion.id, active: !promotion.active })
                    }
                  >
                    {promotion.active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit promotion' : 'New promotion'}
        className="max-w-lg"
      >
        {categories && brands && (
          <>
            <PromotionForm
              categories={categories}
              brands={brands}
              defaultValues={
                editing
                  ? {
                      name: editing.name,
                      type: editing.rules.type,
                      startsAt: editing.startsAt?.slice(0, 10),
                      expiresAt: editing.expiresAt?.slice(0, 10),
                      active: editing.active,
                      ...(editing.rules.type === 'category_discount'
                        ? {
                            discountType: editing.rules.discountType,
                            value:
                              editing.rules.discountType === 'percentage'
                                ? editing.rules.value
                                : editing.rules.value / 100,
                            // Same 'products'-scope fallback as CouponForm — see that page's comment.
                            scopeType:
                              editing.rules.scope.scope === 'categories' ||
                              editing.rules.scope.scope === 'brands'
                                ? editing.rules.scope.scope
                                : 'all',
                            categoryIds:
                              editing.rules.scope.scope === 'categories'
                                ? editing.rules.scope.categoryIds
                                : [],
                            brandIds:
                              editing.rules.scope.scope === 'brands'
                                ? editing.rules.scope.brandIds
                                : [],
                          }
                        : { minCartValue: editing.rules.minCartValue / 100 }),
                    }
                  : undefined
              }
              onSubmit={handleSubmit}
              submitLabel={editing ? 'Save changes' : 'Create promotion'}
            />
            {formError && (
              <p
                role="alert"
                className="bg-error-bg text-error mt-4 rounded-[10px] px-3 py-2 text-sm"
              >
                {formError}
              </p>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
