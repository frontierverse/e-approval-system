CREATE TYPE "MathProblemGrade" AS ENUM ('TWO_POINT', 'THREE_POINT', 'FOUR_POINT', 'KILLER');
CREATE TYPE "MathResultStatus" AS ENUM ('PASS', 'FAIL', 'ABSENT');
CREATE TYPE "MathPricePlan" AS ENUM ('A', 'B');
CREATE TYPE "MathVaultLogType" AS ENUM ('PASS', 'STREAK_UNLOCK', 'CORRECTION', 'SETTLEMENT', 'REOPEN');

CREATE TABLE "MathProblem" (
  "id" TEXT NOT NULL,
  "round" INTEGER NOT NULL,
  "examDate" DATE NOT NULL,
  "source" TEXT,
  "number" INTEGER,
  "grade" "MathProblemGrade" NOT NULL,
  "reward" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MathProblem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MathProblem_round_check" CHECK ("round" > 0),
  CONSTRAINT "MathProblem_reward_check" CHECK ("reward" >= 0),
  CONSTRAINT "MathProblem_number_check" CHECK ("number" IS NULL OR "number" > 0)
);

CREATE TABLE "MathResult" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "problemId" TEXT NOT NULL,
  "result" "MathResultStatus" NOT NULL,
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MathResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MathVaultLog" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "type" "MathVaultLogType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "round" INTEGER,
  "memo" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MathVaultLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MathSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "pricePlan" "MathPricePlan" NOT NULL DEFAULT 'A',
  "unlockRule" BOOLEAN NOT NULL DEFAULT true,
  "unlockStreak" INTEGER NOT NULL DEFAULT 3,
  "holidays" TEXT[] NOT NULL DEFAULT ARRAY['2026-10-09', '2026-12-25', '2027-01-01']::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MathSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MathSettings_unlockStreak_check" CHECK ("unlockStreak" > 0)
);

CREATE TABLE "MathSettlement" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "passCount" INTEGER NOT NULL,
  "finalizedAt" TIMESTAMP(3) NOT NULL,
  "reopenedAt" TIMESTAMP(3),
  "finalizedById" TEXT,
  "reopenedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MathSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MathSettlement_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "MathSettlement_passCount_check" CHECK ("passCount" >= 0)
);

CREATE UNIQUE INDEX "MathProblem_round_key" ON "MathProblem"("round");
CREATE INDEX "MathProblem_examDate_idx" ON "MathProblem"("examDate");
CREATE UNIQUE INDEX "MathResult_studentId_problemId_key" ON "MathResult"("studentId", "problemId");
CREATE INDEX "MathResult_problemId_idx" ON "MathResult"("problemId");
CREATE INDEX "MathResult_studentId_result_idx" ON "MathResult"("studentId", "result");
CREATE INDEX "MathVaultLog_studentId_date_createdAt_idx" ON "MathVaultLog"("studentId", "date", "createdAt");
CREATE INDEX "MathVaultLog_actorId_idx" ON "MathVaultLog"("actorId");
CREATE UNIQUE INDEX "MathSettlement_studentId_key" ON "MathSettlement"("studentId");
CREATE INDEX "MathSettlement_finalizedAt_idx" ON "MathSettlement"("finalizedAt");
CREATE INDEX "MathSettlement_finalizedById_idx" ON "MathSettlement"("finalizedById");
CREATE INDEX "MathSettlement_reopenedById_idx" ON "MathSettlement"("reopenedById");

ALTER TABLE "MathResult" ADD CONSTRAINT "MathResult_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Youth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MathResult" ADD CONSTRAINT "MathResult_problemId_fkey"
FOREIGN KEY ("problemId") REFERENCES "MathProblem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MathVaultLog" ADD CONSTRAINT "MathVaultLog_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Youth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MathVaultLog" ADD CONSTRAINT "MathVaultLog_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MathSettlement" ADD CONSTRAINT "MathSettlement_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Youth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MathSettlement" ADD CONSTRAINT "MathSettlement_finalizedById_fkey"
FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MathSettlement" ADD CONSTRAINT "MathSettlement_reopenedById_fkey"
FOREIGN KEY ("reopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
