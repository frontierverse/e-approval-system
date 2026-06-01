ALTER TABLE "Youth" ADD COLUMN "familyRelationship" TEXT;
ALTER TABLE "Youth" ADD COLUMN "familyPhone" TEXT;

UPDATE "Youth"
SET "familyPhone" = "familyContact"
WHERE "familyPhone" IS NULL
  AND "familyContact" IS NOT NULL
  AND "familyContact" <> '';
