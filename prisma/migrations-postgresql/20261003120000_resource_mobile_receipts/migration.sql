-- CreateTable
CREATE TABLE "ResourceMutationReceipt" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "targetResourceId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "committedUpdatedAt" TIMESTAMP(3),
    "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleanupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "ResourceMutationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceUpload" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "startRequestId" TEXT NOT NULL,
    "startPayloadHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'resource',
    "targetResourceId" TEXT,
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
    "consumedResourceId" TEXT,
    "consumedMutationId" TEXT,
    "consumedAttachmentId" TEXT,
    "terminalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceViewEvent" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceViewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceFileCleanup" (
    "id" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "objectKind" TEXT NOT NULL,
    "sourceUploadId" TEXT,
    "sourceMutationId" TEXT,
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

    CONSTRAINT "ResourceFileCleanup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResourceMutationReceipt_actorId_requestId_key" ON "ResourceMutationReceipt"("actorId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceUpload_stagingKey_key" ON "ResourceUpload"("stagingKey");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceUpload_finalKey_key" ON "ResourceUpload"("finalKey");

-- CreateIndex
CREATE INDEX "ResourceUpload_state_expiresAt_idx" ON "ResourceUpload"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "ResourceUpload_state_finalizeLeaseUntil_idx" ON "ResourceUpload"("state", "finalizeLeaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceUpload_actorId_startRequestId_key" ON "ResourceUpload"("actorId", "startRequestId");

-- CreateIndex
CREATE INDEX "ResourceViewEvent_resourceId_createdAt_idx" ON "ResourceViewEvent"("resourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceViewEvent_resourceId_actorId_requestId_key" ON "ResourceViewEvent"("resourceId", "actorId", "requestId");

-- CreateIndex
CREATE INDEX "ResourceFileCleanup_state_nextAttemptAt_idx" ON "ResourceFileCleanup"("state", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ResourceFileCleanup_state_leaseUntil_idx" ON "ResourceFileCleanup"("state", "leaseUntil");

-- CreateIndex
CREATE INDEX "ResourceFileCleanup_sourceUploadId_state_idx" ON "ResourceFileCleanup"("sourceUploadId", "state");

-- CreateIndex
CREATE INDEX "ResourceFileCleanup_sourceMutationId_state_idx" ON "ResourceFileCleanup"("sourceMutationId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceFileCleanup_storageProvider_storageKey_key" ON "ResourceFileCleanup"("storageProvider", "storageKey");

-- AddForeignKey
ALTER TABLE "ResourceViewEvent" ADD CONSTRAINT "ResourceViewEvent_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ResourcePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Durable server-owned receipts do not depend on a staff or live post row.
ALTER TABLE "ResourceMutationReceipt" ALTER COLUMN "cleanupIds" SET NOT NULL;
ALTER TABLE "ResourceMutationReceipt" ADD CONSTRAINT "ResourceMutationReceipt_valid" CHECK (
  "operation" IN ('create','update','delete')
  AND "requestId" ~ '^[A-Za-z0-9_-]{8,128}$'
  AND "payloadHash" ~ '^[a-f0-9]{64}$'
  AND ("operation" = 'delete' OR "committedUpdatedAt" IS NOT NULL)
);
ALTER TABLE "ResourceViewEvent" ADD CONSTRAINT "ResourceViewEvent_request_valid"
  CHECK ("requestId" ~ '^[A-Za-z0-9_-]{8,128}$');

ALTER TABLE "ResourceUpload" ADD CONSTRAINT "ResourceUpload_state_valid" CHECK (
  "purpose" = 'resource'
  AND "state" IN ('uploading','finalizing','ready','consumed','deleting','deleted','expired')
  AND "storageProvider" IN ('local','supabase-storage','vercel-blob')
  AND "startRequestId" ~ '^[A-Za-z0-9_-]{8,128}$'
  AND "startPayloadHash" ~ '^[a-f0-9]{64}$'
  AND ("expectedSha256" IS NULL OR "expectedSha256" ~ '^[a-f0-9]{64}$')
  AND ("plaintextSha256" IS NULL OR "plaintextSha256" ~ '^[a-f0-9]{64}$')
  AND ("storedSha256" IS NULL OR "storedSha256" ~ '^[a-f0-9]{64}$')
  AND ("size" IS NULL OR "size" BETWEEN 1 AND 314572800)
  AND ("storedSize" IS NULL OR "storedSize" BETWEEN 1 AND 314572832)
  AND ("finalizeIv" IS NULL OR "finalizeIv" ~ '^[A-Za-z0-9+/]{16}$')
  AND ("finalizeWriteEvidence" IS NULL OR "finalizeWriteEvidence" IN ('pending','confirmed','unknown'))
  AND (("finalizeClaimId" IS NULL AND "finalizeLeaseUntil" IS NULL)
    OR ("finalizeClaimId" IS NOT NULL AND "finalizeLeaseUntil" IS NOT NULL))
);
ALTER TABLE "ResourceUpload" ADD CONSTRAINT "ResourceUpload_descriptor_required" CHECK (
  "state" NOT IN ('uploading','finalizing','ready','consumed')
  OR ("originalName" IS NOT NULL AND "mimeType" IS NOT NULL
    AND "size" IS NOT NULL AND "expectedSha256" IS NOT NULL)
);
ALTER TABLE "ResourceUpload" ADD CONSTRAINT "ResourceUpload_ready_verified" CHECK (
  "state" NOT IN ('ready','consumed')
  OR ("finalKey" IS NOT NULL AND "completedAt" IS NOT NULL
    AND "plaintextSha256" IS NOT NULL AND "plaintextSha256" = "expectedSha256"
    AND "storedSha256" IS NOT NULL AND "storedSize" IS NOT NULL
    AND "storedSize" IN ("size", "size" + 32)
    AND "finalizeWriteEvidence" IS NOT NULL AND "finalizeWriteEvidence" = 'confirmed')
);
ALTER TABLE "ResourceUpload" ADD CONSTRAINT "ResourceUpload_consume_binding" CHECK (
  "state" <> 'consumed' OR ("consumedResourceId" IS NOT NULL
    AND "consumedMutationId" IS NOT NULL AND "consumedAttachmentId" IS NOT NULL)
);

ALTER TABLE "ResourceFileCleanup" ADD CONSTRAINT "ResourceFileCleanup_state_valid" CHECK (
  "storageProvider" IN ('local','supabase-storage','vercel-blob')
  AND "objectKind" IN ('staging','final','legacy')
  AND "state" IN ('pending','running','done')
  AND "attemptCount" >= 0
  AND ("sourceUploadId" IS NOT NULL OR "sourceMutationId" IS NOT NULL)
  AND ("lastErrorCode" IS NULL OR "lastErrorCode" IN ('STORAGE_DELETE_FAILED','WRITE_PENDING','LIVE_REFERENCE','GRANT_ACTIVE','LEASE_ACTIVE','NOT_ABSENT'))
  AND (("state" = 'running' AND "claimId" IS NOT NULL AND "leaseUntil" IS NOT NULL)
    OR ("state" IN ('pending','done') AND "claimId" IS NULL AND "leaseUntil" IS NULL))
  AND ("state" <> 'done' OR "completedAt" IS NOT NULL)
);

-- No anonymous/authenticated Data API policies: only trusted server access.
ALTER TABLE "ResourceMutationReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResourceUpload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResourceViewEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResourceFileCleanup" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "ResourceUpload_consumedAttachmentId_idx" ON "ResourceUpload"("consumedAttachmentId");
CREATE INDEX "ResourceUpload_consumedResourceId_state_idx" ON "ResourceUpload"("consumedResourceId", "state");
