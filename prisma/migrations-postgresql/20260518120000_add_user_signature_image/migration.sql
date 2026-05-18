ALTER TABLE "User" ADD COLUMN "signatureImageStorageProvider" TEXT;
ALTER TABLE "User" ADD COLUMN "signatureImageStorageKey" TEXT;
ALTER TABLE "User" ADD COLUMN "signatureImageMimeType" TEXT;
ALTER TABLE "User" ADD COLUMN "signatureImageSize" INTEGER;
ALTER TABLE "User" ADD COLUMN "signatureImageUpdatedAt" TIMESTAMP(3);
