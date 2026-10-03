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

// Exercise the shared domain itself, not a parallel copy of its SQL or business rules.
// Every synthetic record and scoped test constraint is rolled back in the disposable CI DB.
test("CI PostgreSQL runs the shared daily-report domain with atomic audit, privacy and retention versions", {
  skip: process.env.GITHUB_ACTIONS !== "true", timeout: 30000,
}, async () => {
  if (process.env.DATABASE_URL !== ciDatabaseUrl || process.env.DIRECT_URL !== ciDatabaseUrl) throw new Error("Disposable CI database required");
  const [{ PrismaClient, Prisma }, { PrismaPg }, mutations, queries, { getWorkLogToday }] = await Promise.all([
    import("../src/generated/prisma/client.ts"), import("@prisma/adapter-pg"),
    import("../src/lib/daily-report-mutations.ts"), import("../src/lib/daily-report-queries.ts"), import("../src/lib/work-log-core.ts"),
  ]);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: ciDatabaseUrl, max: 1 }) });
  const rollbackFixture = new Error("daily-domain-fixture-rollback");
  let verified = false;
  try {
    await assert.rejects(db.$transaction(async tx => {
      const department = await tx.department.create({ data: { id: "ci-daily-domain-department", name: "검증 운영팀", code: "CI_DAILY_DOMAIN" } });
      const staffPosition = await tx.position.create({ data: { id: "ci-daily-domain-staff-position", name: "생활지도원", level: 1 } });
      const headPosition = await tx.position.create({ data: { id: "ci-daily-domain-head-position", name: "시설장", level: 2 } });
      const writer = await tx.user.create({ data: { id: "ci-daily-domain-writer", name: "검증 직원", departmentId: department.id, positionId: staffPosition.id } });
      const head = await tx.user.create({ data: { id: "ci-daily-domain-head", name: "검증 시설장", departmentId: department.id, positionId: headPosition.id } });
      const youth = await tx.youth.create({ data: { id: "ci-daily-domain-youth", name: "CI 일일보고 검증 청소년" } });
      const actor = await queries.getDailyReportActor(writer.id, tx), director = await queries.getDailyReportActor(head.id, tx);
      assert.ok(actor && director);
      // Nested domain operations share this isolated Serializable transaction. Savepoints
      // preserve the same rollback semantics while letting us inspect failures afterward.
      const store = { $transaction: async (operation: (db: typeof tx) => Promise<unknown>) => {
        await tx.$executeRaw(Prisma.sql`SAVEPOINT daily_report_domain_operation`);
        try {
          const value = await operation(tx);
          await tx.$executeRaw(Prisma.sql`RELEASE SAVEPOINT daily_report_domain_operation`);
          return value;
        } catch (error) {
          await tx.$executeRaw(Prisma.sql`ROLLBACK TO SAVEPOINT daily_report_domain_operation`);
          throw error;
        }
      } } as unknown as NonNullable<Parameters<typeof mutations.saveDailyReport>[0]["db"]>;
      const context = { actor, db: store, client: "mobile" as const };
      const workDate = getWorkLogToday();
      const values = { workDate, mainContent: "", youthReports: [] as { youthId: string; content: string }[] };
      const draft = await mutations.saveDailyReport(context, { values, version: 0, intent: "draft" });
      assert.equal(draft.version, 1);
      assert.equal(await queries.getDailyReportDetailForActor(director, draft.id, tx), null);
      const submitted = await mutations.saveDailyReport(context, { values: { ...values, mainContent: "주요 업무", youthReports: [{ youthId: youth.id, content: "관찰 기록" }] }, version: 1, intent: "submit" });
      const reviewed = await mutations.reviewDailyReport({ actor: director, db: store, client: "mobile" }, { id: draft.id, version: 2 });
      assert.equal(reviewed.version, 2); assert.ok(reviewed.reviewedAt);
      const corrected = await mutations.saveDailyReport(context, { values: { ...values, mainContent: "수정 업무", youthReports: [{ youthId: youth.id, content: "수정 기록" }] }, version: 2, intent: "submit" });
      assert.equal(corrected.version, 3); assert.equal(corrected.reviewedAt, null); assert.equal(corrected.submittedAt, submitted.submittedAt);
      await assert.rejects(mutations.reviewDailyReport({ actor: director, db: store, client: "mobile" }, { id: draft.id, version: 2 }), (error: unknown) => error instanceof mutations.DailyReportInputError && error.code === "REPORT_CONFLICT");
      const beforeAuditCount = await tx.auditLog.count({ where: { targetId: draft.id } });
      // Fixed fixture actor ID, scoped only to this rolled-back CI transaction.
      await tx.$executeRaw(Prisma.sql`ALTER TABLE "AuditLog" ADD CONSTRAINT "ci_daily_domain_audit_failure" CHECK ("actorId" <> 'ci-daily-domain-writer' OR "metadata"->>'changeType' <> 'dailyReport.submit') NOT VALID`);
      await assert.rejects(mutations.saveDailyReport(context, { values: { ...values, mainContent: "must rollback" }, version: 3, intent: "submit" }));
      assert.equal((await tx.dailyWorkReport.findUniqueOrThrow({ where: { id: draft.id } })).mainContent, "수정 업무");
      assert.equal((await tx.dailyWorkReport.findUniqueOrThrow({ where: { id: draft.id } })).version, 3);
      assert.equal(await tx.auditLog.count({ where: { targetId: draft.id } }), beforeAuditCount);
      await tx.$executeRaw(Prisma.sql`ALTER TABLE "AuditLog" DROP CONSTRAINT "ci_daily_domain_audit_failure"`);
      await tx.youth.update({ where: { id: youth.id }, data: { actualDischargeDate: workDate } });
      assert.deepEqual((await queries.getDailyReportDetailForActor(actor, draft.id, tx))!.youthReports, []);
      const retained = await mutations.saveDailyReport(context, { values: { ...values, mainContent: "보존 기록 제외 편집" }, version: 3, intent: "submit" });
      assert.deepEqual(retained.youthReports, []);
      assert.deepEqual((await tx.dailyWorkReport.findUniqueOrThrow({ where: { id: draft.id } })).youthReports, [{ youthId: youth.id, youthName: youth.name, content: "수정 기록" }]);
      // The real purge domain removes notes and increments this same report version.
      await tx.dailyWorkReport.update({ where: { id: draft.id }, data: { youthReports: [], version: { increment: 1 } } });
      await assert.rejects(mutations.saveDailyReport(context, { values: { ...values, mainContent: "stale restore", youthReports: [{ youthId: youth.id, content: "restore" }] }, version: 4, intent: "submit" }),
        (error: unknown) => error instanceof mutations.DailyReportInputError && error.code === "REPORT_CONFLICT");
      assert.deepEqual((await tx.dailyWorkReport.findUniqueOrThrow({ where: { id: draft.id } })).youthReports, []);
      verified = true;
      throw rollbackFixture;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 25000 }), (error: unknown) => error === rollbackFixture);
    assert.equal(verified, true);
  } finally { await db.$disconnect(); }
});
