'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch, ApiError } from '@/lib/api-client';
import { toRupeeDisplay } from '@/lib/money';
import { orderStatusBadgeClass, orderStatusLabel } from '@/lib/order-status-display';
import type { OrderDetail, OrderStatus } from '@/modules/orders/order.types';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

const SHIPMENT_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
]);

const STATUS_OPTIONS: OrderStatus[] = [
  'pending_payment',
  'payment_failed',
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancel_requested',
  'cancelled',
  'return_requested',
  'return_approved',
  'returned',
  'refund_pending',
  'refunded',
];

export default function AdminOrderDetailPage({ params }: PageProps<'/admin/orders/[id]'>) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [estimatedDelivery, setEstimatedDelivery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ['admin', 'orders', id],
    queryFn: () => authFetch<OrderDetail>(`/api/admin/orders/${id}`),
  });

  const shipmentRelevant = nextStatus !== '' && SHIPMENT_STATUSES.has(nextStatus);
  const shipment =
    carrier.trim() || trackingNumber.trim() || estimatedDelivery
      ? {
          ...(carrier.trim() && { carrier: carrier.trim() }),
          ...(trackingNumber.trim() && { trackingNumber: trackingNumber.trim() }),
          ...(estimatedDelivery && { estimatedDelivery }),
        }
      : undefined;

  const updateStatus = useMutation({
    mutationFn: () =>
      authFetch<OrderDetail>(`/api/admin/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          ...(note.trim() && { note: note.trim() }),
          ...(shipmentRelevant && shipment && { shipment }),
        }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'orders', id], updated);
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      setNextStatus('');
      setNote('');
      setCarrier('');
      setTrackingNumber('');
      setEstimatedDelivery('');
      setError(null);
      show({ message: 'Order status updated.', variant: 'success' });
    },
    onError: (e) => {
      const message = e instanceof ApiError ? e.message : 'Could not update status.';
      setError(message);
      show({ message, variant: 'error' });
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl">
        <Skeleton className="mb-4 h-4 w-28" />
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <Skeleton className="mb-2 h-7 w-40" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Skeleton className="h-48 rounded-[10px]" />
          <Skeleton className="h-48 rounded-[10px]" />
        </div>
        <Skeleton className="mt-6 h-40 rounded-[10px]" />
        <Skeleton className="mt-6 h-32 rounded-[10px]" />
      </div>
    );
  }
  if (!order) {
    return <p className="text-muted text-sm">Order not found.</p>;
  }

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/orders"
        className="text-primary-700 mb-4 inline-block text-sm hover:underline"
      >
        ← Back to orders
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-semibold">{order.orderNumber}</h1>
          <p className="text-muted text-sm">
            Placed{' '}
            {new Date(order.placedAt).toLocaleString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${orderStatusBadgeClass(order.status)}`}
        >
          {orderStatusLabel(order.status)}
        </span>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="border-border bg-surface rounded-[10px] border p-4">
          <h2 className="text-foreground mb-3 text-sm font-semibold">Items</h2>
          <div className="divide-border divide-y">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="text-foreground font-medium">{item.productNameSnapshot}</p>
                  <p className="text-muted text-xs">
                    {item.skuSnapshot} · Qty {item.quantity}
                  </p>
                </div>
                <span className="text-foreground font-medium">
                  {toRupeeDisplay(item.lineTotal)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-border mt-3 flex justify-between border-t pt-3 text-sm font-semibold">
            <span className="text-foreground">Total</span>
            <span className="text-foreground">{toRupeeDisplay(order.grandTotal)}</span>
          </div>
        </section>

        <section className="border-border bg-surface rounded-[10px] border p-4">
          <h2 className="text-foreground mb-3 text-sm font-semibold">Shipping address</h2>
          <p className="text-muted text-sm">
            {order.shippingAddress.name} · {order.shippingAddress.phone}
            <br />
            {order.shippingAddress.line1}
            {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}
            <br />
            {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
            {order.shippingAddress.postalCode}
          </p>
        </section>
      </div>

      {order.shipment && (
        <section className="border-border bg-surface mt-6 rounded-[10px] border p-4">
          <h2 className="text-foreground mb-3 text-sm font-semibold">Shipment</h2>
          <p className="text-muted text-sm">
            {order.shipment.carrier ?? 'Carrier not yet assigned'}
            {order.shipment.trackingNumber && ` · ${order.shipment.trackingNumber}`}
          </p>
          {order.shipment.estimatedDelivery && (
            <p className="text-muted text-sm">
              Estimated delivery:{' '}
              {new Date(order.shipment.estimatedDelivery).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          )}
        </section>
      )}

      <section className="border-border bg-surface mt-6 rounded-[10px] border p-4">
        <h2 className="text-foreground mb-3 text-sm font-semibold">Status timeline</h2>
        <ol className="flex flex-col gap-2">
          {order.statusHistory.map((event, i) => (
            <li key={i} className="text-muted flex flex-wrap items-center gap-2 text-sm">
              <span
                className="bg-primary-600 h-1.5 w-1.5 shrink-0 rounded-full"
                aria-hidden="true"
              />
              <span className="text-foreground font-medium">
                {orderStatusLabel(event.toStatus)}
              </span>
              <span>
                —{' '}
                {new Date(event.createdAt).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
              {event.note && <span className="text-muted italic">&ldquo;{event.note}&rdquo;</span>}
            </li>
          ))}
        </ol>
      </section>

      <section className="border-border bg-surface mt-6 rounded-[10px] border p-4">
        <h2 className="text-foreground mb-3 text-sm font-semibold">Update status</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="nextStatus"
              className="text-foreground mb-1.5 block text-sm font-medium"
            >
              New status
            </label>
            <select
              id="nextStatus"
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as OrderStatus)}
              className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
            >
              <option value="">Select a status…</option>
              {STATUS_OPTIONS.filter((s) => s !== order.status).map((s) => (
                <option key={s} value={s}>
                  {orderStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="note" className="text-foreground mb-1.5 block text-sm font-medium">
              Note (optional)
            </label>
            <input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
            />
          </div>
          <Button
            disabled={!nextStatus}
            loading={updateStatus.isPending}
            onClick={() => updateStatus.mutate()}
          >
            Update
          </Button>
        </div>
        {shipmentRelevant && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="carrier" className="text-foreground mb-1.5 block text-sm font-medium">
                Carrier
              </label>
              <input
                id="carrier"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="trackingNumber"
                className="text-foreground mb-1.5 block text-sm font-medium"
              >
                Tracking number
              </label>
              <input
                id="trackingNumber"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="estimatedDelivery"
                className="text-foreground mb-1.5 block text-sm font-medium"
              >
                Estimated delivery
              </label>
              <input
                id="estimatedDelivery"
                type="date"
                value={estimatedDelivery}
                onChange={(e) => setEstimatedDelivery(e.target.value)}
                className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
              />
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="bg-error-bg text-error mt-3 rounded-[10px] px-3 py-2 text-sm">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
