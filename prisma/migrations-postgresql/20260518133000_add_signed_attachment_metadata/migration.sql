ALTER TABLE "Attachment"
ADD COLUMN "signedAt" TIMESTAMP(3),
ADD COLUMN "signedById" TEXT,
ADD COLUMN "signedSourceAttachmentId" TEXT;

CREATE INDEX "Attachment_signedById_idx" ON "Attachment"("signedById");
CREATE INDEX "Attachment_signedSourceAttachmentId_idx" ON "Attachment"("signedSourceAttachmentId");

ALTER TABLE "Attachment"
ADD CONSTRAINT "Attachment_signedById_fkey"
FOREIGN KEY ("signedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Attachment"
ADD CONSTRAINT "Attachment_signedSourceAttachmentId_fkey"
FOREIGN KEY ("signedSourceAttachmentId") REFERENCES "Attachment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
