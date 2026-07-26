BEGIN;

CREATE TABLE "LunchBoxSchoolCheck" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL,
  "checkedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LunchBoxSchoolCheck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LunchBoxSchoolCheck_schoolId_key"
ON "LunchBoxSchoolCheck"("schoolId");

CREATE INDEX "LunchBoxSchoolCheck_checkedById_idx"
ON "LunchBoxSchoolCheck"("checkedById");

ALTER TABLE "LunchBoxSchoolCheck"
ADD CONSTRAINT "LunchBoxSchoolCheck_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "LunchBoxSchool"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LunchBoxSchoolCheck"
ADD CONSTRAINT "LunchBoxSchoolCheck_checkedById_fkey"
FOREIGN KEY ("checkedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'LunchBoxSchoolCheck'
  ) THEN
    ALTER PUBLICATION supabase_realtime
    ADD TABLE public."LunchBoxSchoolCheck";
  END IF;
END
$$;

COMMIT;
