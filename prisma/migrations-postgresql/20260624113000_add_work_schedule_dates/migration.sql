ALTER TABLE "WorkSchedule" ADD COLUMN "scheduleDate" TEXT;

UPDATE "WorkSchedule"
SET "scheduleDate" = CASE "weekday"
    WHEN 0 THEN '2026-06-28'
    WHEN 1 THEN '2026-06-22'
    WHEN 2 THEN '2026-06-23'
    WHEN 3 THEN '2026-06-24'
    WHEN 4 THEN '2026-06-25'
    WHEN 5 THEN '2026-06-26'
    WHEN 6 THEN '2026-06-27'
    ELSE '2026-06-22'
  END
WHERE "scheduleDate" IS NULL;

ALTER TABLE "WorkSchedule" ALTER COLUMN "scheduleDate" SET NOT NULL;

DROP INDEX IF EXISTS "WorkSchedule_weekday_startMinute_key";

CREATE UNIQUE INDEX "WorkSchedule_scheduleDate_startMinute_key" ON "WorkSchedule"("scheduleDate", "startMinute");
CREATE INDEX "WorkSchedule_scheduleDate_startMinute_idx" ON "WorkSchedule"("scheduleDate", "startMinute");
