ALTER TABLE "User"
ADD COLUMN "hireDate" TEXT,
ADD COLUMN "resignationDate" TEXT;

CREATE INDEX "User_hireDate_idx" ON "User"("hireDate");
CREATE INDEX "User_resignationDate_idx" ON "User"("resignationDate");
