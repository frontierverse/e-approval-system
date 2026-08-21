ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_LUNCH_BOX_OPERATION';

BEGIN;

CREATE TABLE "LunchBoxDailyOperation" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,

  CONSTRAINT "LunchBoxDailyOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LunchBoxDailyOperation_version_check" CHECK ("version" > 0)
);

CREATE TABLE "LunchBoxWorkShift" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "workerName" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "laborCost" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LunchBoxWorkShift_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LunchBoxWorkShift_time_check" CHECK (
    "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND "endTime" > "startTime"
  ),
  CONSTRAINT "LunchBoxWorkShift_labor_cost_check" CHECK (
    "laborCost" >= 0 AND "laborCost" <= 999999999
  )
);

CREATE TABLE "LunchBoxIngredientPurchase" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "itemName" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "purchaseAmount" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LunchBoxIngredientPurchase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LunchBoxIngredientPurchase_quantity_check" CHECK (
    "quantity" > 0
  ),
  CONSTRAINT "LunchBoxIngredientPurchase_amount_check" CHECK (
    "purchaseAmount" >= 0 AND "purchaseAmount" <= 999999999
  )
);

CREATE UNIQUE INDEX "LunchBoxDailyOperation_date_key"
ON "LunchBoxDailyOperation"("date");

CREATE INDEX "LunchBoxDailyOperation_updatedById_idx"
ON "LunchBoxDailyOperation"("updatedById");

CREATE INDEX "LunchBoxWorkShift_operationId_order_idx"
ON "LunchBoxWorkShift"("operationId", "order");

CREATE INDEX "LunchBoxIngredientPurchase_operationId_order_idx"
ON "LunchBoxIngredientPurchase"("operationId", "order");

ALTER TABLE "LunchBoxDailyOperation"
ADD CONSTRAINT "LunchBoxDailyOperation_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LunchBoxWorkShift"
ADD CONSTRAINT "LunchBoxWorkShift_operationId_fkey"
FOREIGN KEY ("operationId") REFERENCES "LunchBoxDailyOperation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LunchBoxIngredientPurchase"
ADD CONSTRAINT "LunchBoxIngredientPurchase_operationId_fkey"
FOREIGN KEY ("operationId") REFERENCES "LunchBoxDailyOperation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep Supabase anon/authenticated API roles away from direct table access.
ALTER TABLE "LunchBoxDailyOperation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LunchBoxWorkShift" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LunchBoxIngredientPurchase" ENABLE ROW LEVEL SECURITY;

COMMIT;
