import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { processWebhookEvent } from '@/modules/payments/payment.service';
import { PaymentVerificationError } from '@/modules/payments/payment.errors';

/**
 * docs/API_Spec.md §6: called by Razorpay, never the frontend — no
 * success/data envelope, follows Razorpay's plain 200/400 webhook contract.
 * Reads the body as raw text (not req.json()) because the signature is
 * verified against the exact bytes Razorpay signed, before any parsing —
 * docs/Security.md §7. Always responds 200 once the signature checks out,
 * even for events it ignores or fails to process (see payment.service.ts's
 * processWebhookEvent) — 400 is reserved for signature failure alone.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature');

  try {
    await processWebhookEvent(rawBody, signature);
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (e) {
    if (e instanceof PaymentVerificationError) {
      return NextResponse.json({ status: 'invalid_signature' }, { status: 400 });
    }
    console.error('Unexpected error handling Razorpay webhook', e);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
