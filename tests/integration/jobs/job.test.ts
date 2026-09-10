import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { createTestUser, deleteTestUser } from '../../fixtures/users';
import { createTestAddress } from '../../fixtures/addresses';
import { createTestVariant, deleteTestProduct } from '../../fixtures/catalog';
import { addItem } from '@/modules/cart/cart.service';
import { createOrder } from '@/modules/orders/checkout.service';
import { enqueue, processPendingJobs } from '@/modules/jobs/job.service';
import { emailProvider } from '@/modules/notifications/email-provider';

/**
 * job_queue is claimed in bounded batches (job.service.ts's BATCH_SIZE),
 * and other tests running concurrently in this suite enqueue their own
 * jobs into the same shared table — so a single processPendingJobs() call
 * isn't guaranteed to reach this specific job on its first pass if the
 * batch happened to fill with other tests' jobs first. Polling a few times
 * is the robust way to drain a specific job without depending on batch
 * ordering, same idea as any other "eventually consistent" wait.
 */
async function processUntilDone(jobId: string, maxRounds = 5): Promise<void> {
  for (let i = 0; i < maxRounds; i++) {
    const job = await db.jobQueue.findUniqueOrThrow({ where: { id: jobId } });
    if (job.status === 'done' || job.status === 'failed') return;
    await processPendingJobs();
  }
}

async function deleteTestOrder(orderId: string): Promise<void> {
  await db.invoice.deleteMany({ where: { orderId } });
  await db.payment.deleteMany({ where: { orderId } });
  await db.orderStatusHistory.deleteMany({ where: { orderId } });
  await db.orderItem.deleteMany({ where: { orderId } });
  await db.order.delete({ where: { id: orderId } }).catch(() => {});
}

describe('job.service.enqueue / processPendingJobs', () => {
  it('processes a generate_invoice job end to end and marks it done', async () => {
    const user = await createTestUser();
    const address = await createTestAddress(user.id);
    const { productId, variantId } = await createTestVariant(5, { price: 15000 });
    let orderId: string | undefined;
    try {
      await addItem({ userId: user.id }, { variantId, quantity: 1 });
      const result = await createOrder(user, {
        shippingAddressId: address.id,
        paymentMethod: 'online',
      });
      orderId = result.orderId;

      await enqueue('generate_invoice', { orderId });
      const created = await db.jobQueue.findFirstOrThrow({
        where: { type: 'generate_invoice', payload: { path: ['orderId'], equals: orderId } },
      });

      // Not asserting on the aggregate outcome counts here — job_queue is a
      // shared table and other tests running concurrently in this suite
      // legitimately enqueue/fail their own unrelated jobs at the same time
      // (see tests/fixtures/jobs.ts). This test only needs to confirm *its
      // own* enqueued job specifically succeeded.
      await processUntilDone(created.id);

      const invoice = await db.invoice.findUnique({ where: { orderId } });
      expect(invoice).not.toBeNull();

      const job = await db.jobQueue.findUniqueOrThrow({ where: { id: created.id } });
      expect(job.status).toBe('done');
      expect(job.processedAt).not.toBeNull();
    } finally {
      if (orderId) await deleteTestOrder(orderId);
      await deleteTestProduct(productId);
      await deleteTestUser(user.id);
    }
  });

  it('processes a send_email job and creates the in-app notification', async () => {
    const user = await createTestUser();
    try {
      const spy = vi.spyOn(emailProvider, 'sendEmail').mockResolvedValue();
      await enqueue('send_email', { trigger: 'welcome', userId: user.id });
      const created = await db.jobQueue.findFirstOrThrow({
        where: { type: 'send_email', payload: { path: ['userId'], equals: user.id } },
      });
      await processUntilDone(created.id);

      const notification = await db.notification.findFirst({ where: { userId: user.id } });
      expect(notification).not.toBeNull();
      spy.mockRestore();
    } finally {
      await db.notification.deleteMany({ where: { userId: user.id } });
      await deleteTestUser(user.id);
    }
  });

  it('retries a failing job with backoff, then permanently fails after max_attempts', async () => {
    // A unique-per-run marker, and a try/finally around every assertion —
    // any earlier run of this exact test that failed mid-assertion (no
    // try/finally previously) leaked its row into the table forever, and a
    // later run's unscoped lookup could then match a *different* run's
    // already-failed leftover instead of its own freshly-created row.
    const marker = `not-a-real-user-id-${randomUUID()}`;
    const created = await db.jobQueue.create({
      data: { type: 'send_email', payload: { trigger: 'welcome', userId: marker }, maxAttempts: 2 },
    });

    try {
      const first = await processPendingJobs();
      expect(first.failed).toBeGreaterThanOrEqual(1);

      const afterFirst = await db.jobQueue.findUniqueOrThrow({ where: { id: created.id } });
      expect(afterFirst.status).toBe('pending'); // retried, not yet permanently failed
      expect(afterFirst.attempts).toBe(1);
      expect(afterFirst.lastError).toBeTruthy();

      // Force it eligible immediately instead of waiting out the real backoff delay.
      await db.jobQueue.update({ where: { id: created.id }, data: { runAfter: new Date() } });

      const second = await processPendingJobs();
      expect(second.failed).toBeGreaterThanOrEqual(1);

      const afterSecond = await db.jobQueue.findUniqueOrThrow({ where: { id: created.id } });
      expect(afterSecond.status).toBe('failed'); // attempts (2) reached max_attempts (2)
      expect(afterSecond.attempts).toBe(2);
    } finally {
      await db.jobQueue.delete({ where: { id: created.id } }).catch(() => {});
    }
  });
});
