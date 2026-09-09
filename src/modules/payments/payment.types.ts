// Matches the DB CHECK constraint chk_payments_status
// (docs/Data_Model_DB_Schema.md) exactly — Prisma models this column as a
// plain String (see Payment model comment in schema.prisma), so this union
// is the only place these values are typed.
export type PaymentStatus =
  | 'created'
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded'
  | 'partially_refunded';
