BEGIN;

-- Source:
-- 붙임3. 2026년 8월 아동 식단 4찬식(농산유통과).hwpx
-- Circled allergen numbers and standalone seasonal-food markers are omitted.
-- 2026-08-17 is a substitute holiday and intentionally has no menu row.
INSERT INTO "LunchBoxMenu" (
  "id",
  "date",
  "items",
  "createdAt",
  "updatedAt"
)
VALUES
  (
    'lunch-menu-2026-08-03',
    DATE '2026-08-03',
    ARRAY[
      '잡곡밥',
      '콩나물국',
      '오리주물럭',
      '메추리알장조림',
      '부추당근무침',
      '깍두기'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-04',
    DATE '2026-08-04',
    ARRAY[
      '현미밥',
      '무챗국',
      '떡갈비구이',
      '미트볼케첩볶음',
      '애호박나물',
      '배추김치'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-05',
    DATE '2026-08-05',
    ARRAY[
      '잡곡밥',
      '순두부버섯국',
      '치킨너겟',
      '열무된장나물',
      '김구이',
      '나박김치(깍두기)'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-06',
    DATE '2026-08-06',
    ARRAY[
      '백미밥',
      '닭살미역국',
      '두부양념조림',
      '미니새송이버섯볶음',
      '참나물무침',
      '백김치(배추김치)'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-07',
    DATE '2026-08-07',
    ARRAY[
      '현미밥',
      '미소장국',
      '어묵짜장볶음',
      '돈까스',
      '양배추샐러드',
      '무생채(깍두기)'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-10',
    DATE '2026-08-10',
    ARRAY[
      '잡곡밥',
      '들깨아욱국',
      '치킨가라아게',
      '두부구이',
      '치커리배무침',
      '볶음김치(배추김치)'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-11',
    DATE '2026-08-11',
    ARRAY[
      '백미밥',
      '떡만둣국',
      '부추참치전',
      '닭볶음탕',
      '미역줄기볶음',
      '총각김치(깍두기)'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-12',
    DATE '2026-08-12',
    ARRAY[
      '잡곡밥',
      '북어국',
      '돈육잡채',
      '(도토리)묵채소무침',
      '김구이',
      '배추김치'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-13',
    DATE '2026-08-13',
    ARRAY[
      '수수밥',
      '감자두부된장국',
      '(한우)쇠고기양배추볶음',
      '감자채볶음',
      '콩조림',
      '깍두기'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-14',
    DATE '2026-08-14',
    ARRAY[
      '백미밥',
      '미역국',
      '(콘치즈)떡갈비볶음',
      '메추리알조림',
      '고사리나물',
      '배추겉절이(배추김치)'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-18',
    DATE '2026-08-18',
    ARRAY[
      '기장밥',
      '어묵국',
      '두부스테이크&소스',
      '팝콘치킨조림',
      '시금치나물',
      '열무김치(배추김치)'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-19',
    DATE '2026-08-19',
    ARRAY[
      '잡곡밥',
      '청경채버섯맑은국',
      '닭볶음탕',
      '새우살양배추볶음',
      '콩나물무침',
      '무생채(깍두기)'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-20',
    DATE '2026-08-20',
    ARRAY[
      '차조밥',
      '근대된장국',
      '돈육조림',
      '비엔나소세지볶음',
      '가지나물',
      '배추김치'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-21',
    DATE '2026-08-21',
    ARRAY[
      '현미밥',
      '맑은오징엇국',
      '동그랑땡',
      '쑥갓사과무침',
      '건파래무침',
      '깍두기'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-24',
    DATE '2026-08-24',
    ARRAY[
      '잡곡밥',
      '콩나물국',
      '오징어볶음',
      '소시지피망볶음',
      '김구이',
      '백김치(배추김치)'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-25',
    DATE '2026-08-25',
    ARRAY[
      '백미밥',
      '미역국',
      '달걀찜',
      '애호박나물',
      '참외오이유자청무침',
      '깍두기'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-26',
    DATE '2026-08-26',
    ARRAY[
      '잡곡밥',
      '감자된장국',
      '돈수육',
      '오징어초무침',
      '채소쌈&쌈장',
      '배추김치'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-27',
    DATE '2026-08-27',
    ARRAY[
      '흑미밥',
      '시금치맑은국',
      '달걀말이',
      '브로콜리참치볶음',
      '오이소박이(깍두기)'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-28',
    DATE '2026-08-28',
    ARRAY[
      '현미밥',
      '달걀국',
      '새우튀김',
      '참나물깨소스무침',
      '김구이',
      '얼갈이김치(배추김치)'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'lunch-menu-2026-08-31',
    DATE '2026-08-31',
    ARRAY[
      '잡곡밥',
      '순두부국',
      '돈육조림',
      '치킨너겟',
      '양상추샐러드',
      '볶음김치(배추김치)'
    ]::TEXT[],
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("date") DO UPDATE
SET
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;
