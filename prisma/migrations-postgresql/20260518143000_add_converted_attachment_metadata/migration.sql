ALTER TABLE "Attachment"
ADD COLUMN "convertedAt" TIMESTAMP(3),
ADD COLUMN "convertedById" TEXT,
ADD COLUMN "convertedSourceAttachmentId" TEXT;

CREATE INDEX "Attachment_convertedById_idx" ON "Attachment"("convertedById");
CREATE INDEX "Attachment_convertedSourceAttachmentId_idx" ON "Attachment"("convertedSourceAttachmentId");

ALTER TABLE "Attachment"
ADD CONSTRAINT "Attachment_convertedById_fkey"
FOREIGN KEY ("convertedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Attachment"
ADD CONSTRAINT "Attachment_convertedSourceAttachmentId_fkey"
FOREIGN KEY ("convertedSourceAttachmentId") REFERENCES "Attachment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
