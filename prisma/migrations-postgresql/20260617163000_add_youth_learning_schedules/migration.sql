CREATE TABLE "YouthLearningSchedule" (
    "id" TEXT NOT NULL,
    "startHour" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "youthId" TEXT NOT NULL,

    CONSTRAINT "YouthLearningSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "YouthLearningSchedule_youthId_startHour_key" ON "YouthLearningSchedule"("youthId", "startHour");
CREATE INDEX "YouthLearningSchedule_startHour_idx" ON "YouthLearningSchedule"("startHour");

ALTER TABLE "YouthLearningSchedule" ADD CONSTRAINT "YouthLearningSchedule_youthId_fkey" FOREIGN KEY ("youthId") REFERENCES "Youth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
