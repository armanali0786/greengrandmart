import { randomUUID } from 'node:crypto';

/**
 * docs/Architecture.md §4's module table: "PaymentProvider interface +
 * RazorpayPaymentProvider implementation" — a real Razorpay adapter is
 * Phase 7's job ("Razorpay integration, signature verification, webhook
 * handler, idempotency"). This interface is the seam Phase 7 fills in;
 * checkout (Phase 6) only needs createPayment() to get an order past
 * pending_payment creation, so that's the only method defined so far.
 */
export interface CreatePaymentResult {
  providerOrderId: string;
  amount: number;
  keyId: string;
}

export interface PaymentProvider {
  createPayment(params: { orderId: string; amount: number }): Promise<CreatePaymentResult>;
}

/**
 * Local, no-network stand-in for RazorpayPaymentProvider — generates a
 * structurally-plausible order id so checkout can be built, tested, and
 * demoed end-to-end without real Razorpay credentials. Never verifies a
 * signature or marks anything captured (Phase 7 owns both) — this alone
 * cannot move an order past `pending_payment`, matching AGENTS.md's
 * "payment confirmation only via webhook" rule.
 */
export class StubPaymentProvider implements PaymentProvider {
  async createPayment(params: { orderId: string; amount: number }): Promise<CreatePaymentResult> {
    return {
      providerOrderId: `order_stub_${randomUUID().replace(/-/g, '').slice(0, 18)}`,
      amount: params.amount,
      keyId: 'rzp_stub_not_a_real_key',
    };
  }
}

export const paymentProvider: PaymentProvider = new StubPaymentProvider();
