ALTER TABLE "Youth" ADD COLUMN "birthDate" TEXT;

CREATE INDEX "Youth_birthDate_idx" ON "Youth"("birthDate");
