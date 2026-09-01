CREATE TABLE "YouthAcademySchedule" (
    "id" TEXT NOT NULL,
    "academyName" TEXT NOT NULL,
    "weekdays" TEXT NOT NULL,
    "attendanceMinute" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "youthId" TEXT NOT NULL,

    CONSTRAINT "YouthAcademySchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "YouthAcademySchedule_academyName_check"
      CHECK (char_length("academyName") BETWEEN 1 AND 100),
    CONSTRAINT "YouthAcademySchedule_weekdays_check"
      CHECK ("weekdays" ~ '^[0-6](,[0-6])*$'),
    CONSTRAINT "YouthAcademySchedule_attendanceMinute_check"
      CHECK ("attendanceMinute" >= 0 AND "attendanceMinute" < 1440),
    CONSTRAINT "YouthAcademySchedule_sortOrder_check"
      CHECK ("sortOrder" >= 0)
);

CREATE UNIQUE INDEX "YouthAcademySchedule_youth_slot_key"
ON "YouthAcademySchedule"("youthId", "academyName", "weekdays", "attendanceMinute");

CREATE INDEX "YouthAcademySchedule_youthId_sortOrder_idx"
ON "YouthAcademySchedule"("youthId", "sortOrder");

CREATE INDEX "YouthAcademySchedule_academyName_idx"
ON "YouthAcademySchedule"("academyName");

ALTER TABLE "YouthAcademySchedule"
ADD CONSTRAINT "YouthAcademySchedule_youthId_fkey"
FOREIGN KEY ("youthId") REFERENCES "Youth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "YouthAcademySchedule" ENABLE ROW LEVEL SECURITY;
