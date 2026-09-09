import { DomainError } from '@/lib/errors';

/** docs/API_Spec.md §1.3: PAYMENT_VERIFICATION_FAILED, 400 — "Razorpay signature check failed." Used for both the client-confirm signature and the webhook signature. */
export class PaymentVerificationError extends DomainError {
  readonly code = 'PAYMENT_VERIFICATION_FAILED' as const;
  readonly httpStatus = 400;

  constructor(message = 'Razorpay signature check failed.') {
    super(message);
  }
}
