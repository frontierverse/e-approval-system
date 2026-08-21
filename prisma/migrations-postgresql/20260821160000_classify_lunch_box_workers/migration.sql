CREATE TYPE "LunchBoxWorkerType" AS ENUM ('STAFF', 'TEMPORARY');

ALTER TABLE "LunchBoxWorkShift"
ADD COLUMN "workerType" "LunchBoxWorkerType" NOT NULL DEFAULT 'TEMPORARY';

ALTER TABLE "LunchBoxWorkShift"
ALTER COLUMN "laborCost" DROP DEFAULT,
ALTER COLUMN "laborCost" DROP NOT NULL;

ALTER TABLE "LunchBoxWorkShift"
DROP CONSTRAINT "LunchBoxWorkShift_labor_cost_check";

ALTER TABLE "LunchBoxWorkShift"
ADD CONSTRAINT "LunchBoxWorkShift_worker_type_labor_cost_check" CHECK (
  (
    "workerType" = 'STAFF'
    AND "laborCost" IS NULL
  )
  OR
  (
    "workerType" = 'TEMPORARY'
    AND "laborCost" IS NOT NULL
    AND "laborCost" >= 0
    AND "laborCost" <= 999999999
  )
);
