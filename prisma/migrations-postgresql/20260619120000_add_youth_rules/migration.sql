CREATE TABLE "YouthRule" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YouthRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "YouthRule_category_idx" ON "YouthRule"("category");
CREATE INDEX "YouthRule_createdAt_idx" ON "YouthRule"("createdAt");
