ALTER TYPE "DocumentStatus" ADD VALUE 'DISCARDED';

ALTER TYPE "AuditAction" ADD VALUE 'DISCARD_DOCUMENT';
ALTER TYPE "AuditAction" ADD VALUE 'RESTORE_DOCUMENT';

ALTER TABLE "ApprovalDocument" ADD COLUMN "discardedAt" TIMESTAMP(3);

CREATE INDEX "ApprovalDocument_discardedAt_idx" ON "ApprovalDocument"("discardedAt");
