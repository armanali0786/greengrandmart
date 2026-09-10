import { db } from '@/lib/db';
import * as repo from '@/modules/jobs/job.repository';
import type {
  GenerateInvoicePayload,
  JobType,
  NotificationJobPayload,
  ProcessJobsResult,
} from '@/modules/jobs/job.types';
import { ensureInvoiceForOrder } from '@/modules/invoices/invoice.service';
import {
  sendEmailForTrigger,
  sendPushForTrigger,
} from '@/modules/notifications/notification.service';

/**
 * The only way anything in this codebase should cause an email/push/invoice
 * to go out — docs/Product_Spec_Requirements.md §10.1: "All sent
 * asynchronously via background job; checkout/order actions never wait on
 * [delivery]." Callers (payment/order/return/refund/auth services) never
 * import EmailProvider/PushProvider/invoice.service directly for this.
 */
export async function enqueue(
  type: 'generate_invoice',
  payload: GenerateInvoicePayload,
): Promise<void>;
export async function enqueue(
  type: 'send_email' | 'send_push',
  payload: NotificationJobPayload,
): Promise<void>;
export async function enqueue(type: JobType, payload: object): Promise<void> {
  await repo.createJobRow({ type, payload });
}

const BATCH_SIZE = 20;

/**
 * The `POST /cron/process-jobs` entrypoint (docs/Architecture.md §5.3:
 * Vercel Cron, every 1 minute — cron-*polling*, not a continuously-running
 * worker; §9 explicitly calls this the deliberate v1 choice, not a
 * placeholder). Claims a batch inside one transaction (`FOR UPDATE SKIP
 * LOCKED`), then processes each claimed job in its own try/catch *outside*
 * that transaction — a slow/failing Resend or FCM call must never hold the
 * row lock, and one bad job must never abort the whole batch.
 */
export async function processPendingJobs(): Promise<ProcessJobsResult> {
  const claimed = await db.$transaction((tx) => repo.claimPendingJobs(tx, BATCH_SIZE));

  let succeeded = 0;
  let failed = 0;
  for (const job of claimed) {
    try {
      await dispatch(job.type as JobType, job.payload);
      await repo.markJobDone(job.id);
      succeeded++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await repo.markJobFailedOrRetry(job, message);
      failed++;
    }
  }

  return { processed: claimed.length, succeeded, failed };
}

async function dispatch(type: JobType, payload: unknown): Promise<void> {
  switch (type) {
    case 'generate_invoice':
      await ensureInvoiceForOrder((payload as GenerateInvoicePayload).orderId);
      return;
    case 'send_email':
      await sendEmailForTrigger(payload as NotificationJobPayload);
      return;
    case 'send_push':
      await sendPushForTrigger(payload as NotificationJobPayload);
      return;
    case 'send_sms':
      // Nothing enqueues this — OTP sends are synchronous (see
      // modules/otp/otp.service.ts's own doc comment on why OTP bypasses
      // job_queue entirely) and no other SMS notification exists in the
      // spec. Kept as a recognized type (matches the DB's own dispatch
      // table) rather than an error, in case it's ever enqueued directly.
      return;
    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}
