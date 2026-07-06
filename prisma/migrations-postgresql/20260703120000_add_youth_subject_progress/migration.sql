CREATE TABLE "YouthSubjectProgressItem" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "youthId" TEXT NOT NULL,

    CONSTRAINT "YouthSubjectProgressItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "YouthSubjectProgressItem_youthId_subject_idx" ON "YouthSubjectProgressItem"("youthId", "subject");
CREATE INDEX "YouthSubjectProgressItem_createdAt_idx" ON "YouthSubjectProgressItem"("createdAt");

ALTER TABLE "YouthSubjectProgressItem" ADD CONSTRAINT "YouthSubjectProgressItem_youthId_fkey" FOREIGN KEY ("youthId") REFERENCES "Youth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep Supabase anon/authenticated API roles away from direct table access.
ALTER TABLE "YouthSubjectProgressItem" ENABLE ROW LEVEL SECURITY;
