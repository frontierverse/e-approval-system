-- AlterTable
ALTER TABLE "Youth" ADD COLUMN     "purgeBlockedReason" TEXT,
ADD COLUMN     "purgeLastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "purgeNextCheckAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "YouthMutationReceipt" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "youthId" TEXT,
    "payloadHash" TEXT,
    "committedUpdatedAt" TIMESTAMP(3),
    "committedTargetsJson" JSONB,
    "state" TEXT NOT NULL DEFAULT 'committed',
    "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scrubbedAt" TIMESTAMP(3),

    CONSTRAINT "YouthMutationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YouthViewRequest" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "youthId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3),
    "documentId" TEXT,
    "requestHash" TEXT,
    "sourceFileUpdatedAt" TIMESTAMP(3),
    "auditLogId" TEXT,
    "auditedAt" TIMESTAMP(3),
    "disclosureUntil" TIMESTAMP(3),
    "state" TEXT NOT NULL DEFAULT 'recorded',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scrubbedAt" TIMESTAMP(3),

    CONSTRAINT "YouthViewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YouthDecisionUpload" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "startRequestId" TEXT NOT NULL,
    "startPayloadHash" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'youth-decision',
    "sourceKind" TEXT NOT NULL DEFAULT 'client-file',
    "targetYouthId" TEXT,
    "originalName" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "expectedSha256" TEXT,
    "storageProvider" TEXT NOT NULL,
    "stagingKey" TEXT,
    "finalKey" TEXT,
    "state" TEXT NOT NULL DEFAULT 'uploading',
    "plaintextSha256" TEXT,
    "storedSha256" TEXT,
    "storedSize" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "lastGrantExpiresAt" TIMESTAMP(3),
    "finalizeClaimId" TEXT,
    "finalizeLeaseUntil" TIMESTAMP(3),
    "finalizeIv" TEXT,
    "finalizeWriteEvidence" TEXT,
    "hadUnknownWrite" BOOLEAN NOT NULL DEFAULT false,
    "consumedYouthId" TEXT,
    "consumedMutationId" TEXT,
    "consumedDocumentId" TEXT,
    "sourceDocumentId" TEXT,
    "sourceFileUpdatedAt" TIMESTAMP(3),
    "sourceStorageProvider" TEXT,
    "sourceStorageKey" TEXT,
    "sourceYouthUpdatedAt" TIMESTAMP(3),
    "sourceCleanupId" TEXT,
    "terminalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scrubbedAt" TIMESTAMP(3),

    CONSTRAINT "YouthDecisionUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YouthDecisionFileCleanup" (
    "id" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "objectKind" TEXT NOT NULL,
    "sourceUploadId" TEXT,
    "sourceMutationId" TEXT,
    "youthId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "notBefore" TIMESTAMP(3) NOT NULL,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,
    "claimId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YouthDecisionFileCleanup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "YouthMutationReceipt_youthId_state_idx" ON "YouthMutationReceipt"("youthId", "state");

-- CreateIndex
CREATE INDEX "YouthMutationReceipt_targetType_targetId_idx" ON "YouthMutationReceipt"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "YouthMutationReceipt_actorId_requestId_key" ON "YouthMutationReceipt"("actorId", "requestId");

-- CreateIndex
CREATE INDEX "YouthViewRequest_youthId_state_idx" ON "YouthViewRequest"("youthId", "state");

-- CreateIndex
CREATE INDEX "YouthViewRequest_actorId_youthId_kind_createdAt_idx" ON "YouthViewRequest"("actorId", "youthId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "YouthViewRequest_actorId_requestId_key" ON "YouthViewRequest"("actorId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "YouthDecisionUpload_stagingKey_key" ON "YouthDecisionUpload"("stagingKey");

-- CreateIndex
CREATE UNIQUE INDEX "YouthDecisionUpload_finalKey_key" ON "YouthDecisionUpload"("finalKey");

-- CreateIndex
CREATE INDEX "YouthDecisionUpload_state_expiresAt_idx" ON "YouthDecisionUpload"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "YouthDecisionUpload_state_finalizeLeaseUntil_idx" ON "YouthDecisionUpload"("state", "finalizeLeaseUntil");

-- CreateIndex
CREATE INDEX "YouthDecisionUpload_targetYouthId_state_idx" ON "YouthDecisionUpload"("targetYouthId", "state");

-- CreateIndex
CREATE INDEX "YouthDecisionUpload_consumedYouthId_state_idx" ON "YouthDecisionUpload"("consumedYouthId", "state");

-- CreateIndex
CREATE INDEX "YouthDecisionUpload_consumedDocumentId_idx" ON "YouthDecisionUpload"("consumedDocumentId");

-- CreateIndex
CREATE INDEX "YouthDecisionUpload_sourceDocumentId_idx" ON "YouthDecisionUpload"("sourceDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "YouthDecisionUpload_actorId_startRequestId_key" ON "YouthDecisionUpload"("actorId", "startRequestId");

-- CreateIndex
CREATE INDEX "YouthDecisionFileCleanup_state_nextAttemptAt_idx" ON "YouthDecisionFileCleanup"("state", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "YouthDecisionFileCleanup_state_leaseUntil_idx" ON "YouthDecisionFileCleanup"("state", "leaseUntil");

-- CreateIndex
CREATE INDEX "YouthDecisionFileCleanup_sourceUploadId_state_idx" ON "YouthDecisionFileCleanup"("sourceUploadId", "state");

-- CreateIndex
CREATE INDEX "YouthDecisionFileCleanup_youthId_state_idx" ON "YouthDecisionFileCleanup"("youthId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "YouthDecisionFileCleanup_storageProvider_storageKey_key" ON "YouthDecisionFileCleanup"("storageProvider", "storageKey");

-- CreateIndex
CREATE INDEX "Youth_purgeStartedAt_purgeNextCheckAt_idx" ON "Youth"("purgeStartedAt", "purgeNextCheckAt");

-- Server-only purpose ledgers survive staff/parent deletion as opaque replay tombstones.
-- No actor/parent FK may cascade away a committed request.
ALTER TABLE "YouthMutationReceipt" ADD CONSTRAINT "YouthMutationReceipt_valid" CHECK (
  "requestId" ~ '^[A-Za-z0-9_-]{8,128}$'
  AND "operation" IN ('profile.create','profile.patch','profile.extend','personal.create','personal.update','personal.delete','common.batch','concept.create','concept.delete','concept.check','rule.create','rule.delete','document.attach','document.delete')
  AND "state" IN ('committed','purged')
  AND (("state" = 'committed' AND "payloadHash" IS NOT NULL AND "payloadHash" ~ '^[a-f0-9]{64}$' AND "scrubbedAt" IS NULL)
    OR ("state" = 'purged' AND "payloadHash" IS NULL AND "committedUpdatedAt" IS NULL AND "committedTargetsJson" IS NULL AND "scrubbedAt" IS NOT NULL))
  AND ("committedTargetsJson" IS NULL
    OR ("operation" = 'common.batch' AND jsonb_typeof("committedTargetsJson") = 'array')
    OR ("operation" = 'profile.extend' AND jsonb_typeof("committedTargetsJson") = 'object'
      AND "committedTargetsJson" ? 'extensionId'
      AND "committedTargetsJson" - 'extensionId' = '{}'::jsonb
      AND jsonb_typeof("committedTargetsJson" -> 'extensionId') = 'string'
      AND "committedTargetsJson" ->> 'extensionId' ~ '^[A-Za-z0-9_-]{1,128}$'))
);
ALTER TABLE "YouthViewRequest" ADD CONSTRAINT "YouthViewRequest_valid" CHECK (
  "requestId" ~ '^[A-Za-z0-9_-]{8,128}$'
  AND "kind" IN ('details','contacts','decision-download')
  AND "state" IN ('recorded','purged')
  AND ("requestHash" IS NULL OR "requestHash" ~ '^[a-f0-9]{64}$')
  AND (("state" = 'recorded' AND "sourceUpdatedAt" IS NOT NULL AND "auditLogId" IS NOT NULL AND "auditedAt" IS NOT NULL AND "disclosureUntil" IS NOT NULL AND "scrubbedAt" IS NULL)
    OR ("state" = 'purged' AND "sourceUpdatedAt" IS NULL AND "requestHash" IS NULL AND "sourceFileUpdatedAt" IS NULL AND "auditLogId" IS NULL AND "auditedAt" IS NULL AND "disclosureUntil" IS NULL AND "scrubbedAt" IS NOT NULL))
  AND ("state" = 'purged' OR "kind" <> 'decision-download' OR ("documentId" IS NOT NULL AND "requestHash" IS NOT NULL AND "sourceFileUpdatedAt" IS NOT NULL))
);
ALTER TABLE "YouthDecisionUpload" ADD CONSTRAINT "YouthDecisionUpload_valid" CHECK (
  "purpose" = 'youth-decision'
  AND "sourceKind" IN ('client-file','legacy-reencrypt')
  AND "startRequestId" ~ '^[A-Za-z0-9_-]{8,128}$'
  AND "state" IN ('uploading','finalizing','ready','consumed','deleting','deleted','expired','purged')
  AND "storageProvider" IN ('local','supabase-storage','vercel-blob')
  AND ("startPayloadHash" IS NULL OR "startPayloadHash" ~ '^[a-f0-9]{64}$')
  AND ("expectedSha256" IS NULL OR "expectedSha256" ~ '^[a-f0-9]{64}$')
  AND ("plaintextSha256" IS NULL OR "plaintextSha256" ~ '^[a-f0-9]{64}$')
  AND ("storedSha256" IS NULL OR "storedSha256" ~ '^[a-f0-9]{64}$')
  AND ("size" IS NULL OR "size" BETWEEN 1 AND 31457280)
  AND ("storedSize" IS NULL OR "storedSize" BETWEEN 1 AND 31457312)
  AND ("finalizeIv" IS NULL OR "finalizeIv" ~ '^[A-Za-z0-9+/]{16}$')
  AND ("finalizeWriteEvidence" IS NULL OR "finalizeWriteEvidence" IN ('pending','confirmed','unknown'))
  AND (("finalizeClaimId" IS NULL AND "finalizeLeaseUntil" IS NULL) OR ("finalizeClaimId" IS NOT NULL AND "finalizeLeaseUntil" IS NOT NULL))
  AND ("state" NOT IN ('uploading','finalizing','ready','consumed') OR ("startPayloadHash" IS NOT NULL AND "originalName" IS NOT NULL AND "mimeType" IS NOT NULL AND "size" IS NOT NULL AND "expectedSha256" IS NOT NULL))
  AND ("state" NOT IN ('ready','consumed') OR ("finalKey" IS NOT NULL AND "completedAt" IS NOT NULL AND "plaintextSha256" IS NOT NULL AND "plaintextSha256" = "expectedSha256" AND "storedSha256" IS NOT NULL AND "storedSize" IS NOT NULL AND "storedSize" IN ("size", "size" + 32) AND "finalizeWriteEvidence" IS NOT NULL AND "finalizeWriteEvidence" = 'confirmed'))
  AND ("state" <> 'consumed' OR ("consumedYouthId" IS NOT NULL AND "consumedMutationId" IS NOT NULL AND "consumedDocumentId" IS NOT NULL))
  AND ("sourceKind" <> 'legacy-reencrypt' OR "state" IN ('deleting','deleted','expired','purged') OR ("sourceDocumentId" IS NOT NULL AND "sourceFileUpdatedAt" IS NOT NULL AND "sourceStorageProvider" IS NOT NULL AND "sourceStorageKey" IS NOT NULL AND "sourceYouthUpdatedAt" IS NOT NULL))
  AND ("state" <> 'purged' OR ("originalName" IS NULL AND "mimeType" IS NULL AND "size" IS NULL AND "startPayloadHash" IS NULL AND "expectedSha256" IS NULL AND "plaintextSha256" IS NULL AND "storedSha256" IS NULL AND "storedSize" IS NULL AND "finalizeIv" IS NULL AND "sourceFileUpdatedAt" IS NULL AND "sourceYouthUpdatedAt" IS NULL AND "sourceStorageProvider" IS NULL AND "sourceStorageKey" IS NULL AND "scrubbedAt" IS NOT NULL))
);
ALTER TABLE "YouthDecisionFileCleanup" ADD CONSTRAINT "YouthDecisionFileCleanup_valid" CHECK (
  "storageProvider" IN ('local','supabase-storage','vercel-blob')
  AND "objectKind" IN ('staging','final','legacy')
  AND "state" IN ('pending','running','done')
  AND "attemptCount" >= 0
  AND ("sourceUploadId" IS NOT NULL OR "sourceMutationId" IS NOT NULL OR "youthId" IS NOT NULL)
  AND ("lastErrorCode" IS NULL OR "lastErrorCode" IN ('STORAGE_DELETE_FAILED','WRITE_PENDING','LIVE_REFERENCE','GRANT_ACTIVE','LEASE_ACTIVE','NOT_ABSENT','LEGACY_WRITER_UNTRACKED'))
  AND (("state" = 'running' AND "claimId" IS NOT NULL AND "leaseUntil" IS NOT NULL) OR ("state" IN ('pending','done') AND "claimId" IS NULL AND "leaseUntil" IS NULL))
  AND ("state" <> 'done' OR "completedAt" IS NOT NULL)
);
ALTER TABLE "Youth" ADD CONSTRAINT "Youth_purgeProgress_valid" CHECK (
  "purgeBlockedReason" IS NULL OR "purgeBlockedReason" IN ('FILE_CLEANUP_PENDING','WRITE_PENDING','LIVE_REFERENCE','LEGACY_WRITER_UNTRACKED','PURGE_RETRY_REQUIRED')
);
-- No anonymous or authenticated Data API policy grants direct access.
ALTER TABLE "YouthMutationReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "YouthViewRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "YouthDecisionUpload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "YouthDecisionFileCleanup" ENABLE ROW LEVEL SECURITY;
