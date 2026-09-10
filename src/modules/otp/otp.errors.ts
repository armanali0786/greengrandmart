import { DomainError } from '@/lib/errors';

/** docs/API_Spec.md §1.3: OTP_INVALID, 400 — wrong/expired code, or too many attempts. */
export class OtpInvalidError extends DomainError {
  readonly code = 'OTP_INVALID' as const;
  readonly httpStatus = 400;

  constructor(message = 'Incorrect or expired code.') {
    super(message);
  }
}
