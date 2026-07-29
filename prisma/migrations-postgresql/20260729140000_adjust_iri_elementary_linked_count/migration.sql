BEGIN;

-- From August 3, Iri Elementary School's linked-care class supplies 20 meals.
UPDATE "LunchBoxCount" AS count
SET
  "linkedCount" = 20,
  "checkedAt" = NULL,
  "checkedById" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "LunchBoxSchool" AS school
WHERE count."schoolId" = school."id"
  AND school."name" = '이리초'
  AND school."type" = 'elementary'
  AND count."date" BETWEEN DATE '2026-08-03' AND DATE '2026-08-31';

COMMIT;
