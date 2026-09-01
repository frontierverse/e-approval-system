ALTER TABLE "YouthAcademySchedule"
ADD COLUMN "endMinute" INTEGER;

-- Keep pre-existing schedules nullable instead of inventing a finish time.
-- All schedules written through the application validate and persist this value.
ALTER TABLE "YouthAcademySchedule"
ADD CONSTRAINT "YouthAcademySchedule_endMinute_check"
CHECK (
  "endMinute" IS NULL
  OR (
    "endMinute" >= 0
    AND "endMinute" < 1440
    AND "endMinute" > "attendanceMinute"
  )
);
