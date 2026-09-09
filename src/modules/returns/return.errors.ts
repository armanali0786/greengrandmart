import { DomainError } from '@/lib/errors';

/** Not itemized in docs/API_Spec.md's error code table — added this phase, same pattern as ConflictError/InvalidImageError. */
export class ReturnWindowExpiredError extends DomainError {
  readonly code = 'RETURN_WINDOW_EXPIRED' as const;
  readonly httpStatus = 409;

  constructor(message = 'The return window for this order has closed.') {
    super(message);
  }
}

export class InvalidReturnStateError extends DomainError {
  readonly code = 'INVALID_RETURN_STATE' as const;
  readonly httpStatus = 409;

  constructor(message: string) {
    super(message);
  }
}
