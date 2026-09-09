-- Enforces "at most one active cart per owner" at the DB level, closing a
-- race between concurrent requests that each call getOrCreateCart for the
-- same user/session (e.g. the Header's own cart fetch racing the
-- post-login cart-merge call) — without this, both could see "no active
-- cart" and each create one, silently splitting the owner's cart in two.
-- These indexes already existed as plain (non-unique) partial indexes from
-- the init migration; schema.prisma's @@index can't express the WHERE
-- clause or UNIQUE-ness for a partial index (same limitation as the
-- search_vector trigger, see Data_Model_DB_Schema.md), so this is another
-- hand-written deviation from the generated diff.
DROP INDEX "idx_carts_user";
CREATE UNIQUE INDEX "idx_carts_user" ON "carts"("user_id") WHERE "status" = 'active';

DROP INDEX "idx_carts_session";
CREATE UNIQUE INDEX "idx_carts_session" ON "carts"("session_id") WHERE "status" = 'active';
