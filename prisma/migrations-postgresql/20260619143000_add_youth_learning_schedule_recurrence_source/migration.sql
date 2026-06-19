ALTER TABLE "YouthLearningSchedule" ADD COLUMN "recurrenceSourceDate" TEXT;

CREATE INDEX "YouthLearningSchedule_recurrenceSourceDate_idx"
ON "YouthLearningSchedule"("recurrenceSourceDate");
