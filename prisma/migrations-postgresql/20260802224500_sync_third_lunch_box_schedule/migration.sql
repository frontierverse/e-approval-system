BEGIN;

-- Source:
-- ★(취합)2026년 사회적 경제 연계형 통합 돌봄 지원사업(건강도시락)
-- 일자별 공급표(병설유치원 포함)(3차 260803).xlsx
-- Sheet: 초등학교+병설유치원(8월)
--
-- The preceding Iri Elementary migration corrects 20 linked-care rows. This
-- migration applies the remaining third-edition source changes to only the 33
-- explicit serving rows for Yeongman, Songhak, and Iksan Elementary schools.

LOCK TABLE "LunchBoxSchool" IN SHARE MODE;
LOCK TABLE "LunchBoxCount" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE "_lunch_box_third_before"
ON COMMIT DROP
AS SELECT * FROM "LunchBoxCount";

CREATE TEMP TABLE "_lunch_box_third_target" (
  "schoolName" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "oldClass1" INTEGER NOT NULL,
  "oldClass2" INTEGER NOT NULL,
  "oldClass3" INTEGER NOT NULL,
  "oldClass4" INTEGER NOT NULL,
  "oldLinked" INTEGER NOT NULL,
  "oldPreservation" INTEGER NOT NULL,
  "oldDriver" INTEGER NOT NULL,
  "newClass1" INTEGER NOT NULL,
  "newClass2" INTEGER NOT NULL,
  "newClass3" INTEGER NOT NULL,
  "newClass4" INTEGER NOT NULL,
  "newLinked" INTEGER NOT NULL,
  "newPreservation" INTEGER NOT NULL,
  "newDriver" INTEGER NOT NULL,
  PRIMARY KEY ("schoolName", "date")
) ON COMMIT DROP;

INSERT INTO "_lunch_box_third_target"
SELECT
  '영만초',
  service_date,
  15, 15, 14, 0, 0, 1, 0,
  15, 15, 15, 0, 0, 1, 0
FROM unnest(ARRAY[
  DATE '2026-08-03', DATE '2026-08-04', DATE '2026-08-05',
  DATE '2026-08-06', DATE '2026-08-07', DATE '2026-08-10',
  DATE '2026-08-11', DATE '2026-08-12', DATE '2026-08-13',
  DATE '2026-08-14'
]::DATE[]) AS service_date;

INSERT INTO "_lunch_box_third_target"
SELECT
  '송학초',
  service_date,
  18, 18, 17, 0, 0, 1, 0,
  17, 18, 17, 0, 0, 1, 0
FROM unnest(ARRAY[
  DATE '2026-08-03', DATE '2026-08-04', DATE '2026-08-05',
  DATE '2026-08-06', DATE '2026-08-07', DATE '2026-08-10',
  DATE '2026-08-11', DATE '2026-08-12', DATE '2026-08-13',
  DATE '2026-08-14', DATE '2026-08-18', DATE '2026-08-19'
]::DATE[]) AS service_date;

INSERT INTO "_lunch_box_third_target"
SELECT
  '익산초',
  service_date,
  22, 22, 0, 0, 0, 1, 0,
  20, 20, 0, 0, 0, 1, 0
FROM unnest(ARRAY[
  DATE '2026-08-03', DATE '2026-08-04', DATE '2026-08-05',
  DATE '2026-08-06', DATE '2026-08-07', DATE '2026-08-10',
  DATE '2026-08-11', DATE '2026-08-12', DATE '2026-08-13',
  DATE '2026-08-14', DATE '2026-08-18'
]::DATE[]) AS service_date;

CREATE TEMP TABLE "_lunch_box_third_iri_dates" (
  "date" DATE PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO "_lunch_box_third_iri_dates" ("date")
VALUES
  (DATE '2026-08-03'), (DATE '2026-08-04'), (DATE '2026-08-05'),
  (DATE '2026-08-06'), (DATE '2026-08-07'), (DATE '2026-08-10'),
  (DATE '2026-08-11'), (DATE '2026-08-12'), (DATE '2026-08-13'),
  (DATE '2026-08-14'), (DATE '2026-08-18'), (DATE '2026-08-19'),
  (DATE '2026-08-20'), (DATE '2026-08-21'), (DATE '2026-08-24'),
  (DATE '2026-08-25'), (DATE '2026-08-26'), (DATE '2026-08-27'),
  (DATE '2026-08-28'), (DATE '2026-08-31');

CREATE TEMP TABLE "_lunch_box_third_daily_total" (
  "date" DATE PRIMARY KEY,
  "total" BIGINT NOT NULL
) ON COMMIT DROP;

INSERT INTO "_lunch_box_third_daily_total" ("date", "total")
VALUES
  (DATE '2026-08-03', 1135),
  (DATE '2026-08-04', 1144),
  (DATE '2026-08-05', 1144),
  (DATE '2026-08-06', 1144),
  (DATE '2026-08-07', 1144),
  (DATE '2026-08-10', 1119),
  (DATE '2026-08-11', 1119),
  (DATE '2026-08-12', 1105),
  (DATE '2026-08-13', 1079),
  (DATE '2026-08-14', 1034),
  (DATE '2026-08-18', 741),
  (DATE '2026-08-19', 675),
  (DATE '2026-08-20', 496),
  (DATE '2026-08-21', 281),
  (DATE '2026-08-24', 212),
  (DATE '2026-08-25', 125),
  (DATE '2026-08-26', 84),
  (DATE '2026-08-27', 84),
  (DATE '2026-08-28', 84),
  (DATE '2026-08-31', 84);

-- Fresh installations intentionally start without lunch-box operational data.
-- Skip this historical correction only when both source tables are empty.
DO $$
DECLARE
  target_rows INTEGER;
  target_schools INTEGER;
  iri_rows INTEGER;
  august_total BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "LunchBoxSchool")
    AND NOT EXISTS (SELECT 1 FROM "LunchBoxCount") THEN
    RETURN;
  END IF;

  IF (SELECT COUNT(*) FROM "_lunch_box_third_target") <> 33 THEN
    RAISE EXCEPTION '3차 공급표 신규 보정 대상은 정확히 33행이어야 합니다.';
  END IF;

  SELECT COUNT(DISTINCT school."id")
  INTO target_schools
  FROM "_lunch_box_third_target" AS expected
  JOIN "LunchBoxSchool" AS school
    ON school."name" = expected."schoolName"
   AND school."type" = 'elementary'
   AND school."active";

  IF target_schools <> 3 THEN
    RAISE EXCEPTION '3차 공급표 신규 보정 대상 활성 학교는 정확히 3개여야 합니다: %', target_schools;
  END IF;

  SELECT COUNT(*)
  INTO target_rows
  FROM "_lunch_box_third_target" AS expected
  JOIN "LunchBoxSchool" AS school
    ON school."name" = expected."schoolName"
   AND school."type" = 'elementary'
   AND school."active"
  JOIN "LunchBoxCount" AS count
    ON count."schoolId" = school."id"
   AND count."date" = expected."date";

  IF target_rows <> 33 THEN
    RAISE EXCEPTION '3차 공급표 신규 보정 대상 DB 행은 정확히 33개여야 합니다: %', target_rows;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "_lunch_box_third_target" AS expected
    JOIN "LunchBoxSchool" AS school
      ON school."name" = expected."schoolName"
     AND school."type" = 'elementary'
     AND school."active"
    JOIN "LunchBoxCount" AS count
      ON count."schoolId" = school."id"
     AND count."date" = expected."date"
    WHERE ROW(
      count."class1Count",
      count."class2Count",
      count."class3Count",
      count."class4Count",
      count."linkedCount",
      count."preservationCount",
      count."deliveryDriverCount"
    ) IS DISTINCT FROM ROW(
      expected."oldClass1",
      expected."oldClass2",
      expected."oldClass3",
      expected."oldClass4",
      expected."oldLinked",
      expected."oldPreservation",
      expected."oldDriver"
    )
      OR count."checkedAt" IS NOT NULL
      OR count."checkedById" IS NOT NULL
  ) THEN
    RAISE EXCEPTION '3차 공급표 신규 보정 전 수량 또는 점검 상태가 예상값과 다릅니다.';
  END IF;

  SELECT COUNT(*)
  INTO iri_rows
  FROM "_lunch_box_third_iri_dates" AS expected
  JOIN "LunchBoxSchool" AS school
    ON school."name" = '이리초'
   AND school."type" = 'elementary'
   AND school."active"
  JOIN "LunchBoxCount" AS count
    ON count."schoolId" = school."id"
   AND count."date" = expected."date"
  WHERE ROW(
    count."class1Count",
    count."class2Count",
    count."class3Count",
    count."class4Count",
    count."linkedCount",
    count."preservationCount",
    count."deliveryDriverCount"
  ) IS NOT DISTINCT FROM ROW(22, 22, 19, 0, 20, 1, 0)
    AND count."checkedAt" IS NULL
    AND count."checkedById" IS NULL;

  IF iri_rows <> 20 THEN
    RAISE EXCEPTION '선행 이리초 보정 결과가 정확한 20행이 아닙니다: %', iri_rows;
  END IF;

  SELECT COALESCE(SUM(
    count."class1Count"
    + count."class2Count"
    + count."class3Count"
    + count."class4Count"
    + count."linkedCount"
    + count."preservationCount"
    + count."deliveryDriverCount"
  ), 0)
  INTO august_total
  FROM "LunchBoxCount" AS count
  WHERE count."date" BETWEEN DATE '2026-08-01' AND DATE '2026-08-31';

  IF august_total <> 14079 THEN
    RAISE EXCEPTION '3차 공급표 신규 보정 전 8월 총계가 14,079개가 아닙니다: %', august_total;
  END IF;
END $$;

DO $$
DECLARE
  affected_rows INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "LunchBoxSchool")
    AND NOT EXISTS (SELECT 1 FROM "LunchBoxCount") THEN
    RETURN;
  END IF;

  UPDATE "LunchBoxCount" AS count
  SET
    "class1Count" = expected."newClass1",
    "class2Count" = expected."newClass2",
    "class3Count" = expected."newClass3",
    "class4Count" = expected."newClass4",
    "linkedCount" = expected."newLinked",
    "preservationCount" = expected."newPreservation",
    "deliveryDriverCount" = expected."newDriver",
    "checkedAt" = NULL,
    "checkedById" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
  FROM "_lunch_box_third_target" AS expected,
       "LunchBoxSchool" AS school
  WHERE count."schoolId" = school."id"
    AND school."name" = expected."schoolName"
    AND school."type" = 'elementary'
    AND school."active"
    AND count."date" = expected."date"
    AND ROW(
      count."class1Count",
      count."class2Count",
      count."class3Count",
      count."class4Count",
      count."linkedCount",
      count."preservationCount",
      count."deliveryDriverCount"
    ) IS DISTINCT FROM ROW(
      expected."newClass1",
      expected."newClass2",
      expected."newClass3",
      expected."newClass4",
      expected."newLinked",
      expected."newPreservation",
      expected."newDriver"
    );

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows <> 33 THEN
    RAISE EXCEPTION '3차 공급표 신규 보정 행 수가 33개가 아닙니다: %', affected_rows;
  END IF;
END $$;

DO $$
DECLARE
  iri_rows INTEGER;
  august_total BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "LunchBoxSchool")
    AND NOT EXISTS (SELECT 1 FROM "LunchBoxCount") THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "_lunch_box_third_target" AS expected
    JOIN "LunchBoxSchool" AS school
      ON school."name" = expected."schoolName"
     AND school."type" = 'elementary'
     AND school."active"
    JOIN "LunchBoxCount" AS count
      ON count."schoolId" = school."id"
     AND count."date" = expected."date"
    WHERE ROW(
      count."class1Count",
      count."class2Count",
      count."class3Count",
      count."class4Count",
      count."linkedCount",
      count."preservationCount",
      count."deliveryDriverCount"
    ) IS DISTINCT FROM ROW(
      expected."newClass1",
      expected."newClass2",
      expected."newClass3",
      expected."newClass4",
      expected."newLinked",
      expected."newPreservation",
      expected."newDriver"
    )
      OR count."checkedAt" IS NOT NULL
      OR count."checkedById" IS NOT NULL
  ) THEN
    RAISE EXCEPTION '3차 공급표 신규 보정 후 대상 값이 문서와 다릅니다.';
  END IF;

  SELECT COUNT(*)
  INTO iri_rows
  FROM "_lunch_box_third_iri_dates" AS expected
  JOIN "LunchBoxSchool" AS school
    ON school."name" = '이리초'
   AND school."type" = 'elementary'
   AND school."active"
  JOIN "LunchBoxCount" AS count
    ON count."schoolId" = school."id"
   AND count."date" = expected."date"
  WHERE ROW(
    count."class1Count",
    count."class2Count",
    count."class3Count",
    count."class4Count",
    count."linkedCount",
    count."preservationCount",
    count."deliveryDriverCount"
  ) IS NOT DISTINCT FROM ROW(22, 22, 19, 0, 20, 1, 0)
    AND count."checkedAt" IS NULL
    AND count."checkedById" IS NULL;

  IF iri_rows <> 20 THEN
    RAISE EXCEPTION '3차 공급표 신규 보정 후 이리초 20행이 유지되지 않았습니다: %', iri_rows;
  END IF;

  SELECT COALESCE(SUM(
    count."class1Count"
    + count."class2Count"
    + count."class3Count"
    + count."class4Count"
    + count."linkedCount"
    + count."preservationCount"
    + count."deliveryDriverCount"
  ), 0)
  INTO august_total
  FROM "LunchBoxCount" AS count
  WHERE count."date" BETWEEN DATE '2026-08-01' AND DATE '2026-08-31';

  IF august_total <> 14033 THEN
    RAISE EXCEPTION '3차 공급표 보정 후 8월 총계가 문서의 14,033개가 아닙니다: %', august_total;
  END IF;

  IF EXISTS (
    WITH actual AS (
      SELECT
        count."date",
        SUM(
          count."class1Count"
          + count."class2Count"
          + count."class3Count"
          + count."class4Count"
          + count."linkedCount"
          + count."preservationCount"
          + count."deliveryDriverCount"
        ) AS total
      FROM "LunchBoxCount" AS count
      WHERE count."date" BETWEEN DATE '2026-08-03' AND DATE '2026-08-31'
      GROUP BY count."date"
    )
    SELECT 1
    FROM actual
    FULL JOIN "_lunch_box_third_daily_total" AS expected
      ON expected."date" = actual."date"
    WHERE COALESCE(actual.total, 0) IS DISTINCT FROM COALESCE(expected."total", 0)
  ) THEN
    RAISE EXCEPTION '3차 공급표 보정 후 일자별 총계가 문서와 다릅니다.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      (SELECT "id" FROM "_lunch_box_third_before"
       EXCEPT
       SELECT "id" FROM "LunchBoxCount")
      UNION ALL
      (SELECT "id" FROM "LunchBoxCount"
       EXCEPT
       SELECT "id" FROM "_lunch_box_third_before")
    ) AS changed_ids
  ) THEN
    RAISE EXCEPTION '3차 공급표 보정 중 도시락 행의 추가 또는 삭제가 감지되었습니다.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "LunchBoxCount" AS count
    JOIN "_lunch_box_third_before" AS before
      ON before."id" = count."id"
    JOIN "LunchBoxSchool" AS school
      ON school."id" = count."schoolId"
    LEFT JOIN "_lunch_box_third_target" AS expected
      ON expected."schoolName" = school."name"
     AND expected."date" = count."date"
    WHERE expected."schoolName" IS NULL
      AND to_jsonb(count) IS DISTINCT FROM to_jsonb(before)
  ) THEN
    RAISE EXCEPTION '3차 공급표 보정 범위 밖의 도시락 행이 변경되었습니다.';
  END IF;
END $$;

COMMIT;
