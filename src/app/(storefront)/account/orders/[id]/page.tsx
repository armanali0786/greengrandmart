'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch, ApiError } from '@/lib/api-client';
import { toRupeeDisplay } from '@/lib/money';
import { orderStatusBadgeClass, orderStatusLabel } from '@/lib/order-status-display';
import { RAZORPAY_STUB_KEY_ID } from '@/lib/payment-constants';
import { openRazorpayCheckout } from '@/lib/razorpay-checkout';
import type { OrderDetail } from '@/modules/orders/order.types';
import type { RetryPaymentResult } from '@/modules/payments/payment.service';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function OrderDetailPage({ params }: PageProps<'/account/orders/[id]'>) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryInfo, setRetryInfo] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ['orders', id],
    queryFn: () => authFetch<OrderDetail>(`/api/orders/${id}`),
  });

  const cancelMutation = useMutation({
    mutationFn: () => authFetch<OrderDetail>(`/api/orders/${id}/cancel`, { method: 'POST' }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['orders', id], updated);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setCancelling(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not cancel this order.'),
  });

  // docs/Product_Spec_Requirements.md §6.2: "customer can retry payment (new
  // payment attempt against the same order)" while it's still
  // pending_payment. Against the stub provider there's no real widget to
  // open (see payment-provider.ts) — just confirm a new attempt was
  // recorded, since there's nothing further this environment can complete.
  const retryMutation = useMutation({
    mutationFn: () =>
      authFetch<RetryPaymentResult>(`/api/orders/${id}/retry-payment`, { method: 'POST' }),
    onSuccess: async (result) => {
      setError(null);
      if (result.keyId === RAZORPAY_STUB_KEY_ID) {
        setRetryInfo(
          'A new payment attempt was created (test mode — no live payment gateway configured).',
        );
        return;
      }
      await openRazorpayCheckout(result, {
        onSuccess: async (payload) => {
          try {
            await authFetch('/api/checkout/confirm', {
              method: 'POST',
              body: JSON.stringify({ orderId: id, ...payload }),
            });
          } finally {
            queryClient.invalidateQueries({ queryKey: ['orders', id] });
          }
        },
        onDismiss: () => {},
      });
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'Could not start a new payment attempt.'),
  });

  if (isLoading) {
    return <div className="bg-primary-50 h-96 animate-pulse rounded-[10px]" />;
  }
  if (!order) {
    return <p className="text-muted text-sm">Order not found.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-foreground text-lg font-semibold">{order.orderNumber}</h2>
          <p className="text-muted text-sm">
            Placed{' '}
            {new Date(order.placedAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${orderStatusBadgeClass(order.status)}`}
        >
          {orderStatusLabel(order.status)}
        </span>
      </div>

      <section className="border-border bg-surface rounded-[10px] border p-4">
        <h3 className="text-foreground mb-3 text-sm font-semibold">Status timeline</h3>
        <ol className="flex flex-col gap-2">
          {order.statusHistory.map((event, i) => (
            <li key={i} className="text-muted flex items-center gap-2 text-sm">
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
            </li>
          ))}
        </ol>
      </section>

      <section className="border-border bg-surface rounded-[10px] border p-4">
        <h3 className="text-foreground mb-3 text-sm font-semibold">Items</h3>
        <div className="divide-border divide-y">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-foreground text-sm font-medium">{item.productNameSnapshot}</p>
                <p className="text-muted text-xs">
                  {item.skuSnapshot}
                  {Object.keys(item.variantAttrsSnapshot).length > 0
                    ? ` · ${Object.entries(item.variantAttrsSnapshot)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(', ')}`
                    : ''}
                  {' · '}Qty {item.quantity}
                </p>
              </div>
              <span className="text-foreground text-sm font-semibold">
                {toRupeeDisplay(item.lineTotal)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border bg-surface flex flex-col gap-2 rounded-[10px] border p-4">
        <h3 className="text-foreground mb-1 text-sm font-semibold">Order summary</h3>
        <div className="flex justify-between text-sm">
          <span className="text-muted">Subtotal</span>
          <span className="text-foreground">{toRupeeDisplay(order.subtotal)}</span>
        </div>
        {order.discountTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Promotion discount</span>
            <span className="text-primary-700">−{toRupeeDisplay(order.discountTotal)}</span>
          </div>
        )}
        {order.couponDiscount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Coupon discount</span>
            <span className="text-primary-700">−{toRupeeDisplay(order.couponDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted">Shipping</span>
          <span className="text-foreground">{toRupeeDisplay(order.shippingFee)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">GST</span>
          <span className="text-foreground">{toRupeeDisplay(order.taxTotal)}</span>
        </div>
        <div className="border-border mt-1 flex justify-between border-t pt-2 text-base font-semibold">
          <span className="text-foreground">Total</span>
          <span className="text-foreground">{toRupeeDisplay(order.grandTotal)}</span>
        </div>
      </section>

      <section className="border-border bg-surface rounded-[10px] border p-4">
        <h3 className="text-foreground mb-2 text-sm font-semibold">Shipping address</h3>
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

      {error && (
        <p role="alert" className="bg-error-bg text-error rounded-[10px] px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {retryInfo && (
        <p className="bg-primary-50 text-primary-700 rounded-[10px] px-3 py-2 text-sm">
          {retryInfo}
        </p>
      )}

      <div className="flex gap-3">
        <Link href="/account/orders">
          <Button variant="secondary">Back to orders</Button>
        </Link>
        {order.status === 'pending_payment' && (
          <Button loading={retryMutation.isPending} onClick={() => retryMutation.mutate()}>
            Retry payment
          </Button>
        )}
        {order.canCancel && (
          <Button variant="destructive" onClick={() => setCancelling(true)}>
            Cancel order
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        onConfirm={() => cancelMutation.mutateAsync().then(() => {})}
        title="Cancel this order?"
        description={`Order ${order.orderNumber} will be cancelled and any reserved stock released. This can't be undone.`}
        confirmLabel="Cancel order"
      />
    </div>
  );
}
