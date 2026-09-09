-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_order_id_key" ON "invoices"("order_id");

-- The two idx_carts_user/idx_carts_session CREATE INDEX statements Prisma's
-- diff engine generated here were spurious drift noise, not a real schema
-- change from this migration: the Cart model's declarative `@@index([userId])`
-- in schema.prisma can't express the partial UNIQUE ... WHERE status='active'
-- indexes the Phase 4 migration `unique_active_cart_per_owner` actually
-- created (Prisma's schema DSL has no WHERE-clause index syntax), so every
-- subsequent `migrate dev` diff sees "declared index doesn't match what's in
-- the DB" and tries to (re)create a plain index that would collide with the
-- real one. Removed here — see docs/Data_Model_DB_Schema.md's cart index
-- note for the actual index definitions.

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
