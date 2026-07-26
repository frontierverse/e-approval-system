BEGIN;

ALTER TABLE "LunchBoxCount"
ADD COLUMN "checkedAt" TIMESTAMP(3),
ADD COLUMN "checkedById" TEXT;

CREATE INDEX "LunchBoxCount_checkedById_idx"
ON "LunchBoxCount"("checkedById");

ALTER TABLE "LunchBoxCount"
ADD CONSTRAINT "LunchBoxCount_checkedById_fkey"
FOREIGN KEY ("checkedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- A deleted user may leave a completion time without an actor, but an actor
-- must never be stored without a completion time.
ALTER TABLE "LunchBoxCount"
ADD CONSTRAINT "LunchBoxCount_checked_metadata_check"
CHECK ("checkedAt" IS NOT NULL OR "checkedById" IS NULL);

COMMIT;
