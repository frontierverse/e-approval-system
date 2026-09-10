ALTER TABLE "StaffChatAttachment" DROP CONSTRAINT "StaffChatAttachment_size_check";
ALTER TABLE "StaffChatAttachment" ADD CONSTRAINT "StaffChatAttachment_size_check"
  CHECK ("size" > 0 AND ("size" <= 4194304 OR (lower("originalName") LIKE '%.zip' AND "size" <= 104857600)));

CREATE TABLE "StaffChatUpload" (
  "id" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "requestId" VARCHAR(128) NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "originalName" VARCHAR(180) NOT NULL,
  "mimeType" VARCHAR(255) NOT NULL,
  "size" INTEGER NOT NULL,
  "chunkDigests" JSONB NOT NULL,
  "uploadedParts" JSONB NOT NULL DEFAULT '[]',
  "storageProvider" TEXT NOT NULL,
  "fileDigest" VARCHAR(64) NOT NULL,
  "messageId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "deletionRequestedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffChatUpload_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffChatUpload_size_check" CHECK ("size" > 4194304 AND "size" <= 104857600 AND lower("originalName") LIKE '%.zip'),
  CONSTRAINT "StaffChatUpload_participants_check" CHECK ("senderId" <> "recipientId"),
  CONSTRAINT "StaffChatUpload_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StaffChatUpload_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StaffChatUpload_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "StaffChatMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StaffChatUpload_senderId_requestId_key" ON "StaffChatUpload"("senderId", "requestId");
CREATE UNIQUE INDEX "StaffChatUpload_messageId_key" ON "StaffChatUpload"("messageId");
CREATE INDEX "StaffChatUpload_senderId_expiresAt_idx" ON "StaffChatUpload"("senderId", "expiresAt");
ALTER TABLE "StaffChatUpload" ENABLE ROW LEVEL SECURITY;
