export interface RazorpayPaymentHandoff {
  razorpayOrderId: string;
  amount: number;
  keyId: string;
}

export interface RazorpaySuccessPayload {
  razorpayPaymentId: string;
  razorpaySignature: string;
}

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Razorpay checkout script.')),
      );
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout script.'));
    document.body.appendChild(script);
  });
}

/**
 * Opens the real Razorpay Checkout widget (docs/Architecture.md §5.2 step
 * 3). Only ever called with a real (non-stub) keyId — callers check
 * RAZORPAY_STUB_KEY_ID (lib/payment-constants.ts) first, since the widget
 * has nothing real to connect to for the stub provider's fake order id.
 */
export async function openRazorpayCheckout(
  handoff: RazorpayPaymentHandoff,
  callbacks: { onSuccess: (payload: RazorpaySuccessPayload) => void; onDismiss: () => void },
): Promise<void> {
  await loadRazorpayScript();
  if (!window.Razorpay) throw new Error('Razorpay checkout script did not load correctly.');

  const rzp = new window.Razorpay({
    key: handoff.keyId,
    amount: handoff.amount,
    currency: 'INR',
    order_id: handoff.razorpayOrderId,
    name: 'GreenGrandMart',
    handler: (response) => {
      callbacks.onSuccess({
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySignature: response.razorpay_signature,
      });
    },
    modal: { ondismiss: () => callbacks.onDismiss() },
  });
  rzp.open();
}
