ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_WORK_LOG';

CREATE TABLE "WorkLog" (
    "id" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "keyword" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "WorkLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkLog_keyword_check"
      CHECK (char_length(btrim("keyword")) BETWEEN 1 AND 100),
    CONSTRAINT "WorkLog_content_check"
      CHECK (char_length(btrim("content")) BETWEEN 1 AND 5000)
);

CREATE UNIQUE INDEX "WorkLog_authorId_workDate_key"
ON "WorkLog"("authorId", "workDate");

ALTER TABLE "WorkLog"
ADD CONSTRAINT "WorkLog_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkLog" ENABLE ROW LEVEL SECURITY;
