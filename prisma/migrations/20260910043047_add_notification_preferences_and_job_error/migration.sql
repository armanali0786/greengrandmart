-- AlterTable
ALTER TABLE "job_queue" ADD COLUMN     "last_error" TEXT;

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "email_order_updates" BOOLEAN NOT NULL DEFAULT true,
    "email_promotions" BOOLEAN NOT NULL DEFAULT true,
    "push_order_updates" BOOLEAN NOT NULL DEFAULT true,
    "push_promotions" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- The idx_carts_user/idx_carts_session CREATE INDEX statements Prisma's
-- diff generated here were the same recurring spurious drift noise fixed
-- in Phase 8's migration (see that migration's own comment) — removed here
-- too, and the Cart model's schema.prisma declaration that kept causing it
-- has now been deleted entirely so it won't recur again.

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
