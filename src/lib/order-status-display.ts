import type { OrderStatus } from '@/modules/orders/order.types';

/** docs/Product_Spec_Requirements.md §5.2's customer-visible labels — client-safe (no server-only imports), shared by storefront and admin order UI. */
const LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Payment Pending',
  payment_failed: 'Payment Failed',
  confirmed: 'Confirmed',
  processing: 'Processing',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancel_requested: 'Cancellation Requested',
  cancelled: 'Cancelled',
  return_requested: 'Return Requested',
  return_approved: 'Return Approved',
  returned: 'Returned',
  refund_pending: 'Refund Pending',
  refunded: 'Refunded',
};

const NEGATIVE: ReadonlySet<OrderStatus> = new Set([
  'payment_failed',
  'cancelled',
  'cancel_requested',
]);
const POSITIVE: ReadonlySet<OrderStatus> = new Set(['delivered', 'confirmed']);

export function orderStatusLabel(status: OrderStatus): string {
  return LABELS[status];
}

export function orderStatusBadgeClass(status: OrderStatus): string {
  if (NEGATIVE.has(status)) return 'bg-error-bg text-error';
  if (POSITIVE.has(status)) return 'bg-primary-50 text-primary-700';
  return 'bg-accent-100 text-accent-600';
}
