BEGIN;

CREATE TYPE "YouthPersonalScheduleType" AS ENUM ('GENERAL', 'HOSPITAL');
CREATE TYPE "YouthPersonalScheduleEscortType" AS ENUM ('STAFF', 'OTHER');

ALTER TABLE "YouthPersonalSchedule"
ADD COLUMN "scheduleType" "YouthPersonalScheduleType" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN "hospitalName" TEXT,
ADD COLUMN "escortType" "YouthPersonalScheduleEscortType",
ADD COLUMN "escortUserId" TEXT,
ADD COLUMN "escortName" TEXT,
ADD COLUMN "nextAppointmentDate" TEXT;

CREATE INDEX "YouthPersonalSchedule_escortUserId_idx"
ON "YouthPersonalSchedule"("escortUserId");

ALTER TABLE "YouthPersonalSchedule"
ADD CONSTRAINT "YouthPersonalSchedule_escortUserId_fkey"
FOREIGN KEY ("escortUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE
NOT VALID;

ALTER TABLE "YouthPersonalSchedule"
ADD CONSTRAINT "YouthPersonalSchedule_hospital_fields_check"
CHECK (
  (
    "scheduleType" = 'GENERAL'
    AND "hospitalName" IS NULL
    AND "escortType" IS NULL
    AND "escortUserId" IS NULL
    AND "escortName" IS NULL
    AND "nextAppointmentDate" IS NULL
  )
  OR
  (
    "scheduleType" = 'HOSPITAL'
    AND "selectionMode" = 'DATES'
    AND cardinality("occurrenceDates") = 1
    AND "hospitalName" IS NOT NULL
    AND char_length(btrim("hospitalName")) BETWEEN 1 AND 100
    AND "escortType" IS NOT NULL
    AND "escortName" IS NOT NULL
    AND char_length(btrim("escortName")) >= 1
    -- STAFF rows normally have a user id. SET NULL must remain valid if that
    -- user is later deleted, while OTHER rows must never reference a user.
    AND (
      "escortType" = 'STAFF'
      OR (
        "escortType" = 'OTHER'
        AND "escortUserId" IS NULL
        AND char_length(btrim("escortName")) BETWEEN 1 AND 80
      )
    )
    AND (
      "nextAppointmentDate" IS NULL
      OR (
        "nextAppointmentDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        AND "nextAppointmentDate" > ("occurrenceDates")[1]
      )
    )
  )
) NOT VALID;

ALTER TABLE "YouthPersonalSchedule"
VALIDATE CONSTRAINT "YouthPersonalSchedule_escortUserId_fkey";

ALTER TABLE "YouthPersonalSchedule"
VALIDATE CONSTRAINT "YouthPersonalSchedule_hospital_fields_check";

COMMIT;
