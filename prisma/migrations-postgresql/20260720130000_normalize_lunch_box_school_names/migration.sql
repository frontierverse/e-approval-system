BEGIN;

DO $$
BEGIN
  IF EXISTS (
    WITH renamed AS (
      SELECT
        "id",
        regexp_replace("name", '^(이리|익산)', '') AS "nextName"
      FROM "LunchBoxSchool"
      WHERE ("name" LIKE '이리%' OR "name" LIKE '익산%')
        AND "name" NOT IN ('이리초', '익산초')
    )
    SELECT 1
    FROM renamed
    JOIN "LunchBoxSchool" AS existing
      ON existing."name" = renamed."nextName"
      AND existing."id" <> renamed."id"
  ) THEN
    RAISE EXCEPTION '학교명에서 이리/익산 접두어를 제거하면 중복 이름이 발생합니다.';
  END IF;
END $$;

UPDATE "LunchBoxSchool"
SET
  "name" = regexp_replace("name", '^(이리|익산)', ''),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE ("name" LIKE '이리%' OR "name" LIKE '익산%')
  AND "name" NOT IN ('이리초', '익산초');

COMMIT;
