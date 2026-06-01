CREATE TABLE "Youth" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Youth_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "YouthSpecialNote" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "recordedAt" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT '보통',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "youthId" TEXT NOT NULL,

    CONSTRAINT "YouthSpecialNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Youth_name_key" ON "Youth"("name");
CREATE INDEX "Youth_name_idx" ON "Youth"("name");
CREATE INDEX "YouthSpecialNote_youthId_idx" ON "YouthSpecialNote"("youthId");
CREATE INDEX "YouthSpecialNote_category_idx" ON "YouthSpecialNote"("category");
CREATE INDEX "YouthSpecialNote_priority_idx" ON "YouthSpecialNote"("priority");
CREATE INDEX "YouthSpecialNote_recordedAt_idx" ON "YouthSpecialNote"("recordedAt");

ALTER TABLE "YouthSpecialNote" ADD CONSTRAINT "YouthSpecialNote_youthId_fkey" FOREIGN KEY ("youthId") REFERENCES "Youth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
