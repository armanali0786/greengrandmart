import { db } from '@/lib/db';
import { env } from '@/config/env';
import { NotFoundError } from '@/lib/errors';
import { requireOwnership } from '@/modules/auth/auth.guard';
import type { SessionUser } from '@/modules/auth/auth.types';
import { getStorageBucket } from '@/lib/firebase-storage';
import * as orderRepo from '@/modules/orders/order.repository';
import { generateInvoicePdf } from '@/modules/invoices/invoice-pdf';

const SIGNED_URL_TTL_MS = 5 * 60 * 1000;

function storagePathFor(orderId: string): string {
  return `invoices/${orderId}.pdf`;
}

/**
 * docs/Architecture.md §5.2/§5.3: invoice generation is triggered by
 * `payment.captured` (order confirmed), not `delivered`. The real
 * architecture diagram shows this going through `jobs.enqueue()` →
 * a background worker — that infrastructure (`job_queue` consumer) is
 * Phase 9's job ("Notifications — job_queue..."), which doesn't exist yet,
 * so this is called directly and synchronously from
 * payment.service.handlePaymentCaptured instead of being queued. Documented
 * scope boundary, same shape as Phase 6/7 deferring COD/notifications.
 * Idempotent — `invoices.order_id` is UNIQUE, so a duplicate call (e.g. a
 * belt-and-suspenders retry) is a silent no-op rather than a second PDF.
 */
export async function ensureInvoiceForOrder(orderId: string): Promise<void> {
  const existing = await db.invoice.findUnique({ where: { orderId } });
  if (existing) return;

  const order = await orderRepo.findOrderById(orderId);
  if (!order) return;

  const pdfBytes = await generateInvoicePdf(order);
  const storagePath = storagePathFor(orderId);

  // docs/Security.md: invoices/** is never public — write is backend/admin-
  // service-account only, matching the product-image upload pipeline's use
  // of the same Admin SDK bucket handle (lib/firebase-storage.ts), just
  // without ever exposing a client-facing upload URL for this path.
  await getStorageBucket().file(storagePath).save(Buffer.from(pdfBytes), {
    contentType: 'application/pdf',
    resumable: false,
  });

  try {
    await db.invoice.create({ data: { orderId, storagePath } });
  } catch {
    // A concurrent call already won the UNIQUE(order_id) race — the file
    // this call just wrote is a harmless duplicate upload to the same
    // deterministic path (the other call's version, or this one — either
    // is byte-identical given immutable order snapshots).
  }
}

/**
 * docs/API_Spec.md `GET /orders/:id/invoice`: "Signed download URL for
 * invoice PDF." The Storage emulator can't produce real signed URLs (same
 * limitation as image uploads — see image-upload.service.ts) — in emulator
 * mode this returns our own ownership-checked streaming route instead.
 */
export async function getInvoiceDownloadUrl(user: SessionUser, orderId: string): Promise<string> {
  const order = await orderRepo.findOrderById(orderId);
  if (!order) throw new NotFoundError('Order not found.');
  requireOwnership(user, order.userId);

  const invoice = await db.invoice.findUnique({ where: { orderId } });
  if (!invoice) {
    throw new NotFoundError('No invoice is available for this order yet.');
  }

  if (env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR) {
    return `/api/orders/${orderId}/invoice/dev-download`;
  }

  const [url] = await getStorageBucket()
    .file(invoice.storagePath)
    .getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + SIGNED_URL_TTL_MS,
    });
  return url;
}

/** Backs the emulator-only dev-download route — same ownership check as getInvoiceDownloadUrl, since that route bypasses the signed-URL layer entirely. */
export async function getInvoiceBytesForDownload(
  user: SessionUser,
  orderId: string,
): Promise<{ bytes: Buffer; storagePath: string }> {
  const order = await orderRepo.findOrderById(orderId);
  if (!order) throw new NotFoundError('Order not found.');
  requireOwnership(user, order.userId);

  const invoice = await db.invoice.findUnique({ where: { orderId } });
  if (!invoice) throw new NotFoundError('No invoice is available for this order yet.');

  const [bytes] = await getStorageBucket().file(invoice.storagePath).download();
  return { bytes, storagePath: invoice.storagePath };
}
