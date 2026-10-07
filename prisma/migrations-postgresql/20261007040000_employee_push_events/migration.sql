CREATE TABLE "MobilePushEvent" (
  "id" TEXT NOT NULL, "eventKey" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "targetId" TEXT NOT NULL, "targetVersion" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobilePushEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobilePushEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MobilePushEvent_eventKey_userId_key" ON "MobilePushEvent"("eventKey", "userId");
CREATE INDEX "MobilePushEvent_userId_createdAt_idx" ON "MobilePushEvent"("userId", "createdAt");
CREATE INDEX "MobilePushEvent_expiresAt_idx" ON "MobilePushEvent"("expiresAt");
ALTER TABLE "MobilePushDelivery" ALTER COLUMN "notificationId" DROP NOT NULL;
ALTER TABLE "MobilePushDelivery" ADD COLUMN "eventId" TEXT;
ALTER TABLE "MobilePushDelivery" ADD CONSTRAINT "MobilePushDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "MobilePushEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MobilePushDelivery" ADD CONSTRAINT "MobilePushDelivery_source_check" CHECK (("notificationId" IS NOT NULL)::int + ("eventId" IS NOT NULL)::int = 1);
CREATE UNIQUE INDEX "MobilePushDelivery_eventId_subscriptionId_key" ON "MobilePushDelivery"("eventId", "subscriptionId");
ALTER TABLE "MobilePushEvent" ENABLE ROW LEVEL SECURITY;
