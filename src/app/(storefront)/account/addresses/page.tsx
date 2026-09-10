'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Star } from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import type { AddressInput } from '@/modules/auth/address.schema';
import type { AddressRecord } from '@/modules/auth/address.repository';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AddressForm } from '@/components/storefront/AddressForm';

export default function AddressesPage() {
  const queryClient = useQueryClient();
  const { data: addresses, isLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => authFetch<AddressRecord[]>('/api/addresses'),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['addresses'] });

  const createMutation = useMutation({
    mutationFn: (input: AddressInput) =>
      authFetch('/api/addresses', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AddressInput }) =>
      authFetch(`/api/addresses/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/api/addresses/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      setDeletingId(null);
    },
  });

  const editingAddress = addresses?.find((a) => a.id === editingId);
  const deletingAddress = addresses?.find((a) => a.id === deletingId);

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-border bg-surface rounded-[10px] border p-4">
            <Skeleton className="mb-3 h-4 w-28" />
            <Skeleton className="mb-1.5 h-4 w-32" />
            <Skeleton className="mb-1.5 h-3 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-foreground text-lg font-semibold">Addresses</h2>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add address
        </Button>
      </div>

      {addresses && addresses.length === 0 && (
        <p className="border-border bg-surface text-muted rounded-[10px] border px-4 py-8 text-center text-sm">
          No addresses saved yet.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {addresses?.map((address) => (
          <div
            key={address.id}
            data-testid="address-card"
            className="border-border bg-surface rounded-[10px] border p-4"
          >
            <div className="mb-2 flex flex-wrap gap-2">
              {address.isDefaultShipping && (
                <span className="bg-primary-50 text-primary-700 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                  <Star className="h-3 w-3" aria-hidden="true" /> Default shipping
                </span>
              )}
              {address.isDefaultBilling && (
                <span className="bg-accent-100 text-accent-600 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                  <Star className="h-3 w-3" aria-hidden="true" /> Default billing
                </span>
              )}
            </div>
            <p className="text-foreground font-medium">{address.name}</p>
            <p className="text-muted text-sm">{address.phone}</p>
            <p className="text-muted mt-1 text-sm">
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ''}
              {address.landmark ? `, ${address.landmark}` : ''}
              <br />
              {address.city}, {address.state} {address.postalCode}
            </p>
            <div className="mt-3 flex gap-3">
              <Button variant="secondary" size="sm" onClick={() => setEditingId(address.id)}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeletingId(address.id)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Add address">
        <AddressForm
          submitLabel="Add address"
          onCancel={() => setFormOpen(false)}
          onSubmit={(input) => createMutation.mutateAsync(input).then(() => {})}
        />
      </Modal>

      <Modal open={!!editingAddress} onClose={() => setEditingId(null)} title="Edit address">
        {editingAddress && (
          <AddressForm
            submitLabel="Save changes"
            defaultValues={{
              ...editingAddress,
              line2: editingAddress.line2 ?? undefined,
              landmark: editingAddress.landmark ?? undefined,
            }}
            onCancel={() => setEditingId(null)}
            onSubmit={(input) =>
              updateMutation.mutateAsync({ id: editingAddress.id, input }).then(() => {})
            }
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deletingAddress}
        onClose={() => setDeletingId(null)}
        onConfirm={() => deleteMutation.mutateAsync(deletingAddress!.id).then(() => {})}
        title="Remove this address?"
        description={`This will permanently remove the address at ${deletingAddress?.line1 ?? ''}. This can't be undone.`}
        confirmLabel="Remove"
      />
    </div>
  );
}
