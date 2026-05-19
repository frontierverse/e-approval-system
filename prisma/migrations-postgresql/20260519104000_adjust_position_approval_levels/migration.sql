UPDATE "Position"
SET "level" = 4,
    "sortOrder" = 4
WHERE "id" = 'pos-director'
   OR "name" = '이사';

UPDATE "Position"
SET "level" = 5,
    "sortOrder" = 5
WHERE "id" = 'pos-facility-head'
   OR "name" = '시설장';
