export interface ShipmentTrackingEventView {
  status: string;
  location: string | null;
  occurredAt: string;
}

export interface ShipmentView {
  carrier: string | null;
  trackingNumber: string | null;
  status: string;
  estimatedDelivery: string | null;
  trackingEvents: ShipmentTrackingEventView[];
}
