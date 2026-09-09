/**
 * Base class for all typed domain errors. Modules throw concrete subclasses
 * (e.g. `OutOfStockError` in modules/inventory/inventory.errors.ts); the
 * route-handler layer (lib/api-response.ts `error()`) catches `DomainError`
 * uniformly and maps it to the standard envelope from docs/API_Spec.md — new
 * error types never require touching api-response.ts.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  readonly httpStatus: number = 400;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Generic "resource doesn't exist or isn't visible to this caller" — used
 * across modules rather than duplicated per module, since it carries no
 * module-specific behavior. Deliberately doesn't distinguish "doesn't exist"
 * from "exists but you can't see it" in the message, to avoid leaking which
 * one it is (IDOR-adjacent information leak).
 */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND' as const;
  readonly httpStatus = 404;

  constructor(message = 'The requested resource was not found.') {
    super(message);
  }
}

/**
 * Thrown by lib/rate-limit.ts when a caller exceeds a configured
 * Postgres-backed sliding-window limit (docs/Security.md rate limiting table).
 */
export class RateLimitedError extends DomainError {
  readonly code = 'RATE_LIMITED' as const;
  readonly httpStatus = 429;

  constructor(message = 'Too many requests. Please try again later.') {
    super(message);
  }
}

/**
 * Generic "this unique value is already taken" — e.g. a product/category/
 * brand slug. Not itemized in docs/API_Spec.md's standard error code table
 * (added during Phase 3 implementation; reflected there too). Reusable
 * across modules the same way NotFoundError is, rather than one class per
 * module for the same shape of failure.
 */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT' as const;
  readonly httpStatus = 409;

  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
  }
}
