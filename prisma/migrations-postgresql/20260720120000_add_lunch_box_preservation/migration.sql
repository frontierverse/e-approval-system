ALTER TABLE "LunchBoxSchool"
ADD COLUMN "preservationClass" INTEGER;

ALTER TABLE "LunchBoxCount"
ADD COLUMN "preservationCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "LunchBoxSchool"
ADD CONSTRAINT "LunchBoxSchool_preservationClass_check"
CHECK ("preservationClass" IS NULL OR "preservationClass" BETWEEN 1 AND 4);

ALTER TABLE "LunchBoxCount"
ADD CONSTRAINT "LunchBoxCount_preservationCount_check"
CHECK ("preservationCount" >= 0);

-- The attached 2026 schedule assigns one preserved meal to every elementary
-- service date. The two schools below use class 2; all other listed schools
-- use class 1. An explicit school list keeps this historical import scoped to
-- the supplied document even if more elementary schools are added later.
UPDATE "LunchBoxSchool"
SET
  "preservationClass" = CASE
    WHEN "name" IN ('이리고현초', '이리부천초') THEN 2
    ELSE 1
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" IN (
  '영만초',
  '이리계문초',
  '이리고현초',
  '이리남창초',
  '이리남초',
  '이리동남초',
  '이리동북초',
  '이리동산초',
  '이리동초',
  '이리마한초',
  '이리모현초',
  '이리백제초',
  '이리부송초',
  '이리부천초',
  '이리북일초',
  '이리북초',
  '이리삼성초',
  '이리서초',
  '이리석암초',
  '이리송학초',
  '이리신동초',
  '이리신흥초',
  '이리영등초',
  '이리중앙초',
  '이리초',
  '이리팔봉초',
  '익산가온초',
  '익산궁동초',
  '익산어양초',
  '익산옥야초',
  '익산초',
  '익산한벌초'
);

UPDATE "LunchBoxCount" AS count
SET
  "preservationCount" = 1,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "LunchBoxSchool" AS school
WHERE count."schoolId" = school."id"
  AND school."name" IN (
    '영만초',
    '이리계문초',
    '이리고현초',
    '이리남창초',
    '이리남초',
    '이리동남초',
    '이리동북초',
    '이리동산초',
    '이리동초',
    '이리마한초',
    '이리모현초',
    '이리백제초',
    '이리부송초',
    '이리부천초',
    '이리북일초',
    '이리북초',
    '이리삼성초',
    '이리서초',
    '이리석암초',
    '이리송학초',
    '이리신동초',
    '이리신흥초',
    '이리영등초',
    '이리중앙초',
    '이리초',
    '이리팔봉초',
    '익산가온초',
    '익산궁동초',
    '익산어양초',
    '익산옥야초',
    '익산초',
    '익산한벌초'
  )
  AND count."date" BETWEEN DATE '2026-07-20' AND DATE '2026-08-31'
  AND (
    count."class1Count" + count."class2Count" + count."class3Count" +
    count."class4Count" + count."linkedCount"
  ) > 0;

-- The kindergarten appendix explicitly lists preserved meals only on Jul 29-31.
-- It does not name an assigned class, so its school-level class remains NULL.
UPDATE "LunchBoxCount" AS count
SET
  "preservationCount" = 1,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "LunchBoxSchool" AS school
WHERE count."schoolId" = school."id"
  AND school."name" = '이리동남초 병설유치원'
  AND count."date" IN (
    DATE '2026-07-29',
    DATE '2026-07-30',
    DATE '2026-07-31'
  );
