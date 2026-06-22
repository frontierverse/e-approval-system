CREATE TABLE "YouthCommonSchedule" (
    "id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startHour" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YouthCommonSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "YouthCommonSchedule_weekday_startMinute_key" ON "YouthCommonSchedule"("weekday", "startMinute");
CREATE INDEX "YouthCommonSchedule_weekday_startMinute_idx" ON "YouthCommonSchedule"("weekday", "startMinute");
CREATE INDEX "YouthCommonSchedule_startHour_idx" ON "YouthCommonSchedule"("startHour");
CREATE INDEX "YouthCommonSchedule_startMinute_idx" ON "YouthCommonSchedule"("startMinute");
