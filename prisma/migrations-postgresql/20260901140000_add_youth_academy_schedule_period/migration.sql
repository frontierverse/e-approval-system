ALTER TABLE "YouthAcademySchedule"
ADD COLUMN "startDate" DATE,
ADD COLUMN "endDate" DATE;

-- Preserve legacy schedules without inventing an attendance period. New writes
-- provide both dates, while the database also prevents partial or reversed data.
ALTER TABLE "YouthAcademySchedule"
ADD CONSTRAINT "YouthAcademySchedule_period_check"
CHECK (
  ("startDate" IS NULL AND "endDate" IS NULL)
  OR (
    "startDate" IS NOT NULL
    AND "endDate" IS NOT NULL
    AND "endDate" >= "startDate"
  )
);
