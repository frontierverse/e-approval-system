ALTER TABLE "User" ADD COLUMN "profileImageStorageProvider" TEXT;
ALTER TABLE "User" ADD COLUMN "profileImageStorageKey" TEXT;
ALTER TABLE "User" ADD COLUMN "profileImageMimeType" TEXT;
ALTER TABLE "User" ADD COLUMN "profileImageSize" INTEGER;
ALTER TABLE "User" ADD COLUMN "profileImageUpdatedAt" TIMESTAMP(3);
