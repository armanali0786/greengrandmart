'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { authFetch, ApiError } from '@/lib/api-client';
import { toRupeeDisplay } from '@/lib/money';
import { CouponForm } from '@/components/admin/CouponForm';
import type { CreateCouponInput } from '@/modules/pricing/pricing.schema';
import type { CouponSummary } from '@/modules/pricing/pricing.types';
import type { CategoryNode, BrandSummary } from '@/modules/catalog/catalog.types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';

function couponValueLabel(coupon: CouponSummary): string {
  return coupon.type === 'percentage' ? `${coupon.value}%` : toRupeeDisplay(coupon.value);
}

function couponStatus(coupon: CouponSummary): { label: string; className: string } {
  if (!coupon.active) return { label: 'Inactive', className: 'bg-primary-50 text-muted' };
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return { label: 'Expired', className: 'bg-error-bg text-error' };
  }
  return { label: 'Active', className: 'bg-primary-50 text-primary-700' };
}

export default function AdminCouponsPage() {
  const queryClient = useQueryClient();
  const {
    data: coupons,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin', 'coupons'],
    queryFn: () => authFetch<CouponSummary[]>('/api/admin/coupons'),
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
  const [editing, setEditing] = useState<CouponSummary | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      authFetch(`/api/admin/coupons/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
    onSuccess: invalidate,
  });

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setFormOpen(true);
  }
  function openEdit(coupon: CouponSummary) {
    setEditing(coupon);
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSubmit(input: CreateCouponInput) {
    setFormError(null);
    try {
      if (editing) {
        await authFetch(`/api/admin/coupons/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(input),
        });
      } else {
        await authFetch('/api/admin/coupons', { method: 'POST', body: JSON.stringify(input) });
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
        <h1 className="text-foreground text-2xl font-semibold">Coupons</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New coupon
        </Button>
      </div>

      {isLoading ? (
        <div className="border-border bg-surface overflow-x-auto rounded-[10px] border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted border-b text-left">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Usage</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-20" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-12" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Skeleton className="ml-auto h-8 w-28" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : isError ? (
        <p
          role="alert"
          className="bg-error-bg text-error rounded-[10px] px-4 py-16 text-center text-sm"
        >
          Failed to load coupons.
        </p>
      ) : !coupons || coupons.length === 0 ? (
        <p className="border-border bg-surface text-muted rounded-[10px] border px-4 py-16 text-center text-sm">
          No coupons yet.
        </p>
      ) : (
        <div className="border-border bg-surface overflow-x-auto rounded-[10px] border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted border-b text-left">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Usage</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {coupons.map((coupon) => {
                const status = couponStatus(coupon);
                return (
                  <tr key={coupon.id}>
                    <td className="text-foreground px-4 py-3 font-medium">{coupon.code}</td>
                    <td className="text-muted px-4 py-3">{couponValueLabel(coupon)}</td>
                    <td className="text-muted px-4 py-3">
                      {coupon.redemptionCount}
                      {coupon.usageLimitTotal ? ` / ${coupon.usageLimitTotal}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(coupon)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={
                            toggleActive.isPending && toggleActive.variables?.id === coupon.id
                          }
                          onClick={() =>
                            toggleActive.mutate({ id: coupon.id, active: !coupon.active })
                          }
                        >
                          {coupon.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit coupon' : 'New coupon'}
        className="max-w-lg"
      >
        {categories && brands && (
          <>
            <CouponForm
              categories={categories}
              brands={brands}
              defaultValues={
                editing
                  ? {
                      code: editing.code,
                      type: editing.type,
                      value: editing.type === 'percentage' ? editing.value : editing.value / 100,
                      maxDiscount: editing.maxDiscount ? editing.maxDiscount / 100 : undefined,
                      minCartValue: editing.minCartValue / 100,
                      startsAt: editing.startsAt?.slice(0, 10),
                      expiresAt: editing.expiresAt?.slice(0, 10),
                      usageLimitTotal: editing.usageLimitTotal ?? undefined,
                      firstOrderOnly: editing.firstOrderOnly,
                      active: editing.active,
                      // 'products' scope can exist (the API/schema supports it) but this
                      // minimal admin form doesn't offer a product picker — falls back
                      // to 'all' if editing such a coupon here, rather than crashing.
                      scopeType:
                        editing.appliesTo.scope === 'categories' ||
                        editing.appliesTo.scope === 'brands'
                          ? editing.appliesTo.scope
                          : 'all',
                      categoryIds:
                        editing.appliesTo.scope === 'categories'
                          ? editing.appliesTo.categoryIds
                          : [],
                      brandIds:
                        editing.appliesTo.scope === 'brands' ? editing.appliesTo.brandIds : [],
                    }
                  : undefined
              }
              onSubmit={handleSubmit}
              submitLabel={editing ? 'Save changes' : 'Create coupon'}
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
