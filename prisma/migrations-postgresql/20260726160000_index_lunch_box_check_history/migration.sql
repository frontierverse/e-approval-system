CREATE INDEX "AuditLog_action_targetType_createdAt_id_idx"
ON "AuditLog"("action", "targetType", "createdAt", "id");
