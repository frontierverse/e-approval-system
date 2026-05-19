ALTER TABLE "ResourcePost"
  ALTER COLUMN "category" SET DEFAULT 'bajaul';

UPDATE "ResourcePost"
SET "category" = 'bajaul'
WHERE "category" NOT IN ('corporation', 'cafe', 'bajaul');
