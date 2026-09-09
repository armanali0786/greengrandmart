import { db } from '@/lib/db';
import { releaseReservation } from '@/modules/inventory/inventory.service';
import * as repo from '@/modules/orders/order.repository';

/**
 * docs/ECOMMERCE_IMPLEMENTATION_PLAN.md §5.1 step 5: "find
 * inventory_reservations where status=active AND expires_at < now →
 * release reservation, set order.status = payment_failed (if still
 * pending)." Meant to run on a schedule (Vercel Cron, per API_Spec.md's
 * `/cron/release-expired-reservations`) — each reservation/order update is
 * its own small transaction rather than one huge one, so a sweep touching
 * many rows can't be blocked or rolled back entirely by a single bad row.
 */
export async function sweepExpiredReservations(): Promise<{
  releasedCount: number;
  expiredOrderCount: number;
}> {
  const expired = await repo.findExpiredActiveReservationIds();

  let releasedCount = 0;
  const orderIds = new Set<string>();
  for (const reservation of expired) {
    await db.$transaction((tx) => releaseReservation(tx, reservation.id));
    releasedCount++;
    if (reservation.orderId) orderIds.add(reservation.orderId);
  }

  let expiredOrderCount = 0;
  for (const orderId of orderIds) {
    const order = await repo.findOrderById(orderId);
    if (!order || order.status !== 'pending_payment') continue;

    await db.$transaction(async (tx) => {
      await repo.updateOrderStatusRow(tx, orderId, 'payment_failed');
      await repo.createStatusHistoryRow(tx, {
        orderId,
        fromStatus: 'pending_payment',
        toStatus: 'payment_failed',
        changedBy: null,
        note: 'Payment window expired — stock reservation released.',
      });
    });
    expiredOrderCount++;
  }

  return { releasedCount, expiredOrderCount };
}
