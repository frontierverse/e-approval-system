CREATE TABLE "StaffChatAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "originalName" VARCHAR(180) NOT NULL,
    "mimeType" VARCHAR(255) NOT NULL,
    "size" INTEGER NOT NULL,
    "fileDigest" VARCHAR(64) NOT NULL,
    "storageProvider" TEXT,
    "storageKey" TEXT,
    "downloadRequestId" VARCHAR(128),
    "downloadToken" VARCHAR(128),
    "downloadExpiresAt" TIMESTAMP(3),
    "downloadedAt" TIMESTAMP(3),
    "deletionRequestedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffChatAttachment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffChatAttachment_size_check" CHECK ("size" > 0 AND "size" <= 4194304),
    CONSTRAINT "StaffChatAttachment_digest_check" CHECK ("fileDigest" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "StaffChatAttachment_storage_check" CHECK (
      ("deletedAt" IS NULL AND "storageKey" IS NOT NULL AND "storageProvider" IS NOT NULL)
      OR ("deletedAt" IS NOT NULL AND "storageKey" IS NULL AND "storageProvider" IS NULL AND "deletionRequestedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "StaffChatAttachment_messageId_key" ON "StaffChatAttachment"("messageId");
CREATE INDEX "StaffChatAttachment_deletionRequestedAt_deletedAt_idx" ON "StaffChatAttachment"("deletionRequestedAt", "deletedAt");
ALTER TABLE "StaffChatAttachment" ADD CONSTRAINT "StaffChatAttachment_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "StaffChatMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Chat storage identifiers and download leases are server-only. The table owner
-- used by Prisma retains access; Supabase anon/authenticated have no RLS policy.
ALTER TABLE "StaffChatAttachment" ENABLE ROW LEVEL SECURITY;
