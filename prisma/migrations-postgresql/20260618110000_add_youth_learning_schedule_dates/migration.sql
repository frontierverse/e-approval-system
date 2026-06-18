ALTER TABLE "YouthLearningSchedule" ADD COLUMN "scheduleDate" TEXT;

UPDATE "YouthLearningSchedule"
SET "scheduleDate" = to_char(CURRENT_DATE, 'YYYY-MM-DD')
WHERE "scheduleDate" IS NULL;

ALTER TABLE "YouthLearningSchedule" ALTER COLUMN "scheduleDate" SET NOT NULL;

DROP INDEX "YouthLearningSchedule_youthId_startHour_key";

CREATE UNIQUE INDEX "YouthLearningSchedule_youthId_scheduleDate_startHour_key"
ON "YouthLearningSchedule"("youthId", "scheduleDate", "startHour");

CREATE INDEX "YouthLearningSchedule_scheduleDate_startHour_idx"
ON "YouthLearningSchedule"("scheduleDate", "startHour");
