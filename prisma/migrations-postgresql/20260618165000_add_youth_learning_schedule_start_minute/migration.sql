ALTER TABLE "YouthLearningSchedule" ADD COLUMN "startMinute" INTEGER;

UPDATE "YouthLearningSchedule"
SET "startMinute" = "startHour" * 60
WHERE "startMinute" IS NULL;

ALTER TABLE "YouthLearningSchedule" ALTER COLUMN "startMinute" SET NOT NULL;

DROP INDEX IF EXISTS "YouthLearningSchedule_youthId_scheduleDate_startHour_key";
DROP INDEX IF EXISTS "YouthLearningSchedule_scheduleDate_startHour_idx";

CREATE UNIQUE INDEX "YouthLearningSchedule_youthId_scheduleDate_startMinute_key"
ON "YouthLearningSchedule"("youthId", "scheduleDate", "startMinute");

CREATE INDEX "YouthLearningSchedule_scheduleDate_startMinute_idx"
ON "YouthLearningSchedule"("scheduleDate", "startMinute");

CREATE INDEX "YouthLearningSchedule_startMinute_idx"
ON "YouthLearningSchedule"("startMinute");
