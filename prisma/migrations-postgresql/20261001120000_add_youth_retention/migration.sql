ALTER TABLE "Youth"
  ADD COLUMN "actualDischargeDate" TEXT,
  ADD COLUMN "caseClosedDate" TEXT,
  ADD COLUMN "retentionUntil" TEXT,
  ADD COLUMN "retentionBasis" TEXT,
  ADD COLUMN "retentionHoldReason" TEXT,
  ADD COLUMN "retentionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "purgeStartedAt" TIMESTAMP(3),
  ADD COLUMN "purgeLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "purgedAt" TIMESTAMP(3);

CREATE INDEX "Youth_actualDischargeDate_retentionUntil_idx" ON "Youth"("actualDischargeDate", "retentionUntil");
CREATE INDEX "Youth_purgedAt_idx" ON "Youth"("purgedAt");
-- Existing expected discharge dates do not establish actual discharge or case closure.
-- No existing data is deleted and no retention clock is started by this migration.
