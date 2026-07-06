-- The per-youth free-form checklist is replaced by shared study concepts
-- with per-youth check marks.
DROP TABLE IF EXISTS "YouthSubjectProgressItem";

CREATE TABLE "StudyConcept" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "subunitId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyConcept_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudyConcept_subject_subunitId_idx" ON "StudyConcept"("subject", "subunitId");
CREATE INDEX "StudyConcept_createdAt_idx" ON "StudyConcept"("createdAt");

CREATE TABLE "StudyConceptCheck" (
    "id" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conceptId" TEXT NOT NULL,
    "youthId" TEXT NOT NULL,

    CONSTRAINT "StudyConceptCheck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudyConceptCheck_conceptId_youthId_key" ON "StudyConceptCheck"("conceptId", "youthId");
CREATE INDEX "StudyConceptCheck_youthId_idx" ON "StudyConceptCheck"("youthId");

ALTER TABLE "StudyConceptCheck" ADD CONSTRAINT "StudyConceptCheck_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "StudyConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudyConceptCheck" ADD CONSTRAINT "StudyConceptCheck_youthId_fkey" FOREIGN KEY ("youthId") REFERENCES "Youth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep Supabase anon/authenticated API roles away from direct table access.
ALTER TABLE "StudyConcept" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudyConceptCheck" ENABLE ROW LEVEL SECURITY;
