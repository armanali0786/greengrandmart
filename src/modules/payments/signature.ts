import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/config/env';

function isHexString(value: string): boolean {
  return value.length > 0 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}

/** Constant-time comparison of two hex-encoded HMAC digests — guards against timing attacks on the comparison itself, not just the signature secret. */
function hexEquals(expectedHex: string, actualHex: string): boolean {
  if (!isHexString(actualHex)) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * docs/Security.md §7, verification #1 (client-confirm step): "HMAC-SHA256
 * using the payment ID + order ID + Razorpay Key Secret" — this is Razorpay's
 * own documented checkout-success formula: HMAC-SHA256(order_id + "|" +
 * payment_id, key_secret). Necessary but NOT sufficient to confirm an order
 * (docs/Product_Spec_Requirements.md §6.1) — only the webhook may do that.
 */
export function verifyPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const expected = createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest('hex');
  return hexEquals(expected, params.razorpaySignature);
}

/**
 * docs/Security.md §7, verification #2 (webhook): "HMAC-SHA256 using the raw
 * request body + webhook secret", checked against `X-Razorpay-Signature`
 * "before parsing the body as JSON." Callers must pass the untouched request
 * body text — never a re-serialized/re-parsed version, since that could
 * differ byte-for-byte from what Razorpay actually signed.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return hexEquals(expected, signatureHeader);
}
