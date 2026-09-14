CREATE TABLE "DailyWorkReport" (
    "id" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "mainContent" TEXT NOT NULL,
    "youthReports" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    "reviewedById" TEXT,
    CONSTRAINT "DailyWorkReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DailyWorkReport_mainContent_check" CHECK (char_length("mainContent") <= 10000 AND ("submittedAt" IS NULL OR char_length(btrim("mainContent")) > 0)),
    CONSTRAINT "DailyWorkReport_youthReports_check" CHECK (jsonb_typeof("youthReports") = 'array' AND jsonb_array_length("youthReports") <= 200),
    CONSTRAINT "DailyWorkReport_version_check" CHECK ("version" >= 1),
    CONSTRAINT "DailyWorkReport_review_check" CHECK ("reviewedAt" IS NULL OR "submittedAt" IS NOT NULL)
);
-- Sensitive reports are accessible only through permission-scoped server code.
-- With no client policies, Supabase anon/authenticated roles cannot read drafts or reports.
ALTER TABLE "DailyWorkReport" ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX "DailyWorkReport_authorId_workDate_key" ON "DailyWorkReport"("authorId", "workDate");
CREATE INDEX "DailyWorkReport_workDate_submittedAt_idx" ON "DailyWorkReport"("workDate", "submittedAt");
CREATE INDEX "DailyWorkReport_reviewedById_idx" ON "DailyWorkReport"("reviewedById");
ALTER TABLE "DailyWorkReport" ADD CONSTRAINT "DailyWorkReport_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyWorkReport" ADD CONSTRAINT "DailyWorkReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
