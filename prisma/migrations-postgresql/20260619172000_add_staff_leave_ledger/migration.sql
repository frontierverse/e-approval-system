CREATE TABLE "StaffLeaveLedger" (
    "id" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "sourceKey" TEXT,
    "eventDate" TEXT NOT NULL,
    "amountHalfDays" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "documentId" TEXT,

    CONSTRAINT "StaffLeaveLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffLeaveLedger_userId_sourceKey_key"
ON "StaffLeaveLedger"("userId", "sourceKey");

CREATE UNIQUE INDEX "StaffLeaveLedger_documentId_key"
ON "StaffLeaveLedger"("documentId");

CREATE INDEX "StaffLeaveLedger_userId_eventDate_idx"
ON "StaffLeaveLedger"("userId", "eventDate");

CREATE INDEX "StaffLeaveLedger_entryType_idx"
ON "StaffLeaveLedger"("entryType");

CREATE INDEX "StaffLeaveLedger_actorId_idx"
ON "StaffLeaveLedger"("actorId");

CREATE INDEX "StaffLeaveLedger_createdAt_idx"
ON "StaffLeaveLedger"("createdAt");

ALTER TABLE "StaffLeaveLedger"
ADD CONSTRAINT "StaffLeaveLedger_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffLeaveLedger"
ADD CONSTRAINT "StaffLeaveLedger_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffLeaveLedger"
ADD CONSTRAINT "StaffLeaveLedger_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "ApprovalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
