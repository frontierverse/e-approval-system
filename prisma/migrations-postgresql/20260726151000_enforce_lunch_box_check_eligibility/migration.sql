BEGIN;

-- A preparation check is only valid while at least one lunch box is assigned.
-- Count edits clear the check in the same UPDATE, so legitimate zeroing remains
-- possible while direct or stale writes cannot create a hidden completion.
ALTER TABLE "LunchBoxCount"
ADD CONSTRAINT "LunchBoxCount_checked_positive_total_check"
CHECK (
  "checkedAt" IS NULL
  OR (
    "class1Count"
    + "class2Count"
    + "class3Count"
    + "class4Count"
    + "linkedCount"
    + "preservationCount"
    + "deliveryDriverCount"
  ) > 0
);

COMMIT;
