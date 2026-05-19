ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PROXY_APPROVE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PROXY_REJECT';

ALTER TABLE "ApprovalStep"
  ADD COLUMN "actedById" TEXT,
  ADD COLUMN "proxyApprovedById" TEXT,
  ADD COLUMN "decisionType" TEXT NOT NULL DEFAULT 'NORMAL';

UPDATE "ApprovalStep"
SET "actedById" = "approverId"
WHERE "actedAt" IS NOT NULL
  AND "actedById" IS NULL;

ALTER TABLE "ApprovalStep"
  ADD CONSTRAINT "ApprovalStep_actedById_fkey"
  FOREIGN KEY ("actedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApprovalStep"
  ADD CONSTRAINT "ApprovalStep_proxyApprovedById_fkey"
  FOREIGN KEY ("proxyApprovedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ApprovalStep_actedById_idx" ON "ApprovalStep"("actedById");
CREATE INDEX "ApprovalStep_proxyApprovedById_idx" ON "ApprovalStep"("proxyApprovedById");
