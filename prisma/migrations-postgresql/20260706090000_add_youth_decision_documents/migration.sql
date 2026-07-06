CREATE TABLE "YouthDecisionDocument" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "youthId" TEXT NOT NULL,
    "uploadedById" TEXT,

    CONSTRAINT "YouthDecisionDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "YouthDecisionDocument_youthId_idx" ON "YouthDecisionDocument"("youthId");
CREATE INDEX "YouthDecisionDocument_uploadedById_idx" ON "YouthDecisionDocument"("uploadedById");
CREATE INDEX "YouthDecisionDocument_createdAt_idx" ON "YouthDecisionDocument"("createdAt");

ALTER TABLE "YouthDecisionDocument" ADD CONSTRAINT "YouthDecisionDocument_youthId_fkey" FOREIGN KEY ("youthId") REFERENCES "Youth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "YouthDecisionDocument" ADD CONSTRAINT "YouthDecisionDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep Supabase anon/authenticated API roles away from direct table access.
ALTER TABLE "YouthDecisionDocument" ENABLE ROW LEVEL SECURITY;
