import { db } from '@/lib/db';

/**
 * Many service functions (payments, orders, returns, refunds, auth) enqueue
 * real job_queue rows as a side effect. Tests exercising those call paths
 * must clean up the rows they create, scoped by orderId/userId — never a
 * blanket `deleteMany({})`, which would race with other test files running
 * concurrently against the same shared dev database.
 */
export async function deleteJobsForOrder(orderId: string): Promise<void> {
  await db.jobQueue.deleteMany({ where: { payload: { path: ['orderId'], equals: orderId } } });
}

export async function deleteJobsForUser(userId: string): Promise<void> {
  await db.jobQueue.deleteMany({ where: { payload: { path: ['userId'], equals: userId } } });
}
