ALTER TABLE "AttachmentPolicy" ALTER COLUMN "maxFileCount" SET DEFAULT 10;
ALTER TABLE "AttachmentPolicy" ALTER COLUMN "maxFileSizeMb" SET DEFAULT 15;

UPDATE "AttachmentPolicy"
SET
  "maxFileCount" = 10,
  "maxFileSizeMb" = 15,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default';
