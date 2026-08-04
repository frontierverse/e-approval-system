BEGIN;

-- User-confirmed schedule exception:
-- 백제초 병설유치원 has a field trip on 2026-08-07, so no lunch boxes
-- are supplied on that date. Keep the row for schedule history, but zero its
-- quantities so it is omitted from the date-specific school list and PDFs.

LOCK TABLE "LunchBoxSchool" IN SHARE MODE;
LOCK TABLE "LunchBoxCount" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE "_lunch_box_baekje_kindergarten_before"
ON COMMIT DROP
AS SELECT * FROM "LunchBoxCount";

DO $$
DECLARE
  target_rows INTEGER;
  august_total BIGINT;
  daily_total BIGINT;
BEGIN
  IF (
    SELECT COUNT(*)
    FROM "LunchBoxSchool"
    WHERE "name" = '백제초 병설유치원'
      AND "type" = 'kindergarten'
      AND "active"
  ) <> 1 THEN
    RAISE EXCEPTION '활성 백제초 병설유치원 행이 정확히 1개여야 합니다.';
  END IF;

  SELECT COUNT(*)
  INTO target_rows
  FROM "LunchBoxCount" AS count
  JOIN "LunchBoxSchool" AS school
    ON school."id" = count."schoolId"
  WHERE school."name" = '백제초 병설유치원'
    AND school."type" = 'kindergarten'
    AND school."active"
    AND count."date" = DATE '2026-08-07'
    AND ROW(
      count."class1Count",
      count."class2Count",
      count."class3Count",
      count."class4Count",
      count."linkedCount",
      count."preservationCount",
      count."deliveryDriverCount"
    ) IS NOT DISTINCT FROM ROW(3, 0, 0, 0, 0, 0, 0);

  IF target_rows <> 1 THEN
    RAISE EXCEPTION '백제초 병설유치원 8월 7일 보정 전 수량이 3개인 정확한 1행이어야 합니다: %', target_rows;
  END IF;

  SELECT COALESCE(SUM(
    count."class1Count" + count."class2Count" + count."class3Count"
    + count."class4Count" + count."linkedCount"
    + count."preservationCount" + count."deliveryDriverCount"
  ), 0)
  INTO daily_total
  FROM "LunchBoxCount" AS count
  WHERE count."date" = DATE '2026-08-07';

  IF daily_total <> 1144 THEN
    RAISE EXCEPTION '보정 전 8월 7일 총계가 1,144개가 아닙니다: %', daily_total;
  END IF;

  SELECT COALESCE(SUM(
    count."class1Count" + count."class2Count" + count."class3Count"
    + count."class4Count" + count."linkedCount"
    + count."preservationCount" + count."deliveryDriverCount"
  ), 0)
  INTO august_total
  FROM "LunchBoxCount" AS count
  WHERE count."date" BETWEEN DATE '2026-08-01' AND DATE '2026-08-31';

  IF august_total <> 14033 THEN
    RAISE EXCEPTION '보정 전 8월 총계가 14,033개가 아닙니다: %', august_total;
  END IF;
END $$;

DO $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE "LunchBoxCount" AS count
  SET
    "class1Count" = 0,
    "class2Count" = 0,
    "class3Count" = 0,
    "class4Count" = 0,
    "linkedCount" = 0,
    "preservationCount" = 0,
    "deliveryDriverCount" = 0,
    "checkedAt" = NULL,
    "checkedById" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
  FROM "LunchBoxSchool" AS school
  WHERE count."schoolId" = school."id"
    AND school."name" = '백제초 병설유치원'
    AND school."type" = 'kindergarten'
    AND school."active"
    AND count."date" = DATE '2026-08-07';

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows <> 1 THEN
    RAISE EXCEPTION '백제초 병설유치원 8월 7일 보정 행 수가 1개가 아닙니다: %', affected_rows;
  END IF;
END $$;

DO $$
DECLARE
  august_total BIGINT;
  daily_total BIGINT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "LunchBoxCount" AS count
    JOIN "LunchBoxSchool" AS school
      ON school."id" = count."schoolId"
    WHERE school."name" = '백제초 병설유치원'
      AND school."type" = 'kindergarten'
      AND school."active"
      AND count."date" = DATE '2026-08-07'
      AND (
        ROW(
          count."class1Count",
          count."class2Count",
          count."class3Count",
          count."class4Count",
          count."linkedCount",
          count."preservationCount",
          count."deliveryDriverCount"
        ) IS DISTINCT FROM ROW(0, 0, 0, 0, 0, 0, 0)
        OR count."checkedAt" IS NOT NULL
        OR count."checkedById" IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION '백제초 병설유치원 8월 7일 보정 후 값이 0이 아닙니다.';
  END IF;

  SELECT COALESCE(SUM(
    count."class1Count" + count."class2Count" + count."class3Count"
    + count."class4Count" + count."linkedCount"
    + count."preservationCount" + count."deliveryDriverCount"
  ), 0)
  INTO daily_total
  FROM "LunchBoxCount" AS count
  WHERE count."date" = DATE '2026-08-07';

  IF daily_total <> 1141 THEN
    RAISE EXCEPTION '보정 후 8월 7일 총계가 1,141개가 아닙니다: %', daily_total;
  END IF;

  SELECT COALESCE(SUM(
    count."class1Count" + count."class2Count" + count."class3Count"
    + count."class4Count" + count."linkedCount"
    + count."preservationCount" + count."deliveryDriverCount"
  ), 0)
  INTO august_total
  FROM "LunchBoxCount" AS count
  WHERE count."date" BETWEEN DATE '2026-08-01' AND DATE '2026-08-31';

  IF august_total <> 14030 THEN
    RAISE EXCEPTION '보정 후 8월 총계가 14,030개가 아닙니다: %', august_total;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      (SELECT "id" FROM "_lunch_box_baekje_kindergarten_before"
       EXCEPT
       SELECT "id" FROM "LunchBoxCount")
      UNION ALL
      (SELECT "id" FROM "LunchBoxCount"
       EXCEPT
       SELECT "id" FROM "_lunch_box_baekje_kindergarten_before")
    ) AS changed_ids
  ) THEN
    RAISE EXCEPTION '보정 중 도시락 행의 추가 또는 삭제가 감지되었습니다.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "LunchBoxCount" AS count
    JOIN "_lunch_box_baekje_kindergarten_before" AS before
      ON before."id" = count."id"
    JOIN "LunchBoxSchool" AS school
      ON school."id" = count."schoolId"
    WHERE NOT (
      school."name" = '백제초 병설유치원'
      AND school."type" = 'kindergarten'
      AND count."date" = DATE '2026-08-07'
    )
      AND to_jsonb(count) IS DISTINCT FROM to_jsonb(before)
  ) THEN
    RAISE EXCEPTION '백제초 병설유치원 8월 7일 외 도시락 행이 변경되었습니다.';
  END IF;
END $$;

COMMIT;
