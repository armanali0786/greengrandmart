// Full enum per the DB CHECK constraint (chk_orders_status) — not every
// value has a route that can reach it yet: return/refund transitions
// (Phase 8) and payment-confirmation transitions (Phase 7's webhook) are
// defined here for completeness but aren't exercised by any endpoint
// until those phases land. See order-status-machine.ts.
export type OrderStatus =
  | 'pending_payment'
  | 'payment_failed'
  | 'confirmed'
  | 'processing'
  | 'packed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancel_requested'
  | 'cancelled'
  | 'return_requested'
  | 'return_approved'
  | 'returned'
  | 'refund_pending'
  | 'refunded';

export interface AddressSnapshot {
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OrderItemView {
  id: string;
  productId: string | null;
  variantId: string | null;
  productNameSnapshot: string;
  skuSnapshot: string;
  variantAttrsSnapshot: Record<string, string>;
  unitPrice: number;
  discount: number;
  taxAmount: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderStatusEvent {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  createdAt: string;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  grandTotal: number;
  placedAt: string;
  firstItemName: string | null;
  itemCount: number;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  subtotal: number;
  discountTotal: number;
  couponDiscount: number;
  shippingFee: number;
  taxTotal: number;
  grandTotal: number;
  shippingAddress: AddressSnapshot;
  billingAddress: AddressSnapshot;
  placedAt: string;
  items: OrderItemView[];
  statusHistory: OrderStatusEvent[];
  // Shipment tracking (carrier/trackingNumber) is Phase 8's "Shipping" —
  // the `shipments` table exists but nothing creates rows in it yet.
  canCancel: boolean;
}

/** Admin list rows skip the full item/history join products/customers pages don't need. */
export interface AdminOrderSummary extends OrderSummary {
  customerName: string;
  customerEmail: string;
}
