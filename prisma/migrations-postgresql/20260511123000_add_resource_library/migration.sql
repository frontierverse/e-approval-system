ALTER TYPE "AuditAction" ADD VALUE 'CREATE_RESOURCE';
ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_RESOURCE';
ALTER TYPE "AuditAction" ADD VALUE 'DELETE_RESOURCE';

CREATE TABLE "ResourcePost" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'report',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "ResourcePost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResourceAttachment" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resourceId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,

    CONSTRAINT "ResourceAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResourcePost_authorId_idx" ON "ResourcePost"("authorId");
CREATE INDEX "ResourcePost_category_idx" ON "ResourcePost"("category");
CREATE INDEX "ResourcePost_createdAt_idx" ON "ResourcePost"("createdAt");
CREATE INDEX "ResourcePost_pinned_createdAt_idx" ON "ResourcePost"("pinned", "createdAt");
CREATE INDEX "ResourceAttachment_resourceId_idx" ON "ResourceAttachment"("resourceId");
CREATE INDEX "ResourceAttachment_uploaderId_idx" ON "ResourceAttachment"("uploaderId");

ALTER TABLE "ResourcePost" ADD CONSTRAINT "ResourcePost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceAttachment" ADD CONSTRAINT "ResourceAttachment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ResourcePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceAttachment" ADD CONSTRAINT "ResourceAttachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
