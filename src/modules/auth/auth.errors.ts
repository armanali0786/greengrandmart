import { DomainError } from '@/lib/errors';

export class UnauthenticatedError extends DomainError {
  readonly code = 'UNAUTHENTICATED' as const;
  readonly httpStatus = 401;

  constructor(message = 'You must be signed in to do that.') {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN' as const;
  readonly httpStatus = 403;

  constructor(message = "You don't have permission to do that.") {
    super(message);
  }
}

/**
 * docs/Product_Spec_Requirements.md §1.4: account deletion "requires
 * re-authentication (password or recent login) before proceeding". Thrown
 * when the ID token's `auth_time` is older than REAUTH_MAX_AGE_SECONDS
 * (auth.service.ts) — the client must re-authenticate and retry with a
 * fresh token.
 */
export class ReauthenticationRequiredError extends DomainError {
  readonly code = 'REAUTHENTICATION_REQUIRED' as const;
  readonly httpStatus = 401;

  constructor(message = 'Please re-enter your password to continue.') {
    super(message);
  }
}
