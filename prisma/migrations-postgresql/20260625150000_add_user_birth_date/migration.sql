ALTER TABLE "User" ADD COLUMN "birthDate" TEXT;

CREATE INDEX "User_birthDate_idx" ON "User"("birthDate");
