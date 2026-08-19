BEGIN;

-- The 2026-08-24 Iri Elementary schedule correction changes the quantities
-- shown in the fixed school list. Its school-level preparation check predates
-- that correction, so clear only that derived state. Allow an already-cleared
-- row so a fresh database and a manually corrected deployment both converge
-- safely on the same result.

LOCK TABLE "LunchBoxSchool" IN SHARE MODE;
LOCK TABLE "LunchBoxCount" IN SHARE MODE;
LOCK TABLE "LunchBoxSchoolCheck" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE "_lunch_box_iri_school_check_target" (
  "schoolId" TEXT PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO "_lunch_box_iri_school_check_target" ("schoolId")
SELECT school."id"
FROM "LunchBoxSchool" AS school
WHERE school."name" = '이리초'
  AND school."type" = 'elementary'
  AND school."active";

CREATE TEMP TABLE "_lunch_box_iri_school_check_before"
ON COMMIT DROP
AS SELECT * FROM "LunchBoxSchoolCheck";

DO $$
DECLARE
  target_schools INTEGER;
  corrected_rows INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO target_schools
  FROM "_lunch_box_iri_school_check_target";

  IF target_schools <> 1 THEN
    RAISE EXCEPTION '활성 이리초 학교 행이 정확히 1개여야 합니다: %', target_schools;
  END IF;

  SELECT COUNT(*)
  INTO corrected_rows
  FROM "LunchBoxCount" AS count
  JOIN "_lunch_box_iri_school_check_target" AS target
    ON target."schoolId" = count."schoolId"
  WHERE count."date" IN (
      DATE '2026-08-24',
      DATE '2026-08-25',
      DATE '2026-08-26',
      DATE '2026-08-27',
      DATE '2026-08-28',
      DATE '2026-08-31'
    )
    AND ROW(
      count."class1Count",
      count."class2Count",
      count."class3Count",
      count."class4Count",
      count."linkedCount",
      count."preservationCount",
      count."deliveryDriverCount"
    ) IS NOT DISTINCT FROM ROW(22, 20, 21, 0, 19, 1, 0)
    AND count."checkedAt" IS NULL
    AND count."checkedById" IS NULL;

  IF corrected_rows <> 6 THEN
    RAISE EXCEPTION '이리초 전체 준비 체크 해제 전 수량과 날짜별 체크가 보정된 6개 행이어야 합니다: %', corrected_rows;
  END IF;
END $$;

CREATE TEMP TABLE "_lunch_box_iri_deleted_school_check"
ON COMMIT DROP
AS
WITH deleted AS (
  DELETE FROM "LunchBoxSchoolCheck" AS checkrow
  USING "_lunch_box_iri_school_check_target" AS target
  WHERE checkrow."schoolId" = target."schoolId"
  RETURNING checkrow.*
)
SELECT * FROM deleted;

DO $$
DECLARE
  deleted_rows INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO deleted_rows
  FROM "_lunch_box_iri_deleted_school_check";

  IF deleted_rows > 1 THEN
    RAISE EXCEPTION '이리초 전체 준비 체크 해제 행이 1개를 초과했습니다: %', deleted_rows;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "LunchBoxSchoolCheck" AS checkrow
    JOIN "_lunch_box_iri_school_check_target" AS target
      ON target."schoolId" = checkrow."schoolId"
  ) THEN
    RAISE EXCEPTION '이리초 전체 준비 체크가 해제되지 않았습니다.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM "LunchBoxSchoolCheck"
  ) <> (
    SELECT COUNT(*) - deleted_rows
    FROM "_lunch_box_iri_school_check_before"
  ) THEN
    RAISE EXCEPTION '이리초 전체 준비 체크 해제 중 예상하지 않은 행 수 변경이 감지되었습니다.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      (
        SELECT to_jsonb(before) AS row_data
        FROM "_lunch_box_iri_school_check_before" AS before
        WHERE NOT EXISTS (
          SELECT 1
          FROM "_lunch_box_iri_school_check_target" AS target
          WHERE target."schoolId" = before."schoolId"
        )
        EXCEPT
        SELECT to_jsonb(checkrow) AS row_data
        FROM "LunchBoxSchoolCheck" AS checkrow
        WHERE NOT EXISTS (
          SELECT 1
          FROM "_lunch_box_iri_school_check_target" AS target
          WHERE target."schoolId" = checkrow."schoolId"
        )
      )
      UNION ALL
      (
        SELECT to_jsonb(checkrow) AS row_data
        FROM "LunchBoxSchoolCheck" AS checkrow
        WHERE NOT EXISTS (
          SELECT 1
          FROM "_lunch_box_iri_school_check_target" AS target
          WHERE target."schoolId" = checkrow."schoolId"
        )
        EXCEPT
        SELECT to_jsonb(before) AS row_data
        FROM "_lunch_box_iri_school_check_before" AS before
        WHERE NOT EXISTS (
          SELECT 1
          FROM "_lunch_box_iri_school_check_target" AS target
          WHERE target."schoolId" = before."schoolId"
        )
      )
    ) AS unexpected_changes
  ) THEN
    RAISE EXCEPTION '이리초 외 전체 준비 체크가 변경되었습니다.';
  END IF;
END $$;

COMMIT;
