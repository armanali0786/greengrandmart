'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import type { AdminReturnSummary, ReturnStatus } from '@/modules/returns/return.types';

interface AdminReturnsPage {
  items: AdminReturnSummary[];
  total: number;
}

const STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: 'Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  item_received: 'Item Received',
  completed: 'Completed',
};

const STATUS_FILTERS: { value: ReturnStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'requested', label: 'Requested' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'item_received', label: 'Item Received' },
  { value: 'completed', label: 'Completed' },
];

export default function AdminReturnsPage() {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [status, setStatus] = useState<ReturnStatus | ''>('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'returns', status],
    queryFn: () =>
      authFetch<AdminReturnsPage>(
        `/api/admin/returns?limit=50${status ? `&status=${status}` : ''}`,
      ),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'returns'] });
  }

  const approve = useMutation({
    mutationFn: (id: string) =>
      authFetch(`/api/admin/returns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'approve' }),
      }),
    onSuccess: () => {
      invalidate();
      show({ message: 'Return approved.', variant: 'success' });
    },
    onError: (e) => {
      const message = e instanceof ApiError ? e.message : 'Could not approve return.';
      setError(message);
      show({ message, variant: 'error' });
    },
  });

  const reject = useMutation({
    mutationFn: (id: string) =>
      authFetch(`/api/admin/returns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'reject' }),
      }),
    onSuccess: () => {
      invalidate();
      show({ message: 'Return rejected.', variant: 'success' });
    },
    onError: (e) => {
      const message = e instanceof ApiError ? e.message : 'Could not reject return.';
      setError(message);
      show({ message, variant: 'error' });
    },
  });

  const markReceived = useMutation({
    mutationFn: (id: string) =>
      authFetch(`/api/admin/returns/${id}/receive`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => {
      invalidate();
      show({ message: 'Item marked received.', variant: 'success' });
    },
    onError: (e) => {
      const message = e instanceof ApiError ? e.message : 'Could not mark item received.';
      setError(message);
      show({ message, variant: 'error' });
    },
  });

  const complete = useMutation({
    mutationFn: (id: string) => authFetch(`/api/admin/returns/${id}/complete`, { method: 'POST' }),
    onSuccess: () => {
      invalidate();
      show({ message: 'Return completed.', variant: 'success' });
    },
    onError: (e) => {
      const message = e instanceof ApiError ? e.message : 'Could not complete return.';
      setError(message);
      show({ message, variant: 'error' });
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-foreground text-2xl font-semibold">Returns</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ReturnStatus | '')}
          className="border-border bg-surface h-9 rounded-[10px] border px-3 text-sm"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="bg-error-bg text-error mb-4 rounded-[10px] px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="border-border bg-surface overflow-hidden rounded-[10px] border">
          <div className="divide-border divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-6 px-4 py-3">
                <Skeleton className="h-4 w-20" />
                <div className="flex-1">
                  <Skeleton className="mb-1.5 h-4 w-28" />
                  <Skeleton className="h-3 w-36" />
                </div>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="border-border bg-surface text-muted rounded-[10px] border px-4 py-16 text-center text-sm">
          No returns found.
        </p>
      ) : (
        <div className="border-border bg-surface overflow-x-auto rounded-[10px] border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted border-b text-left">
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {data.items.map((ret) => (
                <tr key={ret.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${ret.orderId}`}
                      className="text-primary-700 font-medium hover:underline"
                    >
                      {ret.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-foreground">{ret.customerName}</p>
                    <p className="text-muted text-xs">{ret.customerEmail}</p>
                  </td>
                  <td className="text-foreground px-4 py-3">{ret.productName}</td>
                  <td className="text-muted px-4 py-3">{ret.reason}</td>
                  <td className="px-4 py-3">
                    <span className="bg-accent-100 text-accent-600 rounded-full px-2 py-0.5 text-xs">
                      {STATUS_LABELS[ret.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {ret.status === 'requested' && (
                        <>
                          <Button
                            className="h-8 px-2 text-xs"
                            loading={approve.isPending && approve.variables === ret.id}
                            onClick={() => approve.mutate(ret.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            className="h-8 px-2 text-xs"
                            loading={reject.isPending && reject.variables === ret.id}
                            onClick={() => reject.mutate(ret.id)}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {ret.status === 'approved' && (
                        <Button
                          className="h-8 px-2 text-xs"
                          loading={markReceived.isPending && markReceived.variables === ret.id}
                          onClick={() => markReceived.mutate(ret.id)}
                        >
                          Mark received
                        </Button>
                      )}
                      {ret.status === 'item_received' && (
                        <Button
                          className="h-8 px-2 text-xs"
                          loading={complete.isPending && complete.variables === ret.id}
                          onClick={() => complete.mutate(ret.id)}
                        >
                          Mark complete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
