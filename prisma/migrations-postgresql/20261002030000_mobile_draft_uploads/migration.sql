CREATE TABLE "MobileDraftUpload" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "storageProvider" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "documentId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileDraftUpload_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobileDraftUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MobileDraftUpload_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ApprovalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MobileDraftUpload_storageKey_key" ON "MobileDraftUpload"("storageKey");
CREATE INDEX "MobileDraftUpload_userId_documentId_expiresAt_idx" ON "MobileDraftUpload"("userId", "documentId", "expiresAt");

-- Upload ownership is checked by the server; direct Data API access is denied.
ALTER TABLE "MobileDraftUpload" ENABLE ROW LEVEL SECURITY;
