ALTER TABLE "YouthLearningSchedule" ADD COLUMN "repeatsWeekly" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "YouthLearningSchedule_repeatsWeekly_scheduleDate_idx"
ON "YouthLearningSchedule"("repeatsWeekly", "scheduleDate");
