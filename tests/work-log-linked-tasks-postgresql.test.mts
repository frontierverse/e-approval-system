import assert from "node:assert/strict";
import { test } from "node:test";

// The workflow provisions this disposable PostgreSQL service before unit tests.
// Never load .env or open a connection while running this test locally.
const ciDatabaseUrl =
  "postgresql://postgres:postgres@127.0.0.1:5432/e_approval_test";

test("CI PostgreSQL groups completed tasks by Korean date with actual Prisma bindings", {
  skip: process.env.GITHUB_ACTIONS !== "true",
  timeout: 25_000,
}, async () => {
  if (
    process.env.DATABASE_URL !== ciDatabaseUrl ||
    process.env.DIRECT_URL !== ciDatabaseUrl
  ) {
    throw new Error("This integration test requires the disposable loopback CI database.");
  }

  const [{ Prisma, PrismaClient }, { PrismaPg }, { getWorkLogCompletedTaskDates }] =
    await Promise.all([
      import("../src/generated/prisma/client.ts"),
      import("@prisma/adapter-pg"),
      import("../src/lib/work-log-linked-tasks.ts"),
    ]);
  const database = new PrismaClient({
    adapter: new PrismaPg({ connectionString: ciDatabaseUrl, max: 1 }),
  });

  try {
    const columns = await database.$queryRaw<{
      data_type: string;
      datetime_precision: number;
    }[]>(Prisma.sql`
      SELECT data_type, datetime_precision
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'StaffTask'
        AND column_name = 'completedAt'
    `);
    assert.deepEqual(columns, [{
      data_type: "timestamp without time zone",
      datetime_precision: 3,
    }]);

    await database.$transaction(async (transaction) => {
      // pg_temp shadows the application table only in this transaction's session.
      // Every inserted row is synthetic and the temporary table drops at commit.
      await transaction.$executeRaw(Prisma.sql`
        CREATE TEMP TABLE "StaffTask" (
          "id" TEXT NOT NULL,
          "assigneeId" TEXT NOT NULL,
          "completedAt" TIMESTAMP(3),
          "deletedAt" TIMESTAMP(3)
        ) ON COMMIT DROP
      `);

      const tasks = [
        { id: "before-start", at: "2026-09-07T14:59:59.999Z" },
        { id: "at-start", at: "2026-09-07T15:00:00.000Z" },
        { id: "before-end", at: "2026-09-08T14:59:59.999Z" },
        { id: "at-end", at: "2026-09-08T15:00:00.000Z" },
        ...Array.from({ length: 30 }, (_, index) => ({
          id: `busy-day-${index}`,
          at: "2026-09-08T10:00:00.000Z",
        })),
        ...Array.from({ length: 14 }, (_, index) => ({
          id: `older-day-${index}`,
          at: new Date(Date.UTC(2026, 8, 7 - index, 3)).toISOString(),
        })),
      ];

      for (const task of tasks) {
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO "StaffTask" ("id", "assigneeId", "completedAt")
          VALUES (${task.id}, 'employee', ${new Date(task.at)})
        `);
      }

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "StaffTask" ("id", "assigneeId", "completedAt", "deletedAt")
        VALUES
          ('colleague', 'other-employee', '2026-08-01 03:00:00', NULL),
          ('deleted', 'employee', '2026-08-02 03:00:00', '2026-08-02 04:00:00'),
          ('pending', 'employee', NULL, NULL)
      `);

      const recentDates = Array.from({ length: 12 }, (_, index) =>
        new Date(Date.UTC(2026, 8, 8 - index)).toISOString().slice(0, 10),
      );

      for (const zone of ["UTC", "Asia/Seoul", "America/Los_Angeles"]) {
        await transaction.$queryRaw(Prisma.sql`
          SELECT set_config('TimeZone', ${zone}, true)
        `);
        assert.deepEqual(await getWorkLogCompletedTaskDates({
          authorId: "employee",
          startDate: "2026-09-08",
          endDate: "2026-09-08",
        }, transaction), ["2026-09-08"], `Korean midnight bounds in ${zone}`);
        assert.deepEqual(await getWorkLogCompletedTaskDates({
          authorId: "employee",
          endDate: "2026-09-08",
          limit: 12,
        }, transaction), recentDates, `Distinct recent days in ${zone}`);
        assert.deepEqual(await getWorkLogCompletedTaskDates({
          authorId: "employee",
          startDate: "2026-08-01",
          endDate: "2026-08-02",
        }, transaction), [], `Deleted and other employees' tasks in ${zone}`);
      }
    }, { timeout: 20_000 });
  } finally {
    await database.$disconnect();
  }
});
