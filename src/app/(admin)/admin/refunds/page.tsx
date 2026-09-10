'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch, ApiError } from '@/lib/api-client';
import { toRupeeDisplay, toPaise } from '@/lib/money';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import type { AdminRefundSummary, RefundStatus, RefundType } from '@/modules/refunds/refund.types';

interface AdminRefundsPage {
  items: AdminRefundSummary[];
  total: number;
}

const STATUS_LABELS: Record<RefundStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

const STATUS_BADGE: Record<RefundStatus, string> = {
  pending: 'bg-accent-100 text-accent-600',
  processing: 'bg-accent-100 text-accent-600',
  completed: 'bg-primary-50 text-primary-700',
  failed: 'bg-error-bg text-error',
};

export default function AdminRefundsPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [type, setType] = useState<RefundType>('full');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'refunds'],
    queryFn: () => authFetch<AdminRefundsPage>('/api/admin/refunds?limit=50'),
  });

  const initiate = useMutation({
    mutationFn: () =>
      authFetch('/api/admin/refunds', {
        method: 'POST',
        body: JSON.stringify({
          orderId: orderId.trim(),
          type,
          amount: toPaise(Number(amount)),
          ...(reason.trim() && { reason: reason.trim() }),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'refunds'] });
      setCreating(false);
      setOrderId('');
      setType('full');
      setAmount('');
      setReason('');
      setError(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not initiate refund.'),
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-foreground text-2xl font-semibold">Refunds</h1>
        <Button onClick={() => setCreating(true)}>Initiate refund</Button>
      </div>

      {isLoading ? (
        <div className="border-border bg-surface overflow-hidden rounded-[10px] border">
          <div className="divide-border divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-6 px-4 py-3">
                <Skeleton className="h-4 w-24" />
                <div className="flex-1">
                  <Skeleton className="mb-1.5 h-4 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="border-border bg-surface text-muted rounded-[10px] border px-4 py-16 text-center text-sm">
          No refunds found.
        </p>
      ) : (
        <div className="border-border bg-surface overflow-x-auto rounded-[10px] border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted border-b text-left">
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {data.items.map((refund) => (
                <tr key={refund.id}>
                  <td className="text-foreground px-4 py-3 font-medium">{refund.orderNumber}</td>
                  <td className="px-4 py-3">
                    <p className="text-foreground">{refund.customerName}</p>
                    <p className="text-muted text-xs">{refund.customerEmail}</p>
                  </td>
                  <td className="text-muted px-4 py-3 capitalize">{refund.type}</td>
                  <td className="text-foreground px-4 py-3 font-medium">
                    {toRupeeDisplay(refund.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[refund.status]}`}
                    >
                      {STATUS_LABELS[refund.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Initiate refund">
        <div className="flex flex-col gap-4">
          <Input label="Order ID" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          <div>
            <label
              htmlFor="refundType"
              className="text-foreground mb-1.5 block text-sm font-medium"
            >
              Type
            </label>
            <select
              id="refundType"
              value={type}
              onChange={(e) => setType(e.target.value as RefundType)}
              className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
            >
              <option value="full">Full</option>
              <option value="partial">Partial</option>
              <option value="item">Item</option>
              <option value="shipping">Shipping</option>
            </select>
          </div>
          <Input
            label="Amount (₹)"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && (
            <p role="alert" className="bg-error-bg text-error rounded-[10px] px-3 py-2 text-sm">
              {error}
            </p>
          )}
          <Button
            className="w-full"
            disabled={!orderId.trim() || !amount}
            loading={initiate.isPending}
            onClick={() => initiate.mutate()}
          >
            Initiate refund
          </Button>
        </div>
      </Modal>
    </div>
  );
}
