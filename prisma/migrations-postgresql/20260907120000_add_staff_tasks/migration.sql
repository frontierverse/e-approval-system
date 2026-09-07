ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_STAFF_TASK';

CREATE TABLE "StaffTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "meetingTitle" TEXT,
    "dueDate" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "StaffTask_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffTask_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 160),
    CONSTRAINT "StaffTask_description_check" CHECK ("description" IS NULL OR char_length("description") <= 2000),
    CONSTRAINT "StaffTask_meetingTitle_check" CHECK ("meetingTitle" IS NULL OR char_length("meetingTitle") <= 160),
    CONSTRAINT "StaffTask_dueDate_check" CHECK ("dueDate" IS NULL OR ("dueDate" ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' AND to_char("dueDate"::date, 'YYYY-MM-DD') = "dueDate")),
    CONSTRAINT "StaffTask_version_check" CHECK ("version" >= 0)
);

CREATE UNIQUE INDEX "StaffTask_requestId_key" ON "StaffTask"("requestId");
CREATE INDEX "StaffTask_assigneeId_completedAt_dueDate_idx" ON "StaffTask"("assigneeId", "completedAt", "dueDate");
CREATE INDEX "StaffTask_completedAt_dueDate_idx" ON "StaffTask"("completedAt", "dueDate");
CREATE INDEX "StaffTask_createdById_idx" ON "StaffTask"("createdById");

ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_assigneeId_fkey"
FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffTask" ADD CONSTRAINT "StaffTask_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Staff tasks are available only through authenticated, permission-scoped server code.
ALTER TABLE "StaffTask" ENABLE ROW LEVEL SECURITY;
