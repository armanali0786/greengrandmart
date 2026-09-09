'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch, ApiError } from '@/lib/api-client';
import { adjustStockSchema, type AdjustStockInput } from '@/modules/inventory/inventory.schema';
import type { InventoryListItem } from '@/modules/inventory/inventory.types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

function attributesText(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

export default function AdminInventoryPage() {
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useQuery({
    queryKey: ['admin', 'inventory'],
    queryFn: () => authFetch<InventoryListItem[]>('/api/admin/inventory'),
  });

  const [adjusting, setAdjusting] = useState<InventoryListItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AdjustStockInput>({
    resolver: zodResolver(adjustStockSchema),
    defaultValues: { type: 'restock', quantity: 1, note: '' },
  });

  function openAdjust(item: InventoryListItem) {
    reset({ type: 'restock', quantity: 1, note: '' });
    setFormError(null);
    setAdjusting(item);
  }

  const mutation = useMutation({
    mutationFn: (input: AdjustStockInput) =>
      authFetch(`/api/admin/inventory/${adjusting!.variantId}/adjust`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      setAdjusting(null);
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : 'Something went wrong.'),
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-semibold">Inventory</h1>
        <p className="text-muted text-sm">
          Stock only ever changes here — restocks, damage, and manual corrections are all logged.
        </p>
      </div>

      {isLoading ? (
        <div className="bg-primary-50 h-64 animate-pulse rounded-[10px]" />
      ) : !items || items.length === 0 ? (
        <p className="border-border bg-surface text-muted rounded-[10px] border px-4 py-16 text-center text-sm">
          No variants yet — create a product first.
        </p>
      ) : (
        <div className="border-border bg-surface overflow-x-auto rounded-[10px] border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted border-b text-left">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Available</th>
                <th className="px-4 py-3 font-medium">Reserved</th>
                <th className="px-4 py-3 font-medium">Sold</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {items.map((item) => (
                <tr key={item.variantId}>
                  <td className="px-4 py-3">
                    <p className="text-foreground font-medium">{item.productName}</p>
                    {Object.keys(item.attributes).length > 0 && (
                      <p className="text-muted text-xs">{attributesText(item.attributes)}</p>
                    )}
                  </td>
                  <td className="text-muted px-4 py-3">{item.sku}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        item.lowStock ? 'text-error font-semibold' : 'text-foreground font-medium'
                      }
                    >
                      {item.availableQty}
                    </span>
                    {item.lowStock && (
                      <span className="bg-error-bg text-error ml-2 rounded-full px-2 py-0.5 text-xs">
                        Low stock
                      </span>
                    )}
                  </td>
                  <td className="text-muted px-4 py-3">{item.reservedQty}</td>
                  <td className="text-muted px-4 py-3">{item.soldQty}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="secondary" size="sm" onClick={() => openAdjust(item)}>
                      Adjust
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!adjusting}
        onClose={() => setAdjusting(null)}
        title={adjusting ? `Adjust stock — ${adjusting.productName}` : 'Adjust stock'}
      >
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          noValidate
          className="flex flex-col gap-4"
        >
          <div>
            <label htmlFor="type" className="text-foreground mb-1.5 block text-sm font-medium">
              Type
            </label>
            <select
              id="type"
              {...register('type')}
              className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
            >
              <option value="restock">Restock (add)</option>
              <option value="damage">Damage (remove)</option>
              <option value="adjustment">Manual correction (+/-)</option>
            </select>
          </div>
          <Input
            label="Quantity"
            type="number"
            error={errors.quantity?.message}
            {...register('quantity', { valueAsNumber: true })}
          />
          <Input label="Note (required)" error={errors.note?.message} {...register('note')} />
          {formError && (
            <p role="alert" className="bg-error-bg text-error rounded-[10px] px-3 py-2 text-sm">
              {formError}
            </p>
          )}
          <div className="mt-2 flex gap-3">
            <Button type="button" variant="secondary" onClick={() => setAdjusting(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Save adjustment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
