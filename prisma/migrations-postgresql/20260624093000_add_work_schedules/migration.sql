ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_WORK_SCHEDULE';

CREATE TABLE "WorkSchedule" (
    "id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startHour" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkSchedule_weekday_startMinute_key" ON "WorkSchedule"("weekday", "startMinute");
CREATE INDEX "WorkSchedule_weekday_startMinute_idx" ON "WorkSchedule"("weekday", "startMinute");
CREATE INDEX "WorkSchedule_startHour_idx" ON "WorkSchedule"("startHour");
CREATE INDEX "WorkSchedule_startMinute_idx" ON "WorkSchedule"("startMinute");
