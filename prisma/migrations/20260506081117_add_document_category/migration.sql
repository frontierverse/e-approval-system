-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApprovalDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentNo" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '일반',
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "templateId" TEXT NOT NULL,
    "drafterId" TEXT NOT NULL,
    CONSTRAINT "ApprovalDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ApprovalDocument_drafterId_fkey" FOREIGN KEY ("drafterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ApprovalDocument" ("completedAt", "content", "createdAt", "documentNo", "drafterId", "id", "status", "submittedAt", "templateId", "title", "updatedAt") SELECT "completedAt", "content", "createdAt", "documentNo", "drafterId", "id", "status", "submittedAt", "templateId", "title", "updatedAt" FROM "ApprovalDocument";
DROP TABLE "ApprovalDocument";
ALTER TABLE "new_ApprovalDocument" RENAME TO "ApprovalDocument";
CREATE UNIQUE INDEX "ApprovalDocument_documentNo_key" ON "ApprovalDocument"("documentNo");
CREATE INDEX "ApprovalDocument_status_idx" ON "ApprovalDocument"("status");
CREATE INDEX "ApprovalDocument_templateId_idx" ON "ApprovalDocument"("templateId");
CREATE INDEX "ApprovalDocument_drafterId_idx" ON "ApprovalDocument"("drafterId");
CREATE INDEX "ApprovalDocument_submittedAt_idx" ON "ApprovalDocument"("submittedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
