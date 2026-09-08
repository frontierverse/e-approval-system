CREATE TABLE "StaffChatMessage" (
    "id" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "requestId" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "StaffChatMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffChatMessage_distinct_participants" CHECK ("senderId" <> "recipientId"),
    CONSTRAINT "StaffChatMessage_body_not_empty" CHECK (length(btrim("body")) > 0)
);

-- Chat is accessible only through authenticated, participant-scoped server code.
-- No direct client policies: anon/authenticated grants still cannot read or write
-- rows. The Prisma table owner retains its normal RLS bypass for server queries.
ALTER TABLE "StaffChatMessage" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "StaffChatMessage_sequence_key" ON "StaffChatMessage"("sequence");
CREATE UNIQUE INDEX "StaffChatMessage_senderId_requestId_key" ON "StaffChatMessage"("senderId", "requestId");
CREATE INDEX "StaffChatMessage_senderId_recipientId_sequence_idx" ON "StaffChatMessage"("senderId", "recipientId", "sequence");
CREATE INDEX "StaffChatMessage_recipientId_readAt_sequence_idx" ON "StaffChatMessage"("recipientId", "readAt", "sequence");

ALTER TABLE "StaffChatMessage" ADD CONSTRAINT "StaffChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffChatMessage" ADD CONSTRAINT "StaffChatMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
