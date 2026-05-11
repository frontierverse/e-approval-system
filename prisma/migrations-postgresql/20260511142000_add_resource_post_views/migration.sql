CREATE TABLE "ResourcePostView" (
    "id" TEXT NOT NULL,
    "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" INTEGER NOT NULL DEFAULT 1,
    "resourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ResourcePostView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResourcePostView_resourceId_userId_key" ON "ResourcePostView"("resourceId", "userId");
CREATE INDEX "ResourcePostView_resourceId_idx" ON "ResourcePostView"("resourceId");
CREATE INDEX "ResourcePostView_userId_idx" ON "ResourcePostView"("userId");
CREATE INDEX "ResourcePostView_lastViewedAt_idx" ON "ResourcePostView"("lastViewedAt");

ALTER TABLE "ResourcePostView" ADD CONSTRAINT "ResourcePostView_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ResourcePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourcePostView" ADD CONSTRAINT "ResourcePostView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
