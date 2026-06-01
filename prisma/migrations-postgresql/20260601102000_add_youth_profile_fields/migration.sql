ALTER TABLE "Youth" ADD COLUMN "admissionDate" TEXT;
ALTER TABLE "Youth" ADD COLUMN "dischargeDate" TEXT;
ALTER TABLE "Youth" ADD COLUMN "age" INTEGER;
ALTER TABLE "Youth" ADD COLUMN "phone" TEXT;
ALTER TABLE "Youth" ADD COLUMN "familyContact" TEXT;

CREATE INDEX "Youth_dischargeDate_idx" ON "Youth"("dischargeDate");
