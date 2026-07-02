CREATE TABLE "QuestionBankPdf" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "originalName" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "unitId" TEXT NOT NULL,
    "uploadedById" TEXT,

    CONSTRAINT "QuestionBankPdf_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuestionBankPdf_unitId_idx" ON "QuestionBankPdf"("unitId");
CREATE INDEX "QuestionBankPdf_uploadedById_idx" ON "QuestionBankPdf"("uploadedById");
CREATE INDEX "QuestionBankPdf_createdAt_idx" ON "QuestionBankPdf"("createdAt");

ALTER TABLE "QuestionBankPdf" ADD CONSTRAINT "QuestionBankPdf_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "ProblemUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionBankPdf" ADD CONSTRAINT "QuestionBankPdf_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
