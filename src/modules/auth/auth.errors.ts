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
