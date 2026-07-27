BEGIN;

-- Source:
-- ★(취합)2026년 사회적 경제 연계형 통합 돌봄 지원사업(건강도시락)
-- 일자별 공급표(병설유치원 포함)(2차 260724).xlsx
--
-- A school campus needs exactly one preserved meal on each service date.
-- Prefer the elementary school whenever it is serving. The affiliated
-- kindergarten receives the preserved meal only while it serves alone.

-- Two affiliated-kindergarten schedules were imported with stale fixed
-- attendance. Restore their date-specific attendance before moving preserved
-- meals. Dongnam has eight children from Jul 27 onward, while Baekje has three
-- children on its August service dates.
WITH attendance_schedule(
  "schoolName",
  "class1Count",
  "dates"
) AS (
  VALUES
    (
      '동남초 병설유치원',
      8,
      ARRAY[
        DATE '2026-07-27',
        DATE '2026-07-28',
        DATE '2026-07-29',
        DATE '2026-07-30',
        DATE '2026-07-31',
        DATE '2026-08-03',
        DATE '2026-08-04',
        DATE '2026-08-05',
        DATE '2026-08-06',
        DATE '2026-08-07',
        DATE '2026-08-10',
        DATE '2026-08-11',
        DATE '2026-08-12',
        DATE '2026-08-13',
        DATE '2026-08-14',
        DATE '2026-08-18',
        DATE '2026-08-19',
        DATE '2026-08-20'
      ]::DATE[]
    ),
    (
      '백제초 병설유치원',
      3,
      ARRAY[
        DATE '2026-08-03',
        DATE '2026-08-04',
        DATE '2026-08-05',
        DATE '2026-08-06',
        DATE '2026-08-07',
        DATE '2026-08-10',
        DATE '2026-08-11',
        DATE '2026-08-12',
        DATE '2026-08-13',
        DATE '2026-08-14',
        DATE '2026-08-18',
        DATE '2026-08-19',
        DATE '2026-08-20',
        DATE '2026-08-21'
      ]::DATE[]
    )
),
expected_attendance AS (
  SELECT
    schedule."schoolName",
    schedule."class1Count",
    service_date."date"
  FROM attendance_schedule AS schedule
  CROSS JOIN LATERAL unnest(schedule."dates") AS service_date("date")
)
UPDATE "LunchBoxCount" AS count
SET
  "class1Count" = expected."class1Count",
  "checkedAt" = NULL,
  "checkedById" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM expected_attendance AS expected
JOIN "LunchBoxSchool" AS school
  ON school."name" = expected."schoolName"
 AND school."type" = 'kindergarten'
WHERE count."schoolId" = school."id"
  AND count."date" = expected."date"
  AND count."class1Count" IS DISTINCT FROM expected."class1Count";

-- Every serving elementary school owns its campus's preserved meal.
WITH expected_elementary AS (
  SELECT
    count."id",
    CASE
      WHEN (
        count."class1Count"
        + count."class2Count"
        + count."class3Count"
        + count."class4Count"
        + count."linkedCount"
      ) > 0
      THEN 1
      ELSE 0
    END AS "preservationCount"
  FROM "LunchBoxCount" AS count
  JOIN "LunchBoxSchool" AS school
    ON school."id" = count."schoolId"
  WHERE school."type" = 'elementary'
    AND count."date" BETWEEN DATE '2026-07-16' AND DATE '2026-08-31'
)
UPDATE "LunchBoxCount" AS count
SET
  "preservationCount" = expected."preservationCount",
  "checkedAt" = NULL,
  "checkedById" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM expected_elementary AS expected
WHERE count."id" = expected."id"
  AND count."preservationCount" IS DISTINCT FROM expected."preservationCount";

-- A serving affiliated kindergarten owns the preserved meal only when the
-- elementary school with the matching campus name has no serving lunches.
WITH expected_kindergarten AS (
  SELECT
    kindergarten_count."id",
    CASE
      WHEN (
        kindergarten_count."class1Count"
        + kindergarten_count."class2Count"
        + kindergarten_count."class3Count"
        + kindergarten_count."class4Count"
        + kindergarten_count."linkedCount"
      ) > 0
      AND COALESCE(
        elementary_count."class1Count"
        + elementary_count."class2Count"
        + elementary_count."class3Count"
        + elementary_count."class4Count"
        + elementary_count."linkedCount",
        0
      ) = 0
      THEN 1
      ELSE 0
    END AS "preservationCount"
  FROM "LunchBoxCount" AS kindergarten_count
  JOIN "LunchBoxSchool" AS kindergarten
    ON kindergarten."id" = kindergarten_count."schoolId"
  JOIN "LunchBoxSchool" AS elementary
    ON elementary."type" = 'elementary'
   AND elementary."name" = regexp_replace(
     kindergarten."name",
     ' 병설유치원$',
     ''
   )
  LEFT JOIN "LunchBoxCount" AS elementary_count
    ON elementary_count."schoolId" = elementary."id"
   AND elementary_count."date" = kindergarten_count."date"
  WHERE kindergarten."type" = 'kindergarten'
    AND kindergarten."name" LIKE '% 병설유치원'
    AND kindergarten_count."date"
      BETWEEN DATE '2026-07-16' AND DATE '2026-08-31'
)
UPDATE "LunchBoxCount" AS count
SET
  "preservationCount" = expected."preservationCount",
  "checkedAt" = NULL,
  "checkedById" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM expected_kindergarten AS expected
WHERE count."id" = expected."id"
  AND count."preservationCount" IS DISTINCT FROM expected."preservationCount";

-- Refuse the migration if any supplied campus has zero or duplicate preserved
-- meals after the hand-off. This covers both paired and unpaired elementary
-- schools without hard-coding individual campus names.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        CASE
          WHEN school."type" = 'kindergarten'
          THEN regexp_replace(school."name", ' 병설유치원$', '')
          ELSE school."name"
        END AS "campusName",
        count."date",
        SUM(
          count."class1Count"
          + count."class2Count"
          + count."class3Count"
          + count."class4Count"
          + count."linkedCount"
        ) AS "servingCount",
        SUM(count."preservationCount") AS "preservationCount"
      FROM "LunchBoxCount" AS count
      JOIN "LunchBoxSchool" AS school
        ON school."id" = count."schoolId"
      WHERE count."date" BETWEEN DATE '2026-07-16' AND DATE '2026-08-31'
        AND (
          school."type" = 'elementary'
          OR (
            school."type" = 'kindergarten'
            AND school."name" LIKE '% 병설유치원'
          )
        )
      GROUP BY "campusName", count."date"
    ) AS campus_day
    WHERE campus_day."servingCount" > 0
      AND campus_day."preservationCount" <> 1
  ) THEN
    RAISE EXCEPTION
      '도시락 공급 캠퍼스별 보존식은 날짜마다 정확히 1개여야 합니다.';
  END IF;
END $$;

COMMIT;
