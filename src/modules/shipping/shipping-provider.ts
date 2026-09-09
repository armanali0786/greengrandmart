export interface CreateShipmentParams {
  orderId: string;
  carrier: string | null;
  trackingNumber: string | null;
}

export interface CreateShipmentResult {
  /** The courier vendor's own name for itself, if any live adapter is ever wired up — null for the manual adapter. */
  provider: string | null;
  /** The courier's own shipment/AWB id, if any — null for the manual adapter. */
  shipmentId: string | null;
}

/**
 * docs/Architecture.md §3/§4/§9: `ShippingProvider` is a named provider-
 * adapter interface, same shape as `PaymentProvider` — meant to let a real
 * courier vendor be added later ("`ShippingProvider` interface already
 * supports additional adapters") without touching `orders`/`shipping`
 * business logic. No courier vendor has been chosen yet (open question,
 * `PRD.md` §14) and AGENTS.md §8 forbids wiring one up without being asked
 * — so only `ManualShippingProvider` exists for now, matching
 * Product_Spec_Requirements.md §7.1's "created by admin (manually or via
 * courier integration)."
 */
export interface ShippingProvider {
  createShipment(params: CreateShipmentParams): Promise<CreateShipmentResult>;
}

/** No live courier — admin enters carrier name + tracking number by hand, nothing to call. */
export class ManualShippingProvider implements ShippingProvider {
  async createShipment(): Promise<CreateShipmentResult> {
    return { provider: null, shipmentId: null };
  }
}

export const shippingProvider: ShippingProvider = new ManualShippingProvider();
