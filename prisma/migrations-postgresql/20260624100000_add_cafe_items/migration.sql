CREATE TABLE "CafeItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "purchasedAt" TEXT NOT NULL,
    "priceWon" INTEGER,
    "purchaseReason" TEXT,
    "expirationDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CafeItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CafeItem_category_idx" ON "CafeItem"("category");
CREATE INDEX "CafeItem_purchasedAt_idx" ON "CafeItem"("purchasedAt");
CREATE INDEX "CafeItem_expirationDate_idx" ON "CafeItem"("expirationDate");
CREATE INDEX "CafeItem_createdAt_idx" ON "CafeItem"("createdAt");
