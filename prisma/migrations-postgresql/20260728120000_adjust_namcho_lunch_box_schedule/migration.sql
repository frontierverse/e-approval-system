BEGIN;

-- From August 3, Namcho supplies 15 meals in total, including one preserved
-- meal. The serving count is stored separately from the preserved meal count.
UPDATE "LunchBoxCount" AS count
SET
  "class1Count" = 14,
  "class2Count" = 0,
  "class3Count" = 0,
  "class4Count" = 0,
  "linkedCount" = 0,
  "preservationCount" = 1,
  "checkedAt" = NULL,
  "checkedById" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "LunchBoxSchool" AS school
WHERE count."schoolId" = school."id"
  AND school."name" = '남초'
  AND school."type" = 'elementary'
  AND count."date" BETWEEN DATE '2026-08-03' AND DATE '2026-08-31';

COMMIT;
