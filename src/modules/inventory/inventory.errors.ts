import { DomainError } from '@/lib/errors';

export class OutOfStockError extends DomainError {
  readonly code = 'OUT_OF_STOCK' as const;
  readonly httpStatus = 409;

  constructor(message = 'The requested quantity is no longer available.') {
    super(message);
  }
}
