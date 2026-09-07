ALTER TABLE "StaffTask" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "StaffTask_assigneeId_deletedAt_idx" ON "StaffTask"("assigneeId", "deletedAt");
