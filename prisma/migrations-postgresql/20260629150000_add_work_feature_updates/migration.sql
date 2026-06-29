CREATE TABLE "WorkFeatureUpdate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "WorkFeatureUpdate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkFeatureUpdate_createdAt_idx" ON "WorkFeatureUpdate"("createdAt");
CREATE INDEX "WorkFeatureUpdate_createdById_idx" ON "WorkFeatureUpdate"("createdById");

ALTER TABLE "WorkFeatureUpdate" ADD CONSTRAINT "WorkFeatureUpdate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
