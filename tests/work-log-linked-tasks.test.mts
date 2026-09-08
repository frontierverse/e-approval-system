import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";
import { getWorkLogContributionRange } from "../src/lib/work-log-core.ts";

// Prisma projections and SQL parameters deliberately have heterogeneous shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const harness = {
  currentUser: { id: "employee", role: "USER" } as Row | null,
  logs: [] as Row[],
  tasks: [] as Row[],
  reads: [] as Row[],
  audit: [] as Row[],
  invalidated: [] as string[],
  failTasks: false,
  failDates: false,
  scheduleState: { schedules: [], status: "ready" } as Row,
  prisma: {} as Row,
};

function valueEquals(left: unknown, right: unknown) {
  return left instanceof Date && right instanceof Date
    ? left.getTime() === right.getTime()
    : left === right;
}

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (Array.isArray(value) ? value : [value]).every((part: Row) => matches(row, part));
    if (key === "OR") return value.some((part: Row) => matches(row, part));
    if (key === "authorId_workDate") return matches(row, value);
    if (value === null || value instanceof Date || typeof value !== "object") return valueEquals(row[key], value);
    if ("not" in value && valueEquals(row[key], value.not)) return false;
    if ("in" in value && !value.in.some((candidate: unknown) => valueEquals(row[key], candidate))) return false;
    if ("gte" in value && !(row[key] !== null && row[key] >= value.gte)) return false;
    if ("lte" in value && !(row[key] !== null && row[key] <= value.lte)) return false;
    if ("gt" in value && !(row[key] !== null && row[key] > value.gt)) return false;
    if ("lt" in value && !(row[key] !== null && row[key] < value.lt)) return false;
    return true;
  });
}

function findMany(rows: Row[], options: Row): Row[] {
  const ordered = rows.filter((row) => matches(row, options.where)).slice();
  const orders = Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy ?? {}];
  ordered.sort((left, right) => {
    for (const order of orders) {
      for (const [field, direction] of Object.entries(order)) {
        const comparison = left[field] < right[field] ? -1 : left[field] > right[field] ? 1 : 0;
        if (comparison) return direction === "desc" ? -comparison : comparison;
      }
    }
    return 0;
  });
  return structuredClone(options.take === undefined ? ordered : ordered.slice(0, options.take));
}

const database = {
  workLog: {
    async findUnique(options: Row) {
      harness.reads.push({ model: "workLog", ...options });
      return structuredClone(harness.logs.find((row) => matches(row, options.where)) ?? null);
    },
    async findMany(options: Row) {
      harness.reads.push({ model: "workLog", ...options });
      return findMany(harness.logs, options);
    },
    async findFirst(options: Row) {
      harness.reads.push({ model: "workLog", ...options });
      return structuredClone(harness.logs.find((row) => matches(row, options.where)) ?? null);
    },
    async upsert(options: Row) {
      let record = harness.logs.find((row) => matches(row, options.where));
      if (record) {
        Object.assign(record, options.update, {
          updatedAt: new Date(record.updatedAt.getTime() + 1000),
          updatedBy: { name: "테스트 직원" },
        });
      } else {
        record = addLog({ ...options.create, createdAt: new Date(), updatedAt: new Date(), updatedBy: null });
      }
      return structuredClone(record);
    },
    async deleteMany(options: Row) {
      const previousCount = harness.logs.length;
      harness.logs = harness.logs.filter((row) => !matches(row, options.where));
      return { count: previousCount - harness.logs.length };
    },
  },
  auditLog: {
    async create({ data }: Row) {
      harness.audit.push(structuredClone(data));
      return data;
    },
  },
  staffTask: {
    async findMany(options: Row) {
      harness.reads.push({ model: "staffTask", ...options });
      if (harness.failTasks) throw new Error("Completed tasks unavailable");
      return findMany(harness.tasks, options);
    },
  },
  async $queryRaw(query: Row) {
    harness.reads.push({ model: "taskDates", query });
    if (harness.failDates) throw new Error("Completion dates unavailable");
    const sql = query.sql as string;
    const values = query.values as unknown[];
    assert.match(sql, /"assigneeId"\s*=/);
    assert.match(sql, /"deletedAt"\s+IS\s+NULL/i);
    assert.match(sql, /"completedAt"\s+IS\s+NOT\s+NULL/i);
    assert.match(sql, /Asia\/Seoul/);
    assert.doesNotMatch(sql, /employee|colleague/);
    const authorId = values.find((value) => typeof value === "string");
    const dates = values.filter((value): value is Date => value instanceof Date).sort((a, b) => a.getTime() - b.getTime());
    const upper = dates.at(-1);
    assert.ok(upper, "A completion upper bound is required");
    const lower = dates.length > 1 ? dates[0] : null;
    const rows = harness.tasks.filter((row) => row.assigneeId === authorId && row.deletedAt === null
      && row.completedAt instanceof Date && row.completedAt < upper && (!lower || row.completedAt >= lower));
    const dayStrings = [...new Set(rows.map((row) => new Date(row.completedAt.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)))].sort().reverse();
    const limit = values.find((value): value is number => typeof value === "number");
    return (limit === undefined ? dayStrings : dayStrings.slice(0, limit)).map((workDate) => ({ workDate }));
  },
  async $transaction(operation: (transaction: Row) => Promise<unknown>) {
    const previousLogs = structuredClone(harness.logs);
    const previousAudit = structuredClone(harness.audit);
    try { return await operation(database); }
    catch (error) {
      harness.logs = previousLogs;
      harness.audit = previousAudit;
      throw error;
    }
  },
};
harness.prisma = database;

const harnessKey = "__workLogCompletedTaskHarness";
(globalThis as Row)[harnessKey] = harness;
const mockModule = moduleUrl(`
const h = globalThis.${harnessKey};
export const prisma = h.prisma;
export async function getCurrentUser() { return h.currentUser; }
export async function requireUser() { if (!h.currentUser) throw new Error("Unauthenticated"); return h.currentUser; }
export async function getCurrentAuditLogRequestData() { return {}; }
export function revalidatePath(path) { h.invalidated.push(path); }
export async function getWorkLogLinkedScheduleLoadState() { return h.scheduleState; }
`);
const aliases = {
  "@/lib/prisma": mockModule,
  "@/lib/auth": mockModule,
  "@/lib/audit-log-request": mockModule,
  "next/cache": mockModule,
  "@/lib/work-log-linked-schedules": mockModule,
};
const queryModule = compileModule("../src/lib/work-logs.ts", aliases);
const queries = await import(queryModule);
const route = await import(compileModule("../src/app/api/work-logs/[date]/route.ts", { ...aliases, "@/lib/work-logs": queryModule }));
const actions = await import(compileModule("../src/app/work-schedule/work-log/actions.ts", { ...aliases, "@/lib/work-logs": queryModule }));

function moduleUrl(source: string) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

function compileModule(path: string, replacements: Record<string, string>) {
  let source = readFileSync(new URL(path, import.meta.url), "utf8");
  for (const [specifier, replacement] of Object.entries(replacements)) source = source.replaceAll(`"${specifier}"`, JSON.stringify(replacement));
  return moduleUrl(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}

function addTask(overrides: Row = {}) {
  const task = {
    id: `task-${harness.tasks.length + 1}`,
    title: "회의 자료 정리",
    description: "지난 회의 자료를 정리했습니다.\n최종본 확인 완료",
    meetingTitle: "운영 회의",
    assigneeId: "employee",
    assignee: { name: "테스트 직원" },
    completedAt: new Date("2026-09-08T01:00:00.000Z"),
    createdAt: new Date("2026-09-01T01:00:00.000Z"),
    updatedAt: new Date("2026-09-08T01:00:00.000Z"),
    dueDate: new Date("2026-09-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
  harness.tasks.push(task);
  return task;
}

function addLog(overrides: Row = {}) {
  const record = {
    id: `manual-${harness.logs.length + 1}`,
    authorId: "employee",
    author: { name: "테스트 직원" },
    workDate: new Date("2026-09-08T00:00:00.000Z"),
    content: "직접 작성한 상세 내용\n이 문장을 보존합니다.",
    keyword: "직접 입력",
    createdAt: new Date("2026-09-08T00:00:00.000Z"),
    updatedAt: new Date("2026-09-08T00:30:00.000Z"),
    updatedBy: { name: "테스트 직원" },
    ...overrides,
  };
  harness.logs.push(record);
  return record;
}

async function entry(workDate = "2026-09-08", authorId = "employee") {
  return queries.getWorkLogEntry({ authorId, workDate }, database);
}

async function page(overrides: Row = {}) {
  return queries.getWorkLogPageData({ authorId: "employee", selectedDate: "2026-09-08", today: "2026-09-08", ...overrides }, database);
}

beforeEach(() => {
  harness.currentUser = { id: "employee", role: "USER" };
  harness.logs = [];
  harness.tasks = [];
  harness.reads = [];
  harness.audit = [];
  harness.invalidated = [];
  harness.failTasks = false;
  harness.failDates = false;
  harness.scheduleState = { schedules: [], status: "ready" };
});
after(() => { delete (globalThis as Row)[harnessKey]; });

describe("completed tasks automatically appear on the employee's work log", () => {
  test("uses completion time at both Seoul midnight boundaries instead of assignment or due date", async () => {
    addTask({ id: "previous-day", completedAt: new Date("2026-09-07T14:59:59.999Z") });
    addTask({ id: "first-millisecond", completedAt: new Date("2026-09-07T15:00:00.000Z") });
    addTask({ id: "last-millisecond", completedAt: new Date("2026-09-08T14:59:59.999Z") });
    addTask({ id: "following-day", completedAt: new Date("2026-09-08T15:00:00.000Z") });
    const current = await entry();
    assert.equal(current.workDate, "2026-09-08");
    assert.deepEqual(current.completedTasks.map((task: Row) => task.id).sort(), ["first-millisecond", "last-millisecond"]);
    assert.deepEqual((await entry("2026-09-07")).completedTasks.map((task: Row) => task.id), ["previous-day"]);
    assert.deepEqual((await entry("2026-09-09")).completedTasks.map((task: Row) => task.id), ["following-day"]);
    assert.equal(await entry("2026-09-01"), null);
  });

  test("creates an automatic entry without writing a manual work log", async () => {
    const task = addTask();
    const result = await entry();
    assert.ok(result);
    assert.equal(result.manualLogId, null);
    assert.equal(result.manualUpdatedAt, null);
    assert.equal(result.authorName, "테스트 직원");
    assert.equal(result.completedTasks.length, 1);
    assert.equal(result.completedTasks[0].id, task.id);
    assert.equal(result.completedTasks[0].description, task.description);
    assert.equal(result.completedTasks[0].completedAt, task.completedAt.toISOString());
    assert.equal(harness.logs.length, 0);
    assert.equal((await entry()).id, result.id, "Automatic entries have a stable daily identity");
  });

  test("never merges another employee's work or a pending or deleted task", async () => {
    addTask({ id: "own" });
    addTask({ id: "other", assigneeId: "colleague", title: "PRIVATE TASK" });
    addTask({ id: "pending", completedAt: null });
    addTask({ id: "deleted", deletedAt: new Date("2026-09-08T03:00:00Z") });
    addLog({ authorId: "colleague", content: "PRIVATE MANUAL LOG" });
    const result = await entry();
    assert.deepEqual(result.completedTasks.map((task: Row) => task.id), ["own"]);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
    for (const read of harness.reads.filter((read) => read.model === "staffTask")) {
      assert.equal(read.where.assigneeId, "employee");
      assert.equal(read.where.deletedAt, null);
    }
  });

  test("removes reopened work and records recompletion only on the new checked day", async () => {
    const task = addTask();
    assert.equal((await entry()).completedTasks.length, 1);
    task.completedAt = null;
    assert.equal(await entry(), null);
    task.completedAt = new Date("2026-09-08T15:30:00Z");
    assert.equal(await entry(), null);
    assert.deepEqual((await entry("2026-09-09")).completedTasks.map((task: Row) => task.id), [task.id]);
  });

  test("soft deletion removes only the linked task and keeps manually entered content", async () => {
    const task = addTask();
    const manual = addLog();
    assert.equal((await entry()).completedTasks.length, 1);
    task.deletedAt = new Date("2026-09-08T02:00:00Z");
    const result = await entry();
    assert.deepEqual(result.completedTasks, []);
    assert.equal(result.content, manual.content);
    assert.equal(result.manualLogId, manual.id);
  });

  test("preserves manual text and its concurrency token when later task completions are linked", async () => {
    const manual = addLog();
    addTask({ id: "first", completedAt: new Date("2026-09-08T02:00:00Z") });
    addTask({ id: "second", completedAt: new Date("2026-09-08T03:00:00Z") });
    const result = await entry();
    assert.equal(result.id, manual.id);
    assert.equal(result.manualLogId, manual.id);
    assert.equal(result.manualUpdatedAt, manual.updatedAt.toISOString());
    assert.equal(result.keyword, manual.keyword);
    assert.equal(result.content, manual.content);
    assert.equal(result.completedTasks.length, 2);
    const repeated = await entry();
    assert.deepEqual(repeated, result);
    assert.equal(harness.logs.length, 1);
  });

  test("does not silently turn failed automatic task reads into an empty or manual-only day", async () => {
    addLog();
    harness.failTasks = true;
    await assert.rejects(() => entry(), /Completed tasks unavailable/);
    await assert.rejects(() => page(), /Completed tasks unavailable/);
  });
});

describe("automatic work-log dates and recent records", () => {
  test("merges each recorded day once in the grass graph and the recent list", async () => {
    addLog();
    addTask({ id: "same-day-one" });
    addTask({ id: "same-day-two" });
    addTask({ id: "older", completedAt: new Date("2026-09-06T16:00:00Z") });
    addTask({ id: "private", assigneeId: "colleague", completedAt: new Date("2026-09-05T16:00:00Z") });
    const result = await page();
    assert.deepEqual([...result.contributionDates].sort(), ["2026-09-07", "2026-09-08"]);
    assert.deepEqual(result.recentLogs.map((log: Row) => log.workDate), ["2026-09-08", "2026-09-07"]);
    assert.equal(result.recentLogs[0].completedTasks.length, 2);
    assert.equal(result.recentLogs[1].manualLogId, null);
    assert.deepEqual(result.selectedLog, result.recentLogs[0]);
  });

  test("limits recent records by twelve distinct days without losing days behind many same-day tasks", async () => {
    for (let index = 0; index < 35; index += 1) addTask({ id: `same-day-${index}` });
    for (let offset = 1; offset <= 16; offset += 1) {
      const completion = new Date(Date.UTC(2026, 8, 8 - offset, 1));
      addTask({ completedAt: completion });
      if (offset % 2 === 0) addLog({ workDate: new Date(Date.UTC(2026, 8, 8 - offset)) });
    }
    const result = await page();
    assert.equal(result.recentLogs.length, 12);
    assert.deepEqual(result.recentLogs.map((log: Row) => log.workDate), Array.from({ length: 12 }, (_, offset) => new Date(Date.UTC(2026, 8, 8 - offset)).toISOString().slice(0, 10)));
    assert.equal(result.recentLogs[0].completedTasks.length, 35);
    assert.equal(new Set(result.recentLogs.map((log: Row) => log.workDate)).size, 12);
  });

  test("keeps old selected records available outside the recent list and annual grass range", async () => {
    addTask({ id: "old", completedAt: new Date("2024-01-01T01:00:00Z") });
    for (let day = 1; day <= 13; day += 1) addTask({ completedAt: new Date(Date.UTC(2026, 7, day, 1)) });
    const result = await page({ selectedDate: "2024-01-01" });
    assert.equal(result.selectedLog.completedTasks[0].id, "old");
    assert.equal(result.recentLogs.length, 12);
    assert.ok(!result.recentLogs.some((log: Row) => log.workDate === "2024-01-01"));
    assert.ok(!result.contributionDates.includes("2024-01-01"));
  });

  test("includes the first annual Seoul day and excludes future completions", async () => {
    const { startDate } = getWorkLogContributionRange("2026-09-08");
    const firstInstant = new Date(`${startDate}T00:00:00+09:00`);
    addTask({ id: "outside-range", completedAt: new Date(firstInstant.getTime() - 1) });
    addTask({ id: "range-start", completedAt: firstInstant });
    addTask({ id: "today-end", completedAt: new Date("2026-09-08T14:59:59.999Z") });
    addTask({ id: "future", completedAt: new Date("2026-09-08T15:00:00Z") });
    const result = await page();
    assert.deepEqual([...result.contributionDates].sort(), [startDate, "2026-09-08"]);
    assert.ok(result.recentLogs.every((log: Row) => log.workDate <= "2026-09-08"));
  });

  test("surfaces grouped date query errors while optional schedule errors remain isolated", async () => {
    addTask();
    harness.scheduleState = { status: "error" };
    const result = await page();
    assert.equal(result.linkedScheduleState.status, "error");
    assert.equal(result.selectedLog.completedTasks.length, 1);
    harness.failDates = true;
    await assert.rejects(() => page(), /Completion dates unavailable/);
  });
});

describe("completed-task work-log detail API", () => {
  const request = () => new Request("https://example.test/api/work-logs/2026-09-08?authorId=colleague");
  const context = (date = "2026-09-08") => ({ params: Promise.resolve({ date }) });

  test("returns 200 for an automatic-only day using the authenticated employee scope", async () => {
    addTask({ id: "mine" });
    addTask({ id: "private", assigneeId: "colleague", title: "PRIVATE TASK" });
    const response = await route.GET(request(), context());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const payload = await response.json();
    assert.equal(payload.entry.manualLogId, null);
    assert.deepEqual(payload.entry.completedTasks.map((task: Row) => task.id), ["mine"]);
    assert.doesNotMatch(JSON.stringify(payload), /PRIVATE/);
  });

  test("rejects unauthenticated and invalid dates before reading private work", async () => {
    harness.currentUser = null;
    assert.equal((await route.GET(request(), context())).status, 401);
    assert.equal(harness.reads.length, 0);
    harness.currentUser = { id: "employee", role: "USER" };
    for (const date of ["2026-02-30", "9999-12-31"]) assert.equal((await route.GET(request(), context(date))).status, 400);
    assert.equal(harness.reads.length, 0);
    assert.equal((await route.GET(request(), context())).status, 404);
  });

  test("returns a recoverable 503 instead of falsely reporting a missing automatic day", async () => {
    addTask();
    harness.failTasks = true;
    const originalError = console.error;
    console.error = () => undefined;
    try {
      const response = await route.GET(request(), context());
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.ok((await response.json()).error);
    } finally { console.error = originalError; }
  });
});

describe("manual work-log actions preserve linked completions", () => {
  function form(overrides: Row = {}) {
    const values = new FormData();
    for (const [key, value] of Object.entries({ workDate: "2026-09-08", keyword: "추가 메모", content: "직접 입력한 내용", expectedUpdatedAt: "", ...overrides })) values.set(key, String(value));
    return values;
  }

  test("adds a manual note to an automatic day and returns both without changing the task", async () => {
    addTask();
    const before = structuredClone(harness.tasks);
    const result = await actions.saveWorkLogAction({}, form());
    assert.ok(result.success, result.error);
    assert.equal(result.entry.completedTasks.length, 1);
    assert.equal(result.entry.content, "직접 입력한 내용");
    assert.equal(result.entry.manualLogId, harness.logs[0].id);
    assert.equal(result.entry.manualUpdatedAt, harness.logs[0].updatedAt.toISOString());
    assert.deepEqual(harness.tasks, before);
    assert.equal(harness.audit.length, 1);
  });

  test("an unchanged save returns new automatic completions without changing the manual concurrency token", async () => {
    addTask({ id: "first" });
    const saved = await actions.saveWorkLogAction({}, form());
    assert.ok(saved.success, saved.error);
    const expectedUpdatedAt = saved.entry.manualUpdatedAt;
    addTask({ id: "later", completedAt: new Date("2026-09-08T12:00:00Z") });
    const unchanged = await actions.saveWorkLogAction({}, form({ expectedUpdatedAt }));
    assert.ok(unchanged.success, unchanged.error);
    assert.deepEqual(unchanged.entry.completedTasks.map((task: Row) => task.id), ["first", "later"]);
    assert.equal(unchanged.entry.manualUpdatedAt, expectedUpdatedAt);
    assert.equal(harness.audit.length, 1);
    const changed = await actions.saveWorkLogAction({}, form({ expectedUpdatedAt, content: "추가 수정" }));
    assert.ok(changed.success, changed.error);
    assert.equal(changed.entry.completedTasks.length, 2);
    assert.notEqual(changed.entry.manualUpdatedAt, expectedUpdatedAt);
    const stale = await actions.saveWorkLogAction({}, form({ expectedUpdatedAt, content: "오래된 창의 수정" }));
    assert.ok(stale.error);
    assert.equal(stale.conflictUpdatedAt, changed.entry.manualUpdatedAt);
    assert.equal(harness.logs[0].content, "추가 수정");
  });

  test("deleting a manual note leaves the automatic daily entry and completed task intact", async () => {
    const task = addTask();
    const manual = addLog();
    const deletion = await actions.deleteWorkLogAction({}, form({ workLogId: manual.id, expectedUpdatedAt: manual.updatedAt.toISOString() }));
    assert.equal(deletion.deletedId, manual.id, deletion.error);
    assert.equal(harness.logs.length, 0);
    const automatic = await entry();
    assert.equal(automatic.manualLogId, null);
    assert.deepEqual(automatic.completedTasks.map((completed: Row) => completed.id), [task.id]);
    assert.ok(harness.invalidated.includes("/work-schedule/work-log"));
  });

  test("rolls back a manual save if its combined task read fails inside the transaction", async () => {
    addTask();
    harness.failTasks = true;
    const originalError = console.error;
    console.error = () => undefined;
    try {
      const result = await actions.saveWorkLogAction({}, form());
      assert.ok(result.error);
      assert.equal(result.values.content, "직접 입력한 내용");
      assert.equal(harness.logs.length, 0);
      assert.equal(harness.audit.length, 0);
      assert.equal(harness.invalidated.length, 0);
    } finally { console.error = originalError; }
  });
});
