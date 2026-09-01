ALTER TABLE "User"
ADD COLUMN "canViewYouthDetails" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canViewYouthContacts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canDownloadYouthDocuments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canManageYouth" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the access that existing active staff had before permissions were
-- split, and guarantee full youth access for every existing administrator.
UPDATE "User"
SET
  "canViewYouthDetails" = true,
  "canViewYouthContacts" = true,
  "canDownloadYouthDocuments" = true,
  "canManageYouth" = true
WHERE "status" = 'ACTIVE' OR "role" = 'ADMIN';
