import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";
import {
  getStaffTaskToday,
  isStaffTaskOverdue,
  isValidStaffTaskDate,
  normalizeStaffTaskFormValues,
  normalizeStaffTaskStatus,
  validateStaffTaskFormValues,
} from "../src/lib/staff-tasks-core.ts";

// This Prisma test double intentionally accepts heterogeneous query and result shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const harness = {
  currentUser: { id: "admin", role: "ADMIN" } as Row | null,
  tasks: [] as Row[],
  users: [
    { id: "employee", role: "USER", name: "직원", status: "ACTIVE", resignationDate: null, department: { name: "운영팀" } },
    { id: "second", role: "USER", name: "동료", status: "ACTIVE", resignationDate: null, department: { name: "운영팀" } },
    { id: "admin", role: "ADMIN", name: "관리자", status: "ACTIVE", resignationDate: null, department: { name: "관리팀" } },
    { id: "inactive", role: "USER", name: "비활성", status: "INACTIVE", resignationDate: null, department: { name: "운영팀" } },
    { id: "resigned", role: "USER", name: "퇴사자", status: "ACTIVE", resignationDate: "2020-01-01", department: { name: "운영팀" } },
  ],
  audit: [] as Row[],
  writes: [] as Row[],
  reads: [] as Row[],
  invalidated: [] as string[],
  failAudit: false,
  race: false,
  prisma: {} as Row,
};

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (Array.isArray(value) ? value : [value]).every((part) => matches(row, part));
    if (key === "OR") return value.some((part: Row) => matches(row, part));
    if (value === null || typeof value !== "object") return row[key] === value;
    if ("not" in value && row[key] === value.not) return false;
    if ("in" in value && !value.in.includes(row[key])) return false;
    if ("lt" in value && !(row[key] !== null && row[key] < value.lt)) return false;
    if ("gt" in value && !(row[key] !== null && row[key] > value.gt)) return false;
    if ("contains" in value && !String(row[key] ?? "").toLowerCase().includes(value.contains.toLowerCase())) return false;
    return true;
  });
}

const fakeTx = {
  staffTask: {
    async findUnique({ where }: Row) { return structuredClone(harness.tasks.find((row) => matches(row, where)) ?? null); },
    async findFirst({ where }: Row) {
      const row = harness.tasks.find((row) => matches(row, where));
      return row ? structuredClone({ ...row, assignee: harness.users.find(user => user.id === row.assigneeId) }) : null;
    },
    async create({ data }: Row) {
      const row = { id: `task-${harness.tasks.length + 1}`, completedAt: null, deletedAt: null, version: 0, createdAt: new Date(), updatedAt: new Date(), ...data };
      harness.tasks.push(row);
      harness.writes.push({ create: data });
      return structuredClone(row);
    },
    async updateMany({ where, data }: Row) {
      harness.writes.push({ where, data });
      if (harness.race) return { count: 0 };
      const row = harness.tasks.find((row) => matches(row, where));
      if (!row) return { count: 0 };
      Object.assign(row, { ...data, version: row.version + data.version.increment, updatedAt: new Date() });
      return { count: 1 };
    },
    async count({ where }: Row) {
      harness.reads.push({ where });
      return harness.tasks.filter((row) => matches(row, where)).length;
    },
    async findMany(options: Row) {
      harness.reads.push(options);
      return harness.tasks.filter((row) => matches(row, options.where)).slice(options.skip ?? 0, (options.skip ?? 0) + options.take).map((row) => ({
        ...row,
        assignee: harness.users.find((user) => user.id === row.assigneeId),
      }));
    },
  },
  user: {
    async findFirst({ where }: Row) { return harness.users.find((row) => matches(row, where)) ?? null; },
    async findMany({ where }: Row) { return harness.users.filter((row) => matches(row, where)); },
  },
  auditLog: {
    async count({ where }: Row) { return harness.audit.filter(row => matches(row, where)).length; },
    async findMany({ where, skip, take }: Row) {
      return harness.audit.filter(row => matches(row, where)).slice(skip, skip + take).map((row, index) => ({ ...row, id: `log-${index}`, createdAt: new Date(), actor: harness.users.find(user => user.id === row.actorId) }));
    },
    async create({ data }: Row) {
      if (harness.failAudit) throw new Error("simulated audit failure");
      harness.audit.push(data);
      return data;
    },
  },
};
harness.prisma = {
  ...fakeTx,
  async $transaction(operation: (tx: typeof fakeTx) => Promise<unknown>) {
    const previousTasks = structuredClone(harness.tasks);
    const previousAudit = structuredClone(harness.audit);
    try { return await operation(fakeTx); }
    catch (error) { harness.tasks = previousTasks; harness.audit = previousAudit; throw error; }
  },
};

const harnessKey = "__staffTaskRegressionHarness";
(globalThis as Row)[harnessKey] = harness;
const mockModule = moduleUrl(`
const h = globalThis.${harnessKey};
export const prisma = h.prisma;
export async function requireUser() { if (!h.currentUser) throw new Error("Unauthenticated"); return h.currentUser; }
export async function requireAdmin() { const user = await requireUser(); if (user.role !== "ADMIN") throw new Error("Forbidden"); return user; }
export function revalidatePath(path) { h.invalidated.push(path); }
export async function getCurrentAuditLogRequestData() { return {}; }
`);

const replacements: Record<string, string> = {
  "@/lib/prisma": mockModule,
  "@/lib/auth": mockModule,
  "next/cache": mockModule,
  "@/lib/audit-log-request": mockModule,
};
const queryModule = compileModule("../src/lib/staff-tasks.ts", replacements);
const queries = await import(queryModule);
const actions = await import(compileModule("../src/app/tasks/actions.ts", { ...replacements, "@/lib/staff-tasks": queryModule }));

function moduleUrl(source: string) { return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`; }
function compileModule(path: string, aliases: Record<string, string>) {
  let source = readFileSync(new URL(path, import.meta.url), "utf8");
  for (const [specifier, replacement] of Object.entries(aliases)) source = source.replaceAll(`"${specifier}"`, JSON.stringify(replacement));
  return moduleUrl(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}

function form(overrides: Row = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ title: "자료 정리", description: "확정 자료 업로드", meetingTitle: "팀 회의", dueDate: "9999-12-31", assigneeId: "employee", requestId: "request-1234567890", ...overrides })) data.set(key, String(value));
  return data;
}

async function create(overrides: Row = {}) {
  const result = await actions.createStaffTaskAction({}, form(overrides));
  assert.ok(result.savedTaskId, result.error);
  return harness.tasks.find((row) => row.id === result.savedTaskId)!;
}

beforeEach(() => {
  harness.currentUser = { id: "admin", role: "ADMIN" };
  harness.tasks = [];
  harness.audit = [];
  harness.writes = [];
  harness.reads = [];
  harness.invalidated = [];
  harness.failAudit = false;
  harness.race = false;
});
after(() => { delete (globalThis as Row)[harnessKey]; });

describe("staff task date and form rules", () => {
  test("accepts real calendar dates and rejects normalization of impossible dates", () => {
    assert.equal(isValidStaffTaskDate("2028-02-29"), true);
    for (const value of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-9-07", "0000-01-01", "2026-09-07T00:00:00Z"]) assert.equal(isValidStaffTaskDate(value), false, value);
  });
  test("uses Seoul midnight and considers the due date itself on time", () => {
    assert.equal(getStaffTaskToday(new Date("2026-09-07T15:01:00Z")), "2026-09-08");
    assert.equal(isStaffTaskOverdue({ dueDate: "2026-09-07", completedAt: null }, "2026-09-07"), false);
    assert.equal(isStaffTaskOverdue({ dueDate: "2026-09-06", completedAt: null }, "2026-09-07"), true);
    assert.equal(isStaffTaskOverdue({ dueDate: "2026-09-06", completedAt: "2026-09-07T00:00:00Z" }, "2026-09-07"), false);
    assert.equal(isStaffTaskOverdue({ dueDate: null, completedAt: null }, "2026-09-07"), false);
  });
  test("trims form values, accepts no deadline, and enforces field limits", () => {
    const values = normalizeStaffTaskFormValues(form({ title: "  자료 정리  ", dueDate: "" }));
    assert.equal(values.title, "자료 정리");
    assert.equal(validateStaffTaskFormValues(values), null);
    for (const [key, length] of [["title", 161], ["description", 2001], ["meetingTitle", 161]] as const) assert.ok(validateStaffTaskFormValues({ ...values, [key]: "가".repeat(length) }));
    assert.equal(normalizeStaffTaskStatus("unknown"), "pending");
  });
});

describe("staff task action authorization and persistence", () => {
  test("requires login and limits create/edit to administrators", async () => {
    harness.currentUser = null;
    await assert.rejects(() => actions.createStaffTaskAction({}, form()), /Unauthenticated/);
    harness.currentUser = { id: "employee", role: "USER" };
    assert.match((await actions.createStaffTaskAction({}, form())).error, /관리자/);
    assert.match((await actions.updateStaffTaskAction({}, form({ id: "task-1", version: 0 }))).error, /관리자/);
    assert.equal(harness.writes.length, 0);
  });
  test("creates once for repeated requests and rejects token reuse with changed input", async () => {
    const row = await create();
    assert.equal((await actions.createStaffTaskAction({}, form())).savedTaskId, row.id);
    assert.equal(harness.tasks.length, 1);
    assert.equal(harness.audit.length, 1);
    assert.match((await actions.createStaffTaskAction({}, form({ title: "다른 업무" }))).error, /이미 처리/);
    harness.currentUser = { id: "other-admin", role: "ADMIN" };
    assert.match((await actions.createStaffTaskAction({}, form())).error, /이미 처리/);
    assert.equal(harness.tasks.length, 1);
    for (const path of ["/", "/tasks", "/admin/tasks", "/work-schedule/work-log"]) assert.ok(harness.invalidated.includes(path));
  });
  test("preserves entered values after validation failure and rejects invalid assignees", async () => {
    const invalid = await actions.createStaffTaskAction({}, form({ dueDate: "2026-02-30" }));
    assert.match(invalid.error, /기한/);
    assert.equal(invalid.values.title, "자료 정리");
    for (const assigneeId of ["missing", "inactive", "resigned"]) assert.match((await actions.createStaffTaskAction({}, form({ assigneeId }))).error, /재직/);
    assert.equal(harness.tasks.length, 0);
    assert.ok((await create({ assigneeId: "admin" })).id);
  });
  test("records completion and reopen in the DB with server timestamps", async () => {
    const row = await create();
    harness.currentUser = { id: "employee", role: "USER" };
    const before = Date.now();
    assert.ok((await actions.setStaffTaskCompletedAction({ id: row.id, completed: true, version: 0 })).success);
    assert.ok(row.completedAt instanceof Date && row.completedAt.getTime() >= before);
    assert.equal(row.version, 1);
    assert.deepEqual(harness.writes.at(-1)?.where, { id: row.id, assigneeId: "employee", version: 0, deletedAt: null });
    assert.ok(harness.invalidated.includes("/work-schedule/work-log"));
    harness.invalidated = [];
    assert.ok((await actions.setStaffTaskCompletedAction({ id: row.id, completed: false, version: 1 })).success);
    assert.equal(row.completedAt, null);
    assert.equal(row.version, 2);
    assert.ok(harness.invalidated.includes("/work-schedule/work-log"));
    assert.equal(harness.audit.at(-1)?.metadata.changeType, "staffTask.reopen");
  });
  test("a repeated completion preserves the original completion day and adds no audit or write", async () => {
    const row = await create();
    harness.currentUser = { id: "employee", role: "USER" };
    assert.ok((await actions.setStaffTaskCompletedAction({ id: row.id, completed: true, version: 0 })).success);
    const completedAt = row.completedAt.toISOString();
    const writes = harness.writes.length;
    const audits = harness.audit.length;
    assert.ok((await actions.setStaffTaskCompletedAction({ id: row.id, completed: true, version: 1 })).success);
    assert.equal(row.completedAt.toISOString(), completedAt);
    assert.equal(row.version, 1);
    assert.equal(harness.writes.length, writes);
    assert.equal(harness.audit.length, audits);
    assert.ok((await actions.setStaffTaskCompletedAction({ id: row.id, completed: true, version: 0 })).error);
    assert.equal(row.completedAt.toISOString(), completedAt);
  });
  test("neither another employee nor an administrator can check someone else's work", async () => {
    const row = await create();
    const count = harness.writes.length;
    for (const user of [{ id: "second", role: "USER" }, { id: "admin", role: "ADMIN" }]) {
      harness.currentUser = user;
      assert.match((await actions.setStaffTaskCompletedAction({ id: row.id, completed: true, version: 0 })).error, /본인/);
    }
    assert.equal(harness.writes.length, count);
    assert.equal(harness.tasks[0].completedAt, null);
  });
  test("rejects stale completion and failed conditional updates", async () => {
    const row = await create();
    harness.currentUser = { id: "employee", role: "USER" };
    assert.match((await actions.setStaffTaskCompletedAction({ id: row.id, completed: true, version: 2 })).error, /변경/);
    harness.race = true;
    assert.match((await actions.setStaffTaskCompletedAction({ id: row.id, completed: true, version: 0 })).error, /변경/);
    assert.equal(harness.tasks[0].completedAt, null);
    assert.equal(harness.audit.length, 1);
  });
  test("rejects malformed direct action requests", async () => {
    for (const input of [null, { id: "task-1", completed: "yes", version: 0 }, { id: "task-1", completed: true, version: -1 }, { id: "task-1", completed: true, version: 0.5 }, { id: "task-1", completed: true, version: 2147483647 }]) assert.match((await actions.setStaffTaskCompletedAction(input)).error, /확인/);
    assert.equal(harness.writes.length, 0);
  });
  test("admin reassignment invalidates an old owner's checkbox and stale edits", async () => {
    const row = await create();
    assert.ok((await actions.updateStaffTaskAction({}, form({ id: row.id, version: 0, assigneeId: "second" }))).success);
    assert.deepEqual(harness.writes.at(-1)?.where, { id: row.id, version: 0, deletedAt: null });
    assert.match((await actions.updateStaffTaskAction({}, form({ id: row.id, version: 0, title: "덮어쓰기" }))).error, /변경/);
    harness.currentUser = { id: "employee", role: "USER" };
    assert.match((await actions.setStaffTaskCompletedAction({ id: row.id, completed: true, version: 0 })).error, /본인/);
    assert.equal(harness.tasks[0].assigneeId, "second");
    assert.equal(harness.tasks[0].completedAt, null);
  });
  test("prevents reassignment of completed work", async () => {
    const row = await create();
    harness.currentUser = { id: "employee", role: "USER" };
    await actions.setStaffTaskCompletedAction({ id: row.id, completed: true, version: 0 });
    harness.currentUser = { id: "admin", role: "ADMIN" };
    assert.match((await actions.updateStaffTaskAction({}, form({ id: row.id, version: 1, assigneeId: "second" }))).error, /완료한/);
    assert.equal(harness.tasks[0].assigneeId, "employee");
  });
  test("rolls back saved work if its audit cannot be recorded and preserves the form", async () => {
    harness.failAudit = true;
    const originalError = console.error;
    console.error = () => undefined;
    try {
      const result = await actions.createStaffTaskAction({}, form());
      assert.match(result.error, /등록하지 못/);
      assert.equal(result.values.title, "자료 정리");
      assert.equal(harness.tasks.length, 0);
      assert.equal(harness.invalidated.length, 0);
    } finally { console.error = originalError; }
  });
});

describe("staff task query privacy", () => {
  test("scopes every personal list, dashboard, and count to the signed-in employee", async () => {
    await create();
    await create({ requestId: "second-request-123456", assigneeId: "second", title: "비공개 업무" });
    harness.currentUser = { id: "employee", role: "USER" };
    const personal = await queries.getMyStaffTasks();
    assert.equal(personal.tasks.length, 1);
    assert.equal(personal.tasks[0].title, "자료 정리");
    assert.deepEqual(personal.counts, { pending: 1, completed: 0, overdue: 0, deleted: 0 });
    const dashboard = await queries.getMyStaffTaskDashboard();
    assert.deepEqual(dashboard.tasks.map((row: Row) => row.assigneeId), ["employee"]);
    for (const read of harness.reads) assert.match(JSON.stringify(read.where), /"assigneeId":"employee"/);
    assert.deepEqual(harness.reads.filter((read) => read.take).slice(-2).map((read) => read.take), [5, 3]);
  });
  test("rejects staff access to every administrative query", async () => {
    harness.currentUser = { id: "employee", role: "USER" };
    await assert.rejects(() => queries.getAdminStaffTasks(), /Forbidden/);
    await assert.rejects(() => queries.getStaffTaskAssignees(), /Forbidden/);
    await assert.rejects(() => queries.getStaffTaskEmployeeSummaries(), /Forbidden/);
  });
  test("admin counts retain assignee and search scope before applying completion status", async () => {
    const completed = await create();
    completed.completedAt = new Date();
    await create({ requestId: "second-request-123456", assigneeId: "second", title: "비공개 업무" });
    await create({ requestId: "third-request-123456", title: "다른 회의 업무", description: "별도 논의", meetingTitle: "다른 회의" });
    const result = await queries.getAdminStaffTasks({ assigneeId: "employee", query: "자료", status: "pending", page: 999 });
    assert.deepEqual(result.counts, { pending: 0, completed: 1, overdue: 0, deleted: 0 });
    assert.equal(result.total, 0);
    assert.equal(result.page, 1);
    assert.equal(result.tasks.length, 0);
    const all = await queries.getAdminStaffTasks();
    assert.equal(all.total, 3);
    assert.equal(all.tasks.length, 3);
  });
  test("assignment options include active admins and exclude inactive and resigned users", async () => {
    assert.deepEqual((await queries.getStaffTaskAssignees()).map((row: Row) => row.id), ["employee", "second", "admin"]);
  });
});

test("staff task migration protects direct API access and concurrent versions", () => {
  const migration = readFileSync(new URL("../prisma/migrations-postgresql/20260907120000_add_staff_tasks/migration.sql", import.meta.url), "utf8");
  assert.match(migration, /ALTER TABLE "StaffTask" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /CREATE UNIQUE INDEX "StaffTask_requestId_key"/);
  assert.match(migration, /CHECK \("version" >= 0\)/);
  assert.match(migration, /ON DELETE RESTRICT ON UPDATE CASCADE/);
});

describe("personal task creation, deletion, and history", () => {
  test("history paginates and preserves older messages without inventing snapshots", async () => {
    const row = await create();
    for (let index = 0; index < 24; index += 1) harness.audit.push({ targetType: "StaffTask", targetId: row.id, actorId: "admin", message: "이전 기록", metadata: null });
    harness.currentUser = { id: "employee", role: "USER" };
    const first = await queries.getStaffTaskHistory(row.id);
    assert.equal(first.total, 25);
    assert.equal(first.logs.length, 20);
    const last = await queries.getStaffTaskHistory(row.id, 999);
    assert.equal(last.page, 2);
    assert.equal(last.logs.length, 5);
    assert.equal(last.logs[0].metadata, null);
    harness.currentUser = null;
    await assert.rejects(() => queries.getStaffTaskHistory(row.id), /Unauthenticated/);
  });
  test("self creation fixes assignee to the signed-in employee and remains idempotent", async () => {
    harness.currentUser = { id: "employee", role: "USER" };
    const result = await actions.createMyStaffTaskAction({}, form({ assigneeId: "second" }));
    assert.ok(result.success);
    assert.equal(harness.tasks[0].assigneeId, "employee");
    assert.equal(harness.tasks[0].createdById, "employee");
    assert.ok((await actions.createMyStaffTaskAction({}, form({ assigneeId: "admin" }))).success);
    assert.equal(harness.tasks.length, 1);
    assert.equal(harness.audit.length, 1);
    assert.equal(harness.audit[0].metadata.before, null);
    assert.equal(harness.audit[0].metadata.after.title, "자료 정리");
  });
  test("deletion preserves completed work and records before/after once", async () => {
    const row = await create();
    harness.currentUser = { id: "employee", role: "USER" };
    await actions.setStaffTaskCompletedAction({ id: row.id, completed: true, version: 0 });
    const completedAt = row.completedAt.toISOString();
    harness.invalidated = [];
    assert.ok((await actions.deleteMyStaffTaskAction({ id: row.id, version: 1 })).success);
    assert.equal(harness.tasks.length, 1);
    assert.equal(row.completedAt.toISOString(), completedAt);
    assert.ok(row.deletedAt instanceof Date);
    assert.equal(row.version, 2);
    assert.ok(harness.invalidated.includes("/work-schedule/work-log"));
    const audit = harness.audit.at(-1)!;
    assert.equal(audit.actorId, "employee");
    assert.equal(audit.metadata.before.deletedAt, null);
    assert.equal(audit.metadata.after.deletedAt, row.deletedAt.toISOString());
    assert.equal(audit.metadata.after.completedAt, completedAt);
    assert.ok((await actions.deleteMyStaffTaskAction({ id: row.id, version: 1 })).success);
    assert.equal(harness.audit.length, 3);
    assert.ok((await actions.setStaffTaskCompletedAction({ id: row.id, version: 2, completed: false })).error);
    harness.currentUser = { id: "admin", role: "ADMIN" };
    assert.match((await actions.updateStaffTaskAction({}, form({ id: row.id, version: 2 }))).error, /삭제/);
  });
  test("denies deletion by others, malformed input, stale versions and concurrent changes", async () => {
    const row = await create();
    for (const user of [{ id: "second", role: "USER" }, { id: "admin", role: "ADMIN" }]) {
      harness.currentUser = user;
      assert.match((await actions.deleteMyStaffTaskAction({ id: row.id, version: 0 })).error, /본인/);
    }
    harness.currentUser = { id: "employee", role: "USER" };
    for (const input of [null, { id: row.id, version: -1 }, { id: row.id, version: 0.5 }]) assert.ok((await actions.deleteMyStaffTaskAction(input)).error);
    assert.match((await actions.deleteMyStaffTaskAction({ id: row.id, version: 1 })).error, /변경/);
    harness.race = true;
    assert.match((await actions.deleteMyStaffTaskAction({ id: row.id, version: 0 })).error, /변경/);
    assert.equal(harness.tasks[0].deletedAt, null);
    assert.equal(harness.audit.length, 1);
  });
  test("audit failure rolls back deletion", async () => {
    const row = await create();
    harness.currentUser = { id: "employee", role: "USER" };
    harness.failAudit = true;
    const original = console.error;
    console.error = () => undefined;
    try { assert.ok((await actions.deleteMyStaffTaskAction({ id: row.id, version: 0 })).error); }
    finally { console.error = original; }
    assert.equal(harness.tasks[0].deletedAt, null);
    assert.equal(harness.tasks[0].version, 0);
    assert.equal(harness.audit.length, 1);
  });
  test("deleted tasks leave active counts and lists but remain in authorized history", async () => {
    const row = await create({ dueDate: "2020-01-01" });
    await create({ assigneeId: "second", requestId: "another-request-12345" });
    harness.currentUser = { id: "employee", role: "USER" };
    await actions.deleteMyStaffTaskAction({ id: row.id, version: 0 });
    for (const status of ["all", "pending", "overdue", "completed"]) {
      const result = await queries.getMyStaffTasks({ status });
      assert.equal(result.tasks.length, 0);
      assert.deepEqual(result.counts, { pending: 0, completed: 0, overdue: 0, deleted: 1 });
    }
    assert.equal((await queries.getMyStaffTaskDashboard()).tasks.length, 0);
    assert.equal((await queries.getMyStaffTasks({ status: "deleted" })).tasks[0].id, row.id);
    assert.equal((await queries.getStaffTaskHistory(row.id)).logs.length, 2);
    harness.currentUser = { id: "second", role: "USER" };
    assert.equal(await queries.getStaffTaskHistory(row.id), null);
    assert.equal((await queries.getMyStaffTasks({ status: "deleted" })).total, 0);
    harness.currentUser = { id: "admin", role: "ADMIN" };
    assert.equal((await queries.getStaffTaskHistory(row.id)).task.deletedAt, harness.tasks[0].deletedAt.toISOString());
    assert.equal((await queries.getAdminStaffTasks({ status: "deleted" })).total, 1);
  });
  test("update and completion snapshots preserve actual previous values", async () => {
    const row = await create();
    await actions.updateStaffTaskAction({}, form({ id: row.id, version: 0, title: "수정한 업무", dueDate: "2026-09-08" }));
    const edit = harness.audit.at(-1)!.metadata;
    assert.equal(edit.before.title, "자료 정리");
    assert.equal(edit.after.title, "수정한 업무");
    assert.equal(edit.before.dueDate, "9999-12-31");
    assert.equal(edit.after.dueDate, "2026-09-08");
    harness.currentUser = { id: "employee", role: "USER" };
    await actions.setStaffTaskCompletedAction({ id: row.id, version: 1, completed: true });
    await actions.setStaffTaskCompletedAction({ id: row.id, version: 2, completed: false });
    const reopen = harness.audit.at(-1)!.metadata;
    assert.ok(reopen.before.completedAt);
    assert.equal(reopen.after.completedAt, null);
  });
});
