ALTER TABLE "CafeItem"
ALTER COLUMN "purchasedAt" TYPE DATE
USING "purchasedAt"::date;

ALTER TABLE "CafeItem"
ALTER COLUMN "expirationDate" TYPE DATE
USING NULLIF("expirationDate", '')::date;
