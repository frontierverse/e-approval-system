BEGIN;

-- Source:
-- ★(취합)2026년 사회적 경제 연계형 통합 돌봄 지원사업(건강도시락)
-- 일자별 공급표(병설유치원 포함)(3차 260803).xlsx
--
-- Iri Elementary serves 20 linked-care meals on the 20 explicit August
-- service dates below. Locks and assertions keep this correction scoped to
-- the source rows and abort the whole transaction if production has drifted.

LOCK TABLE "LunchBoxSchool" IN SHARE MODE;
LOCK TABLE "LunchBoxCount" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE "_lunch_box_iri_before"
ON COMMIT DROP
AS SELECT * FROM "LunchBoxCount";

CREATE TEMP TABLE "_lunch_box_iri_dates" (
  "date" DATE PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO "_lunch_box_iri_dates" ("date")
VALUES
  (DATE '2026-08-03'),
  (DATE '2026-08-04'),
  (DATE '2026-08-05'),
  (DATE '2026-08-06'),
  (DATE '2026-08-07'),
  (DATE '2026-08-10'),
  (DATE '2026-08-11'),
  (DATE '2026-08-12'),
  (DATE '2026-08-13'),
  (DATE '2026-08-14'),
  (DATE '2026-08-18'),
  (DATE '2026-08-19'),
  (DATE '2026-08-20'),
  (DATE '2026-08-21'),
  (DATE '2026-08-24'),
  (DATE '2026-08-25'),
  (DATE '2026-08-26'),
  (DATE '2026-08-27'),
  (DATE '2026-08-28'),
  (DATE '2026-08-31');

DO $$
DECLARE
  target_rows INTEGER;
  august_total BIGINT;
BEGIN
  IF (SELECT COUNT(*) FROM "_lunch_box_iri_dates") <> 20 THEN
    RAISE EXCEPTION '이리초 보정 대상 날짜는 정확히 20일이어야 합니다.';
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

  SELECT COUNT(*)
  INTO target_rows
  FROM "_lunch_box_iri_dates" AS expected
  JOIN "LunchBoxSchool" AS school
    ON school."name" = '이리초'
   AND school."type" = 'elementary'
   AND school."active"
  JOIN "LunchBoxCount" AS count
    ON count."schoolId" = school."id"
   AND count."date" = expected."date";

  IF target_rows <> 20 THEN
    RAISE EXCEPTION '이리초 보정 대상 DB 행은 정확히 20개여야 합니다: %', target_rows;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "_lunch_box_iri_dates" AS expected
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
    ) IS DISTINCT FROM ROW(22, 22, 19, 0, 21, 1, 0)
      OR count."checkedAt" IS NOT NULL
      OR count."checkedById" IS NOT NULL
  ) THEN
    RAISE EXCEPTION '이리초 보정 전 수량 또는 점검 상태가 예상값과 다릅니다.';
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

  IF august_total <> 14099 THEN
    RAISE EXCEPTION '이리초 보정 전 8월 총계가 14,099개가 아닙니다: %', august_total;
  END IF;
END $$;

DO $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE "LunchBoxCount" AS count
  SET
    "linkedCount" = 20,
    "checkedAt" = NULL,
    "checkedById" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
  FROM "LunchBoxSchool" AS school,
       "_lunch_box_iri_dates" AS expected
  WHERE count."schoolId" = school."id"
    AND school."name" = '이리초'
    AND school."type" = 'elementary'
    AND school."active"
    AND count."date" = expected."date"
    AND count."linkedCount" IS DISTINCT FROM 20;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows <> 20 THEN
    RAISE EXCEPTION '이리초 보정 행 수가 20개가 아닙니다: %', affected_rows;
  END IF;
END $$;

DO $$
DECLARE
  august_total BIGINT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "_lunch_box_iri_dates" AS expected
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
    ) IS DISTINCT FROM ROW(22, 22, 19, 0, 20, 1, 0)
      OR count."checkedAt" IS NOT NULL
      OR count."checkedById" IS NOT NULL
  ) THEN
    RAISE EXCEPTION '이리초 보정 후 값이 3차 공급표와 다릅니다.';
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
    RAISE EXCEPTION '이리초 보정 후 8월 총계가 14,079개가 아닙니다: %', august_total;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      (SELECT "id" FROM "_lunch_box_iri_before"
       EXCEPT
       SELECT "id" FROM "LunchBoxCount")
      UNION ALL
      (SELECT "id" FROM "LunchBoxCount"
       EXCEPT
       SELECT "id" FROM "_lunch_box_iri_before")
    ) AS changed_ids
  ) THEN
    RAISE EXCEPTION '이리초 보정 중 도시락 행의 추가 또는 삭제가 감지되었습니다.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "LunchBoxCount" AS count
    JOIN "_lunch_box_iri_before" AS before
      ON before."id" = count."id"
    JOIN "LunchBoxSchool" AS school
      ON school."id" = count."schoolId"
    LEFT JOIN "_lunch_box_iri_dates" AS expected
      ON expected."date" = count."date"
     AND school."name" = '이리초'
     AND school."type" = 'elementary'
    WHERE expected."date" IS NULL
      AND to_jsonb(count) IS DISTINCT FROM to_jsonb(before)
  ) THEN
    RAISE EXCEPTION '이리초 보정 범위 밖의 도시락 행이 변경되었습니다.';
  END IF;
END $$;

COMMIT;
