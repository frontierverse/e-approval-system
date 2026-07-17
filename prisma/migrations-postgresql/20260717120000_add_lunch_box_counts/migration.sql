CREATE TABLE "LunchBoxSchool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LunchBoxSchool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LunchBoxSchool_name_key" ON "LunchBoxSchool"("name");
CREATE INDEX "LunchBoxSchool_type_idx" ON "LunchBoxSchool"("type");

CREATE TABLE "LunchBoxCount" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "class1Count" INTEGER NOT NULL DEFAULT 0,
    "class2Count" INTEGER NOT NULL DEFAULT 0,
    "class3Count" INTEGER NOT NULL DEFAULT 0,
    "class4Count" INTEGER NOT NULL DEFAULT 0,
    "linkedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LunchBoxCount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LunchBoxCount_schoolId_date_key" ON "LunchBoxCount"("schoolId", "date");
CREATE INDEX "LunchBoxCount_date_idx" ON "LunchBoxCount"("date");

ALTER TABLE "LunchBoxCount" ADD CONSTRAINT "LunchBoxCount_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "LunchBoxSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep Supabase anon/authenticated API roles away from direct table access.
ALTER TABLE "LunchBoxSchool" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LunchBoxCount" ENABLE ROW LEVEL SECURITY;
