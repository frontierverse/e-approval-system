ALTER TABLE "AttachmentPolicy" ALTER COLUMN "maxFileSizeMb" SET DEFAULT 30;

UPDATE "AttachmentPolicy"
SET
  "maxFileSizeMb" = 30,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default';
