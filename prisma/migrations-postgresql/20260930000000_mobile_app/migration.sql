CREATE TABLE "MobileSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MobileSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileSession_tokenHash_key" ON "MobileSession"("tokenHash");
CREATE INDEX "MobileSession_userId_expiresAt_idx" ON "MobileSession"("userId", "expiresAt");
ALTER TABLE "MobileSession" ADD CONSTRAINT "MobileSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MobilePushSubscription" (
    "id" TEXT NOT NULL,
    "expoToken" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MobilePushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobilePushSubscription_expoToken_key" ON "MobilePushSubscription"("expoToken");
CREATE UNIQUE INDEX "MobilePushSubscription_sessionId_key" ON "MobilePushSubscription"("sessionId");
ALTER TABLE "MobilePushSubscription" ADD CONSTRAINT "MobilePushSubscription_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MobileSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MobilePushDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" TEXT,
    "sentAt" TIMESTAMP(3),
    "receiptCheckedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MobilePushDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobilePushDelivery_ticketId_key" ON "MobilePushDelivery"("ticketId");
CREATE UNIQUE INDEX "MobilePushDelivery_notificationId_subscriptionId_key" ON "MobilePushDelivery"("notificationId", "subscriptionId");
CREATE INDEX "MobilePushDelivery_sentAt_failedAt_nextAttemptAt_idx" ON "MobilePushDelivery"("sentAt", "failedAt", "nextAttemptAt");
CREATE INDEX "MobilePushDelivery_receiptCheckedAt_sentAt_idx" ON "MobilePushDelivery"("receiptCheckedAt", "sentAt");
ALTER TABLE "MobilePushDelivery" ADD CONSTRAINT "MobilePushDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobilePushDelivery" ADD CONSTRAINT "MobilePushDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MobilePushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
