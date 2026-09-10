// Matches the DB CHECK constraint chk_job_queue_status (job_queue.status).
export type JobStatus = 'pending' | 'processing' | 'done' | 'failed';

// docs/Architecture.md §5.3's dispatch table — the only four job types
// anything in this codebase enqueues.
export type JobType = 'send_email' | 'send_push' | 'send_sms' | 'generate_invoice';

export interface GenerateInvoicePayload {
  orderId: string;
}

// docs/Product_Spec_Requirements.md §10.1's full trigger list (minus
// "email verification"/"password reset", which Firebase sends natively —
// see notification.service.ts). One payload shape serves both send_email
// and send_push jobs, since §10.2 says push "uses the same event triggers
// as email."
export type NotificationTrigger =
  | 'welcome'
  | 'order_confirmed'
  | 'payment_failed'
  | 'order_processing'
  | 'order_packed'
  | 'order_shipped'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'order_cancelled'
  | 'return_requested'
  | 'return_approved'
  | 'refund_initiated'
  | 'refund_completed';

export interface NotificationJobPayload {
  trigger: NotificationTrigger;
  userId: string;
  orderId?: string;
}

export interface ProcessJobsResult {
  processed: number;
  succeeded: number;
  failed: number;
}
