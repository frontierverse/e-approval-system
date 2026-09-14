import assert from "node:assert/strict";
import { test } from "node:test";

const ciDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/e_approval_test";

test("CI PostgreSQL enforces daily uniqueness, private client access, and conditional report updates", {
  skip: process.env.GITHUB_ACTIONS !== "true", timeout: 20000,
}, async () => {
  if (process.env.DATABASE_URL !== ciDatabaseUrl || process.env.DIRECT_URL !== ciDatabaseUrl) throw new Error("Disposable CI database required");
  const [{ PrismaClient, Prisma }, { PrismaPg }] = await Promise.all([
    import("../src/generated/prisma/client.ts"), import("@prisma/adapter-pg"),
  ]);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: ciDatabaseUrl, max: 1 }) });
  try {
    const flags = await db.$queryRaw<{ enabled: boolean }[]>(Prisma.sql`SELECT relrowsecurity AS enabled FROM pg_class WHERE oid = 'public."DailyWorkReport"'::regclass`);
    assert.deepEqual(flags, [{ enabled: true }]);
    const policies = await db.$queryRaw(Prisma.sql`SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'DailyWorkReport'`);
    assert.deepEqual(policies, []);
    await db.$transaction(async tx => {
      // Shadow only this table for this connection; no real report rows are changed.
      await tx.$executeRaw(Prisma.sql`CREATE TEMP TABLE "DailyWorkReport" (LIKE public."DailyWorkReport" INCLUDING ALL) ON COMMIT DROP`);
      const author = await tx.user.findFirstOrThrow({ select: { id: true } });
      const report = await tx.dailyWorkReport.create({ data: { authorId: author.id, workDate: new Date("2026-09-14T00:00:00.000Z"), mainContent: "" } });
      assert.equal(await tx.dailyWorkReport.count({ where: { submittedAt: { not: null } } }), 0);
      await tx.$executeRaw(Prisma.sql`SAVEPOINT duplicate_report`);
      await assert.rejects(tx.dailyWorkReport.create({ data: { authorId: author.id, workDate: report.workDate, mainContent: "duplicate" } }));
      await tx.$executeRaw(Prisma.sql`ROLLBACK TO SAVEPOINT duplicate_report`);
      await tx.$executeRaw(Prisma.sql`SAVEPOINT blank_report`);
      await assert.rejects(tx.dailyWorkReport.update({ where: { id: report.id }, data: { submittedAt: new Date() } }));
      await tx.$executeRaw(Prisma.sql`ROLLBACK TO SAVEPOINT blank_report`);
      assert.equal((await tx.dailyWorkReport.updateMany({
        where: { id: report.id, authorId: author.id, version: 1 },
        data: { mainContent: "주요 업무 내용", youthReports: [{ youthId: "test-youth", youthName: "검증 청소년", content: "활동과 대화" }], submittedAt: new Date(), version: { increment: 1 } },
      })).count, 1);
      assert.equal((await tx.dailyWorkReport.updateMany({ where: { id: report.id, version: 1 }, data: { mainContent: "stale overwrite" } })).count, 0);
      const stored = await tx.dailyWorkReport.findUniqueOrThrow({ where: { id: report.id } });
      assert.equal(stored.mainContent, "주요 업무 내용");
      assert.equal(stored.version, 2);
      assert.deepEqual(stored.youthReports, [{ youthId: "test-youth", youthName: "검증 청소년", content: "활동과 대화" }]);
    });
  } finally { await db.$disconnect(); }
});
