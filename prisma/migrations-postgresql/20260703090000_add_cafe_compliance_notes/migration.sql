CREATE TABLE "CafeComplianceNote" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "CafeComplianceNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CafeComplianceNote_createdAt_idx" ON "CafeComplianceNote"("createdAt");
CREATE INDEX "CafeComplianceNote_createdById_idx" ON "CafeComplianceNote"("createdById");

ALTER TABLE "CafeComplianceNote" ADD CONSTRAINT "CafeComplianceNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep Supabase anon/authenticated API roles away from direct table access.
ALTER TABLE "CafeComplianceNote" ENABLE ROW LEVEL SECURITY;
