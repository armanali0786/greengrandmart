import type { OrderStatus } from '@/modules/orders/order.types';

/**
 * No transition table is given anywhere in the docs — only the valid
 * status *values* (the DB CHECK constraint) and the customer-visible happy
 * path (Product_Spec_Requirements.md §5.2: "Payment Pending → Confirmed →
 * Processing → Packed → Shipped → Out for Delivery → Delivered", plus
 * "Payment Failed", "Cancelled", and the return/refund chain). This is a
 * defensible reading of that prose as a strict linear graph (per AGENTS.md
 * §9) — return/refund transitions are wired here for completeness since
 * the DB constraint already allows those values, but nothing exercises
 * them via a route until Phase 8.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  // pending_payment → confirmed only ever happens inside the payment
  // webhook handler (Phase 7) — never listed as an admin-triggerable
  // transition, per AGENTS.md "payment confirmation only via webhook."
  pending_payment: ['confirmed', 'payment_failed', 'cancelled'],
  payment_failed: [], // terminal — the customer starts a new checkout, not a status change on this one
  confirmed: ['processing', 'cancel_requested', 'cancelled'],
  processing: ['packed', 'cancel_requested', 'cancelled'],
  packed: ['shipped', 'cancel_requested'],
  shipped: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: ['return_requested'],
  cancel_requested: ['cancelled', 'confirmed', 'processing', 'packed'], // admin approves (cancelled) or rejects (back to whatever it was)
  cancelled: [],
  return_requested: ['return_approved', 'delivered'], // approved, or rejected (back to delivered)
  return_approved: ['returned'],
  returned: ['refund_pending'],
  refund_pending: ['refunded'],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The set of statuses reachable only through the payment webhook, never through the admin status-update endpoint. */
const PAYMENT_SYSTEM_ONLY_TARGETS: ReadonlySet<OrderStatus> = new Set(['confirmed']);

/**
 * Admin's PATCH /admin/orders/:id/status is deliberately narrower than the
 * full graph — it can't confirm a pending_payment order (that's the
 * webhook's job alone) or directly force a return/refund step without
 * going through the dedicated flow those get in Phase 8.
 */
export function canAdminTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === 'pending_payment' && PAYMENT_SYSTEM_ONLY_TARGETS.has(to)) return false;
  return canTransition(from, to);
}

/** Product_Spec_Requirements.md §5.2: "Customers can cancel only while status is Confirmed or Processing (not after Packed)." */
export function isCustomerCancelable(status: OrderStatus): boolean {
  return status === 'confirmed' || status === 'processing';
}
