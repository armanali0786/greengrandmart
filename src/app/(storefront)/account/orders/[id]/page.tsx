'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch, ApiError } from '@/lib/api-client';
import { getFirebaseAuth } from '@/lib/firebase-client';
import { toRupeeDisplay } from '@/lib/money';
import { orderStatusBadgeClass, orderStatusLabel } from '@/lib/order-status-display';
import { RAZORPAY_STUB_KEY_ID } from '@/lib/payment-constants';
import { openRazorpayCheckout } from '@/lib/razorpay-checkout';
import type { OrderDetail, OrderItemView, OrderStatus } from '@/modules/orders/order.types';
import type { RetryPaymentResult } from '@/modules/payments/payment.service';
import type { ReturnView } from '@/modules/returns/return.types';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';

const RETURN_REASON_LABELS: Record<string, string> = {
  damaged: 'Item arrived damaged',
  wrong_item: 'Wrong item received',
  not_as_described: 'Not as described',
  other: 'Other',
};

const RETURN_STATUS_LABELS: Record<string, string> = {
  requested: 'Return Requested',
  approved: 'Return Approved',
  rejected: 'Return Rejected',
  item_received: 'Return Received',
  completed: 'Return Completed',
};

/** No invoice exists yet for an order that never reached `confirmed` (docs/Architecture.md §5.2/§5.3: generated on payment.captured). */
const UNCONFIRMED_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'pending_payment',
  'payment_failed',
  'cancelled',
]);

export default function OrderDetailPage({ params }: PageProps<'/account/orders/[id]'>) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryInfo, setRetryInfo] = useState<string | null>(null);
  const [returningItem, setReturningItem] = useState<OrderItemView | null>(null);
  const [returnReason, setReturnReason] = useState('damaged');
  const [returnNote, setReturnNote] = useState('');

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

  const returnMutation = useMutation({
    mutationFn: () =>
      authFetch<ReturnView>(`/api/orders/${id}/items/${returningItem!.id}/return`, {
        method: 'POST',
        body: JSON.stringify({ reason: returnReason, ...(returnNote && { note: returnNote }) }),
      }),
    onSuccess: () => {
      setReturningItem(null);
      setReturnNote('');
      queryClient.invalidateQueries({ queryKey: ['orders', id] });
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'Could not submit the return request.'),
  });

  // docs/API_Spec.md: "Signed download URL for invoice PDF." In production
  // that URL needs no extra auth (the signature is the auth); the local
  // Storage-emulator fallback route can't accept an Authorization header on
  // a plain navigation, so the current ID token travels as a query param
  // instead — see invoice/dev-download/route.ts.
  async function handleDownloadInvoice() {
    try {
      const { url } = await authFetch<{ url: string }>(`/api/orders/${id}/invoice`);
      if (url.startsWith('/api/')) {
        const token = await getFirebaseAuth().currentUser?.getIdToken();
        window.open(`${url}?token=${token}`, '_blank');
      } else {
        window.open(url, '_blank');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not download the invoice.');
    }
  }

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

      {order.shipment && (
        <section className="border-border bg-surface rounded-[10px] border p-4">
          <h3 className="text-foreground mb-3 text-sm font-semibold">Shipment tracking</h3>
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
          {order.shipment.trackingEvents.length > 0 && (
            <ol className="mt-3 flex flex-col gap-1.5">
              {order.shipment.trackingEvents.map((event, i) => (
                <li key={i} className="text-muted flex items-center gap-2 text-xs">
                  <span
                    className="bg-primary-600 h-1.5 w-1.5 shrink-0 rounded-full"
                    aria-hidden="true"
                  />
                  <span className="text-foreground font-medium">
                    {orderStatusLabel(event.status as OrderStatus) || event.status}
                  </span>
                  <span>
                    —{' '}
                    {new Date(event.occurredAt).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

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
                {item.returnStatus ? (
                  <p className="text-accent-600 mt-1 text-xs font-medium">
                    {RETURN_STATUS_LABELS[item.returnStatus] ?? item.returnStatus}
                  </p>
                ) : (
                  order.status === 'delivered' && (
                    <button
                      type="button"
                      className="text-primary-700 mt-1 text-xs font-medium hover:underline"
                      onClick={() => setReturningItem(item)}
                    >
                      Request return
                    </button>
                  )
                )}
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

      <div className="flex flex-wrap gap-3">
        <Link href="/account/orders">
          <Button variant="secondary">Back to orders</Button>
        </Link>
        {!UNCONFIRMED_STATUSES.has(order.status) && (
          <Button variant="secondary" onClick={handleDownloadInvoice}>
            Download invoice
          </Button>
        )}
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

      <Modal
        open={!!returningItem}
        onClose={() => setReturningItem(null)}
        title={`Request return: ${returningItem?.productNameSnapshot ?? ''}`}
      >
        <div className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="returnReason"
              className="text-foreground mb-1.5 block text-sm font-medium"
            >
              Reason
            </label>
            <select
              id="returnReason"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              className="border-border bg-surface h-11 w-full rounded-[10px] border px-3 text-sm"
            >
              {Object.entries(RETURN_REASON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="returnNote"
              className="text-foreground mb-1.5 block text-sm font-medium"
            >
              Note (optional)
            </label>
            <textarea
              id="returnNote"
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              rows={3}
              className="border-border bg-surface w-full rounded-[10px] border px-3 py-2 text-sm"
            />
          </div>
          <Button
            className="w-full"
            loading={returnMutation.isPending}
            onClick={() => returnMutation.mutate()}
          >
            Submit return request
          </Button>
        </div>
      </Modal>
    </div>
  );
}
