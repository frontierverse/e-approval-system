ALTER TABLE "YouthLearningSchedule" ADD COLUMN "recurrenceWeekdays" TEXT;

UPDATE "YouthLearningSchedule"
SET "recurrenceWeekdays" = EXTRACT(DOW FROM "scheduleDate"::date)::int::text
WHERE "repeatsWeekly" = true
  AND "recurrenceWeekdays" IS NULL;

UPDATE "YouthLearningSchedule" occurrence
SET "recurrenceWeekdays" = source."recurrenceWeekdays"
FROM "YouthLearningSchedule" source
WHERE occurrence."recurrenceSourceDate" = source."scheduleDate"
  AND occurrence."youthId" = source."youthId"
  AND source."repeatsWeekly" = true
  AND occurrence."recurrenceWeekdays" IS NULL
  AND source."recurrenceWeekdays" IS NOT NULL;

CREATE INDEX "YouthLearningSchedule_recurrenceWeekdays_idx"
ON "YouthLearningSchedule"("recurrenceWeekdays");
