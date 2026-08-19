BEGIN;

-- User-confirmed schedule change:
-- From 2026-08-24, Iri Elementary serves 23 meals for class 1 including
-- one preserved meal, 20 for class 2, 21 for class 3, and 19 for linked care.
-- The preserved meal is stored separately, so class 1 remains 22 with one
-- class-1 preservation meal. Only the six remaining August service dates are
-- changed.
--
-- The deployed database also contains an earlier class-3-only correction that
-- raised these dates from 19 to 22. Accept either complete, internally
-- consistent known history (19 in a fresh checkout or 22 in production) and
-- converge both histories on the user-confirmed values below.

LOCK TABLE "LunchBoxSchool" IN SHARE MODE;
LOCK TABLE "LunchBoxCount" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE "_lunch_box_iri_august_24_before"
ON COMMIT DROP
AS SELECT * FROM "LunchBoxCount";

CREATE TEMP TABLE "_lunch_box_iri_august_24_dates" (
  "date" DATE PRIMARY KEY,
  "localHistoryDailyTotal" BIGINT NOT NULL,
  "deployedHistoryDailyTotal" BIGINT NOT NULL,
  "newDailyTotal" BIGINT NOT NULL
) ON COMMIT DROP;

INSERT INTO "_lunch_box_iri_august_24_dates" (
  "date",
  "localHistoryDailyTotal",
  "deployedHistoryDailyTotal",
  "newDailyTotal"
)
VALUES
  (DATE '2026-08-24', 212, 215, 211),
  (DATE '2026-08-25', 125, 128, 124),
  (DATE '2026-08-26', 84, 87, 83),
  (DATE '2026-08-27', 84, 87, 83),
  (DATE '2026-08-28', 84, 87, 83),
  (DATE '2026-08-31', 84, 87, 83);

DO $$
DECLARE
  target_rows INTEGER;
  class3_variants INTEGER;
  baseline_class3 INTEGER;
  august_total BIGINT;
BEGIN
  IF (SELECT COUNT(*) FROM "_lunch_box_iri_august_24_dates") <> 6 THEN
    RAISE EXCEPTION '이리초 8월 24일 이후 보정 대상 날짜는 정확히 6일이어야 합니다.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "LunchBoxSchool"
    WHERE "name" = '이리초'
      AND "type" = 'elementary'
      AND "active"
  ) <> 1 THEN
    RAISE EXCEPTION '활성 이리초 학교 행이 정확히 1개여야 합니다.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "LunchBoxSchool"
    WHERE "name" = '이리초'
      AND "type" = 'elementary'
      AND "active"
      AND "preservationClass" IS DISTINCT FROM 1
  ) THEN
    RAISE EXCEPTION '이리초 보존식은 1반에 배정되어 있어야 합니다.';
  END IF;

  SELECT
    COUNT(*),
    COUNT(DISTINCT count."class3Count"),
    MIN(count."class3Count")
  INTO target_rows, class3_variants, baseline_class3
  FROM "_lunch_box_iri_august_24_dates" AS expected
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
    count."class4Count",
    count."linkedCount",
    count."preservationCount",
    count."deliveryDriverCount"
  ) IS NOT DISTINCT FROM ROW(22, 22, 0, 20, 1, 0)
    AND count."class3Count" IN (19, 22);

  IF target_rows <> 6 OR class3_variants <> 1 THEN
    RAISE EXCEPTION '이리초 보정 전 수량은 알려진 기준값 하나로 일치하는 6행이어야 합니다: 행 %, 3반 값 종류 %',
      target_rows, class3_variants;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "_lunch_box_iri_august_24_dates" AS expected
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(
        count."class1Count" + count."class2Count" + count."class3Count"
        + count."class4Count" + count."linkedCount"
        + count."preservationCount" + count."deliveryDriverCount"
      ), 0) AS total
      FROM "LunchBoxCount" AS count
      WHERE count."date" = expected."date"
    ) AS actual
    WHERE actual.total <> CASE baseline_class3
      WHEN 19 THEN expected."localHistoryDailyTotal"
      WHEN 22 THEN expected."deployedHistoryDailyTotal"
    END
  ) THEN
    RAISE EXCEPTION '이리초 보정 전 대상 날짜의 전체 일계가 예상값과 다릅니다.';
  END IF;

  SELECT COALESCE(SUM(
    count."class1Count" + count."class2Count" + count."class3Count"
    + count."class4Count" + count."linkedCount"
    + count."preservationCount" + count."deliveryDriverCount"
  ), 0)
  INTO august_total
  FROM "LunchBoxCount" AS count
  WHERE count."date" BETWEEN DATE '2026-08-01' AND DATE '2026-08-31';

  IF august_total <> (CASE baseline_class3
    WHEN 19 THEN 14030
    WHEN 22 THEN 14048
  END) THEN
    RAISE EXCEPTION '이리초 보정 전 8월 총계가 알려진 기준값과 다릅니다: %', august_total;
  END IF;
END $$;

DO $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE "LunchBoxCount" AS count
  SET
    "class1Count" = 22,
    "class2Count" = 20,
    "class3Count" = 21,
    "class4Count" = 0,
    "linkedCount" = 19,
    "preservationCount" = 1,
    "deliveryDriverCount" = 0,
    "checkedAt" = NULL,
    "checkedById" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
  FROM "LunchBoxSchool" AS school,
       "_lunch_box_iri_august_24_dates" AS expected
  WHERE count."schoolId" = school."id"
    AND school."name" = '이리초'
    AND school."type" = 'elementary'
    AND school."active"
    AND count."date" = expected."date";

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows <> 6 THEN
    RAISE EXCEPTION '이리초 8월 24일 이후 보정 행 수가 6개가 아닙니다: %', affected_rows;
  END IF;
END $$;

DO $$
DECLARE
  august_total BIGINT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "_lunch_box_iri_august_24_dates" AS expected
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
    ) IS DISTINCT FROM ROW(22, 20, 21, 0, 19, 1, 0)
      OR count."checkedAt" IS NOT NULL
      OR count."checkedById" IS NOT NULL
  ) THEN
    RAISE EXCEPTION '이리초 8월 24일 이후 보정값 또는 점검 상태가 예상과 다릅니다.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "_lunch_box_iri_august_24_dates" AS expected
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(
        count."class1Count" + count."class2Count" + count."class3Count"
        + count."class4Count" + count."linkedCount"
        + count."preservationCount" + count."deliveryDriverCount"
      ), 0) AS total
      FROM "LunchBoxCount" AS count
      WHERE count."date" = expected."date"
    ) AS actual
    WHERE actual.total <> expected."newDailyTotal"
  ) THEN
    RAISE EXCEPTION '이리초 보정 후 대상 날짜의 전체 일계가 예상값과 다릅니다.';
  END IF;

  SELECT COALESCE(SUM(
    count."class1Count" + count."class2Count" + count."class3Count"
    + count."class4Count" + count."linkedCount"
    + count."preservationCount" + count."deliveryDriverCount"
  ), 0)
  INTO august_total
  FROM "LunchBoxCount" AS count
  WHERE count."date" BETWEEN DATE '2026-08-01' AND DATE '2026-08-31';

  IF august_total <> 14024 THEN
    RAISE EXCEPTION '이리초 보정 후 8월 총계가 14,024개가 아닙니다: %', august_total;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      (SELECT "id" FROM "_lunch_box_iri_august_24_before"
       EXCEPT
       SELECT "id" FROM "LunchBoxCount")
      UNION ALL
      (SELECT "id" FROM "LunchBoxCount"
       EXCEPT
       SELECT "id" FROM "_lunch_box_iri_august_24_before")
    ) AS changed_ids
  ) THEN
    RAISE EXCEPTION '이리초 보정 중 도시락 행의 추가 또는 삭제가 감지되었습니다.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "LunchBoxCount" AS count
    JOIN "_lunch_box_iri_august_24_before" AS before
      ON before."id" = count."id"
    JOIN "LunchBoxSchool" AS school
      ON school."id" = count."schoolId"
    LEFT JOIN "_lunch_box_iri_august_24_dates" AS expected
      ON expected."date" = count."date"
     AND school."name" = '이리초'
     AND school."type" = 'elementary'
    WHERE expected."date" IS NULL
      AND to_jsonb(count) IS DISTINCT FROM to_jsonb(before)
  ) THEN
    RAISE EXCEPTION '이리초 8월 24일 이후 외 도시락 행이 변경되었습니다.';
  END IF;
END $$;

COMMIT;
