import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

type TxClient = Prisma.TransactionClient;

export interface ShipmentRow {
  id: string;
  orderId: string;
  provider: string | null;
  shipmentId: string | null;
  trackingNumber: string | null;
  status: string;
  carrier: string | null;
  estimatedDelivery: Date | null;
}

/**
 * One shipment per order for v1 — the schema allows `Order.shipments` to be
 * a list (split/multi-package shipping is a real future case), but nothing
 * in the docs asks for split shipments yet, so this always looks up the
 * single most-recently-created one rather than exposing a picker.
 */
export async function findShipmentForOrder(
  tx: TxClient | typeof db,
  orderId: string,
): Promise<ShipmentRow | null> {
  return tx.shipment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
}

export async function createShipmentRow(
  tx: TxClient | typeof db,
  params: {
    orderId: string;
    provider: string | null;
    shipmentId: string | null;
    carrier: string | null;
    trackingNumber: string | null;
    estimatedDelivery: Date | null;
    status: string;
  },
): Promise<ShipmentRow> {
  return tx.shipment.create({ data: params });
}

export async function updateShipmentRow(
  tx: TxClient | typeof db,
  id: string,
  params: Partial<{
    carrier: string | null;
    trackingNumber: string | null;
    estimatedDelivery: Date | null;
    status: string;
  }>,
): Promise<void> {
  await tx.shipment.update({ where: { id }, data: params });
}

export async function createTrackingEventRow(
  tx: TxClient | typeof db,
  params: { shipmentId: string; status: string; location: string | null; occurredAt: Date },
): Promise<void> {
  await tx.shipmentTrackingEvent.create({ data: params });
}

export async function findTrackingEventsForShipment(
  shipmentId: string,
): Promise<{ status: string; location: string | null; occurredAt: Date }[]> {
  return db.shipmentTrackingEvent.findMany({
    where: { shipmentId },
    orderBy: { occurredAt: 'asc' },
    select: { status: true, location: true, occurredAt: true },
  });
}
