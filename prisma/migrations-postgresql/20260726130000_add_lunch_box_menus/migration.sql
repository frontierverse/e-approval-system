BEGIN;

CREATE TABLE "LunchBoxMenu" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "items" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LunchBoxMenu_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LunchBoxMenu_items_nonempty_check" CHECK (cardinality("items") > 0)
);

CREATE UNIQUE INDEX "LunchBoxMenu_date_key" ON "LunchBoxMenu"("date");

-- Keep Supabase anon/authenticated API roles away from direct table access.
ALTER TABLE "LunchBoxMenu" ENABLE ROW LEVEL SECURITY;

-- Source:
-- 2026년 7월 아동 식단 4찬식(추가).hwpx
-- Circled allergen numbers and standalone recipe markers are intentionally omitted.
INSERT INTO "LunchBoxMenu" (
  "id",
  "date",
  "items",
  "createdAt",
  "updatedAt"
)
VALUES
  (
    'lunch-menu-2026-07-27',
    DATE '2026-07-27',
    ARRAY[
      '잡곡밥',
      '감자된장국',
      '칠리새우볶음',
      '(병아리)콩조림',
      '숙주나물',
      '열무김치(배추김치)'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-07-28',
    DATE '2026-07-28',
    ARRAY[
      '차조밥',
      '어묵국',
      '토마토달걀볶음',
      '참치브로콜리무침',
      '양념깻잎지',
      '깍두기'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-07-29',
    DATE '2026-07-29',
    ARRAY[
      '잡곡밥',
      '콩나물국',
      '순살닭갈비',
      '너비아니구이',
      '호박나물',
      '배추김치'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-07-30',
    DATE '2026-07-30',
    ARRAY[
      '흰쌀밥',
      '미역국',
      '제육볶음',
      '비엔나소시지당근볶음',
      '감자채볶음',
      '나박김치(깍두기)'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-07-31',
    DATE '2026-07-31',
    ARRAY[
      '현미밥',
      '콩나물국',
      '떡갈비',
      '치커리참나물무침',
      '백김치(배추김치)'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

COMMIT;
