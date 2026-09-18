-- Drop the unused selfie column from attendance punches (CW-033).
--
-- `selfieFileId` was never set to a non-null value: there is no camera capture
-- anywhere in the app, and selfie capture was considered and not adopted (it
-- drags consent and retention obligations along with it). A column nothing
-- writes misleads whoever reads the schema next, so it is removed.
--
-- The two `DROP INDEX` statements Prisma generated here have been removed by
-- hand: they target the hand-written search indexes from
-- `20260915030000_search_and_integrity`, which Prisma does not model and so
-- reports as drift on every generated migration. See
-- docs/operations.md#migrations-and-the-drift-trap, and run `npm run db:verify`
-- after applying this.

-- AlterTable
ALTER TABLE "attendance_punches" DROP COLUMN "selfieFileId";
