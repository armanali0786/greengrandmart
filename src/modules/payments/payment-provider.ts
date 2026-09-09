import { randomUUID } from 'node:crypto';
import { env } from '@/config/env';
import { RAZORPAY_STUB_KEY_ID } from '@/lib/payment-constants';

export interface CreatePaymentResult {
  providerOrderId: string;
  amount: number;
  keyId: string;
}

export interface PaymentProvider {
  createPayment(params: { orderId: string; amount: number }): Promise<CreatePaymentResult>;
}

/** Used whenever real Razorpay credentials aren't configured (local dev/test) — see createPaymentProvider() below. */
export class StubPaymentProvider implements PaymentProvider {
  async createPayment(params: { orderId: string; amount: number }): Promise<CreatePaymentResult> {
    return {
      providerOrderId: `order_stub_${randomUUID().replace(/-/g, '').slice(0, 18)}`,
      amount: params.amount,
      keyId: RAZORPAY_STUB_KEY_ID,
    };
  }
}

const RAZORPAY_ORDERS_URL = 'https://api.razorpay.com/v1/orders';

/**
 * Real Razorpay integration (docs/Architecture.md §4: `payments` module →
 * `PaymentProvider` interface + `RazorpayPaymentProvider` implementation).
 * Calls the Orders API directly via fetch + HTTP Basic Auth
 * (key_id:key_secret) instead of pulling in the `razorpay` npm SDK — it's a
 * single REST call, and AGENTS.md §8's "don't add new third-party services
 * beyond the provider interfaces already defined" reads as "don't add
 * another payment gateway," not "don't touch Razorpay's REST API directly."
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  async createPayment(params: { orderId: string; amount: number }): Promise<CreatePaymentResult> {
    const auth = Buffer.from(
      `${env.NEXT_PUBLIC_RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
    ).toString('base64');
    const res = await fetch(RAZORPAY_ORDERS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: params.amount,
        currency: 'INR',
        receipt: params.orderId,
      }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      // Never include the Authorization header or key secret in a thrown
      // error — this only ever reaches server logs, but Security.md §12
      // still applies.
      throw new Error(`Razorpay order creation failed (${res.status}): ${bodyText.slice(0, 200)}`);
    }
    const data = (await res.json()) as { id: string; amount: number };
    return {
      providerOrderId: data.id,
      amount: data.amount,
      keyId: env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    };
  }
}

const PLACEHOLDER_SECRET = 'placeholder_not_configured';

/**
 * Selects the real Razorpay integration once real credentials are
 * configured, falling back to the stub otherwise — the same
 * "no-real-account-in-local-dev" fallback shape as the Firebase Storage
 * emulator dev-fallback from Phase 3. Nothing in a real deployment should
 * ever leave RAZORPAY_KEY_SECRET as the shipped placeholder value.
 */
function createPaymentProvider(): PaymentProvider {
  if (env.RAZORPAY_KEY_SECRET === PLACEHOLDER_SECRET) {
    return new StubPaymentProvider();
  }
  return new RazorpayPaymentProvider();
}

export const paymentProvider: PaymentProvider = createPaymentProvider();
