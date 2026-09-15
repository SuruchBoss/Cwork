-- Per-user notification preferences.
--
-- The two `DROP INDEX` statements Prisma generated here have been removed by
-- hand: they target the hand-written search indexes from
-- `20260915030000_search_and_integrity`, which Prisma does not model and so
-- reports as drift on every generated migration. See
-- docs/operations.md#migrations-and-the-drift-trap, and run `npm run db:verify`
-- after applying this.

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT '*',
    "email" BOOLEAN NOT NULL DEFAULT true,
    "push" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_type_key" ON "notification_preferences"("userId", "type");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
