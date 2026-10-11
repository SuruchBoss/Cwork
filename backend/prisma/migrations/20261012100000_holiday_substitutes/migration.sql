-- A holiday row can be the substitute day for another that fell on the weekly
-- day off (CW-081). Existing rows are unchanged: none is a substitute.

ALTER TABLE "holidays" ADD COLUMN "substituteForId" UUID;

CREATE UNIQUE INDEX "holidays_substituteForId_key" ON "holidays"("substituteForId");

ALTER TABLE "holidays" ADD CONSTRAINT "holidays_substituteForId_fkey" FOREIGN KEY ("substituteForId") REFERENCES "holidays"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
