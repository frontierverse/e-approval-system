ALTER TYPE "AuditAction" ADD VALUE 'EXTEND_YOUTH_DISCHARGE';

ALTER TABLE "Youth"
ADD COLUMN "initialDischargeDate" TEXT;

UPDATE "Youth"
SET "initialDischargeDate" = "dischargeDate"
WHERE "initialDischargeDate" IS NULL;

CREATE TABLE "YouthDischargeExtension" (
  "id" TEXT NOT NULL,
  "extensionOrder" INTEGER NOT NULL,
  "previousDischargeDate" TEXT NOT NULL,
  "extendedDischargeDate" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "youthId" TEXT NOT NULL,
  "processedById" TEXT NOT NULL,

  CONSTRAINT "YouthDischargeExtension_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "YouthDischargeExtension_youthId_extensionOrder_key"
ON "YouthDischargeExtension"("youthId", "extensionOrder");

CREATE INDEX "YouthDischargeExtension_youthId_idx"
ON "YouthDischargeExtension"("youthId");

CREATE INDEX "YouthDischargeExtension_processedById_idx"
ON "YouthDischargeExtension"("processedById");

CREATE INDEX "YouthDischargeExtension_extendedDischargeDate_idx"
ON "YouthDischargeExtension"("extendedDischargeDate");

CREATE INDEX "YouthDischargeExtension_processedAt_idx"
ON "YouthDischargeExtension"("processedAt");

CREATE INDEX "Youth_initialDischargeDate_idx"
ON "Youth"("initialDischargeDate");

ALTER TABLE "YouthDischargeExtension"
ADD CONSTRAINT "YouthDischargeExtension_youthId_fkey"
FOREIGN KEY ("youthId") REFERENCES "Youth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "YouthDischargeExtension"
ADD CONSTRAINT "YouthDischargeExtension_processedById_fkey"
FOREIGN KEY ("processedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
