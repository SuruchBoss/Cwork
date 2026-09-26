-- A work location's code becomes an immutable identifier (CW-049 / ADR-0006).
--
-- Once a site is first used its code is fixed; a wrong code is replaced by
-- creating a new location and deactivating the old one, which now points at its
-- replacement. This adds that "superseded by" self-link. History stays intact:
-- the old row is kept (deactivated), so every punch and record that referenced
-- it still resolves.
--
-- The format rule (^[A-Z0-9][A-Z0-9-]{1,31}$) is enforced in the application
-- layer, as the department and position codes are; existing codes are checked
-- by scripts/report-location-codes.ts, which reports and refuses rather than
-- mangling a code it cannot mechanically fix.

-- AlterTable
ALTER TABLE "work_locations" ADD COLUMN "supersededById" UUID;

-- AddForeignKey
ALTER TABLE "work_locations" ADD CONSTRAINT "work_locations_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
