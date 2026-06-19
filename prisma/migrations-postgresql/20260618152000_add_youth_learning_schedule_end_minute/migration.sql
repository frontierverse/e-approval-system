ALTER TABLE "YouthLearningSchedule" ADD COLUMN "endMinute" INTEGER;

UPDATE "YouthLearningSchedule"
SET "endMinute" = "endHour" * 60
WHERE "endMinute" IS NULL;

ALTER TABLE "YouthLearningSchedule" ALTER COLUMN "endMinute" SET NOT NULL;
