import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { shippingProvider } from '@/modules/shipping/shipping-provider';
import * as repo from '@/modules/shipping/shipment.repository';
import type { ShipmentDetailsInput } from '@/modules/shipping/shipping.schema';
import type { OrderStatus } from '@/modules/orders/order.types';
import type { ShipmentView } from '@/modules/shipping/shipping.types';

type TxClient = Prisma.TransactionClient;

/** Order statuses that represent real shipment progress (docs/Product_Spec_Requirements.md §5.2's happy path from Packed onward). */
const SHIPMENT_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
]);

/**
 * Called from order.service.updateOrderStatusAdmin whenever the order moves
 * into one of the shipment-relevant statuses. Creates the order's one
 * shipment record on first entry (docs/Product_Spec_Requirements.md §7.1:
 * "created by admin... once order status moves to Packed"), updates carrier/
 * tracking/ETA on subsequent calls if the admin supplied new values, and
 * always appends a tracking event mirroring the order's own status —
 * that's the full "shipment status" taxonomy the docs specify (no separate
 * courier-side status vocabulary exists without a real ShippingProvider
 * adapter). A no-op if this status transition doesn't touch shipping at all
 * (e.g. cancel_requested).
 */
export async function recordShipmentProgress(
  tx: TxClient,
  orderId: string,
  toStatus: OrderStatus,
  details: ShipmentDetailsInput | undefined,
): Promise<void> {
  if (!SHIPMENT_STATUSES.has(toStatus)) return;

  let shipment = await repo.findShipmentForOrder(tx, orderId);
  if (!shipment) {
    const created = await shippingProvider.createShipment({
      orderId,
      carrier: details?.carrier ?? null,
      trackingNumber: details?.trackingNumber ?? null,
    });
    shipment = await repo.createShipmentRow(tx, {
      orderId,
      provider: created.provider,
      shipmentId: created.shipmentId,
      carrier: details?.carrier ?? null,
      trackingNumber: details?.trackingNumber ?? null,
      estimatedDelivery: details?.estimatedDelivery ?? null,
      status: toStatus,
    });
  } else {
    await repo.updateShipmentRow(tx, shipment.id, {
      status: toStatus,
      ...(details?.carrier !== undefined && { carrier: details.carrier }),
      ...(details?.trackingNumber !== undefined && { trackingNumber: details.trackingNumber }),
      ...(details?.estimatedDelivery !== undefined && {
        estimatedDelivery: details.estimatedDelivery,
      }),
    });
  }

  await repo.createTrackingEventRow(tx, {
    shipmentId: shipment.id,
    status: toStatus,
    location: null,
    occurredAt: new Date(),
  });
}

export async function getShipmentView(orderId: string): Promise<ShipmentView | null> {
  const shipment = await repo.findShipmentForOrder(db, orderId);
  if (!shipment) return null;

  const events = await repo.findTrackingEventsForShipment(shipment.id);
  return {
    carrier: shipment.carrier,
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    estimatedDelivery: shipment.estimatedDelivery?.toISOString() ?? null,
    trackingEvents: events.map((e) => ({
      status: e.status,
      location: e.location,
      occurredAt: e.occurredAt.toISOString(),
    })),
  };
}
