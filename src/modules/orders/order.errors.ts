import { DomainError } from '@/lib/errors';

/** docs/API_Spec.md: INVALID_ORDER_STATE, 409 — e.g. "Cannot move from 'confirmed' directly to 'delivered'." */
export class InvalidOrderStateError extends DomainError {
  readonly code = 'INVALID_ORDER_STATE' as const;
  readonly httpStatus = 409;

  constructor(message: string) {
    super(message);
  }
}

/** docs/API_Spec.md §5: cart item fails re-validation at checkout → OUT_OF_STOCK or PRICE_CHANGED, order not created. */
export class PriceChangedError extends DomainError {
  readonly code = 'PRICE_CHANGED' as const;
  readonly httpStatus = 409;

  constructor(
    message = 'Prices in your cart have changed. Please review before placing your order.',
  ) {
    super(message);
  }
}
