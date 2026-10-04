-- Opaque actor/request proof survives deletion of a staff member or business target.
CREATE TABLE "CafeMutationReceipt" (
 "id" TEXT NOT NULL,
 "actorId" TEXT NOT NULL,
 "requestId" TEXT NOT NULL,
 "operation" TEXT NOT NULL,
 "targetType" TEXT NOT NULL,
 "targetId" TEXT NOT NULL,
 "payloadHash" TEXT NOT NULL,
 "committedUpdatedAt" TIMESTAMP(3),
 "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CafeMutationReceipt_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "CafeMutationReceipt_valid" CHECK (
  "actorId" ~ '^[A-Za-z0-9_-]{1,128}$' AND "targetId" ~ '^[A-Za-z0-9_-]{1,128}$'
  AND "requestId" ~ '^[A-Za-z0-9_-]{8,128}$' AND "payloadHash" ~ '^[a-f0-9]{64}$'
  AND (("operation" IN ('item.create','item.update','item.delete','item.hold') AND "targetType" = 'CafeItem')
    OR ("operation" IN ('note.create','note.delete') AND "targetType" = 'CafeComplianceNote'))
  AND (("operation" IN ('item.delete','note.delete') AND "committedUpdatedAt" IS NULL)
    OR ("operation" IN ('item.create','item.update','item.hold','note.create') AND "committedUpdatedAt" IS NOT NULL))
 )
);
CREATE UNIQUE INDEX "CafeMutationReceipt_actorId_requestId_key" ON "CafeMutationReceipt"("actorId","requestId");
CREATE INDEX "CafeMutationReceipt_targetType_targetId_idx" ON "CafeMutationReceipt"("targetType","targetId");
ALTER TABLE "CafeMutationReceipt" ENABLE ROW LEVEL SECURITY;
-- No public Data API policies. Server DAL is the only mutation entry point.
