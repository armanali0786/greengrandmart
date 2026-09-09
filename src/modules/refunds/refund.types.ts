// Matches the DB CHECK constraints chk_refunds_type / chk_refunds_status exactly.
export type RefundType = 'full' | 'partial' | 'item' | 'shipping';
export type RefundStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface RefundView {
  id: string;
  orderId: string;
  type: RefundType;
  amount: number;
  status: RefundStatus;
  reason: string | null;
  createdAt: string;
}

export interface AdminRefundSummary extends RefundView {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
}
