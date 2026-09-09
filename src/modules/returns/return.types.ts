// Matches the DB CHECK constraint chk_returns_status exactly.
export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'item_received' | 'completed';

export type ReturnReason = 'damaged' | 'wrong_item' | 'not_as_described' | 'other';

export interface ReturnView {
  id: string;
  orderItemId: string;
  // The `returns` table has a single free-text `reason` column (no separate
  // note column) — the reason enum key and an optional note are combined
  // into this one string at write time (return.service.ts's formatReason).
  reason: string;
  status: ReturnStatus;
  requestedAt: string;
  updatedAt: string;
}

export interface AdminReturnSummary {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  reason: string;
  status: ReturnStatus;
  requestedAt: string;
}
