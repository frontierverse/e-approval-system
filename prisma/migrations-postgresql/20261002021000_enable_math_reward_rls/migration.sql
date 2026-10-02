-- Retention checks use these tables through server-side Prisma only.
-- Keep the table owner working and deny client API access without policies.
ALTER TABLE "MathProblem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MathResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MathVaultLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MathSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MathSettlement" ENABLE ROW LEVEL SECURITY;
