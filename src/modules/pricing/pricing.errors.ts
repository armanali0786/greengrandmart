import { DomainError } from '@/lib/errors';

/**
 * docs/API_Spec.md error code table: COUPON_INVALID, 400. Product_Spec_Requirements.md
 * §4.2 requires a *specific* reason per failure mode ("expired," "requires
 * a minimum order of ₹999," "already used") — never a generic message —
 * so every throw site passes its own concrete message.
 */
export class CouponInvalidError extends DomainError {
  readonly code = 'COUPON_INVALID' as const;
  readonly httpStatus = 400;

  constructor(message: string) {
    super(message);
  }
}
