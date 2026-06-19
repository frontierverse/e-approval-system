ALTER TABLE "YouthLearningSchedule" ADD COLUMN "endHour" INTEGER;

UPDATE "YouthLearningSchedule"
SET "endHour" = "startHour" + 1
WHERE "endHour" IS NULL;

ALTER TABLE "YouthLearningSchedule" ALTER COLUMN "endHour" SET NOT NULL;
