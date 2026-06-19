ALTER TABLE "YouthRule"
ADD COLUMN "targetYouthId" TEXT;

CREATE INDEX "YouthRule_targetYouthId_idx" ON "YouthRule"("targetYouthId");

ALTER TABLE "YouthRule"
ADD CONSTRAINT "YouthRule_targetYouthId_fkey"
FOREIGN KEY ("targetYouthId")
REFERENCES "Youth"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
