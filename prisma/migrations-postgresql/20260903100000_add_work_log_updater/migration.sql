BEGIN;

ALTER TABLE "WorkLog"
ADD COLUMN "updatedById" TEXT;

-- Preserve the actor from the latest known update event for records saved
-- before this column existed. Creation-only records stay NULL.
WITH "latestWorkLogUpdates" AS (
  SELECT DISTINCT ON ("auditLog"."targetId")
    "auditLog"."targetId",
    "auditLog"."actorId"
  FROM "AuditLog" AS "auditLog"
  WHERE "auditLog"."targetType" = 'WorkLog'
    AND "auditLog"."action" = 'UPDATE_WORK_LOG'
    AND "auditLog"."metadata" ->> 'changeType' = 'workLog.update'
  ORDER BY
    "auditLog"."targetId",
    "auditLog"."createdAt" DESC,
    "auditLog"."id" DESC
)
UPDATE "WorkLog" AS "workLog"
SET "updatedById" = "latestWorkLogUpdates"."actorId"
FROM "latestWorkLogUpdates"
WHERE "latestWorkLogUpdates"."targetId" = "workLog"."id";

CREATE INDEX "WorkLog_updatedById_idx"
ON "WorkLog"("updatedById");

ALTER TABLE "WorkLog"
ADD CONSTRAINT "WorkLog_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
