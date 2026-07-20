BEGIN;

ALTER TABLE "LunchBoxCount"
ADD COLUMN "deliveryDriverCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "LunchBoxCount"
ADD CONSTRAINT "LunchBoxCount_deliveryDriverCount_check"
CHECK ("deliveryDriverCount" >= 0);

COMMIT;
