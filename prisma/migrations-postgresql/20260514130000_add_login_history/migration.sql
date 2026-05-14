CREATE TABLE "LoginHistory" (
    "id" TEXT NOT NULL,
    "attemptedName" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "failureReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "device" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "LoginHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginHistory_userId_createdAt_idx" ON "LoginHistory"("userId", "createdAt");
CREATE INDEX "LoginHistory_attemptedName_idx" ON "LoginHistory"("attemptedName");
CREATE INDEX "LoginHistory_success_createdAt_idx" ON "LoginHistory"("success", "createdAt");
CREATE INDEX "LoginHistory_createdAt_idx" ON "LoginHistory"("createdAt");

ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
