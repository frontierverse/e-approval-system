import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";
import { Prisma } from "../src/generated/prisma/client.ts";
import { getStaffTaskToday } from "../src/lib/staff-tasks-core.ts";

// Execute actual routes, Bearer authentication, shared queries/mutations and history mapping.
// Only database transactions, web cookie authentication and cache effects are isolated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const harnessKey = "__mobileStaffTaskHarness";
const token = "a".repeat(43);
const state: Row = { tasks: [], audit: [], users: [], queries: [], writes: [], invalidated: [] };
let serial: Promise<unknown> = Promise.resolve();
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (Array.isArray(value) ? value : [value]).every((part: Row) => matches(row, part));
    if (key === "OR") return value.some((part: Row) => matches(row, part));
    if (value === null || typeof value !== "object") return row[key] === value;
    if ("not" in value && row[key] === value.not) return false;
    if ("in" in value && !value.in.includes(row[key])) return false;
    if ("lt" in value && !(row[key] !== null && row[key] < value.lt)) return false;
    if ("gt" in value && !(row[key] !== null && row[key] > value.gt)) return false;
    return true;
  });
}
function select(row: Row, fields?: Row): Row {
  if (!fields) return structuredClone(row);
  return Object.fromEntries(Object.entries(fields).filter(([, rule]) => rule).map(([key, rule]) => [key, rule === true ? row[key] : select(row[key], rule.select)]));
}
function ordered(rows: Row[], orders: Row[] = []) {
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const key = Object.keys(order)[0]!;
      const direction = typeof order[key] === "string" ? order[key] : order[key].sort;
      const left = a[key], right = b[key];
      if (left === right) continue;
      if (left === null || right === null) {
        const nulls = typeof order[key] === "object" ? order[key].nulls : direction === "asc" ? "last" : "first";
        return left === null ? nulls === "first" ? -1 : 1 : nulls === "first" ? 1 : -1;
      }
      const delta = left instanceof Date ? left.getTime() - right.getTime() : String(left).localeCompare(String(right));
      if (delta) return direction === "desc" ? -delta : delta;
    }
    return 0;
  });
}
function knownError(code: string) { return new Prisma.PrismaClientKnownRequestError("private database operation secret", { code, clientVersion: "7.10.0" }); }
function database(view: Row) {
  const taskRow = (row: Row) => ({ ...row, assignee: state.users.find((person: Row) => person.id === row.assigneeId) });
  return {
    staffTask: {
      async findUnique(input: Row) { state.queries.push(["unique", input]); return view.tasks.find((row: Row) => matches(row, input.where)) ? select(view.tasks.find((row: Row) => matches(row, input.where)), input.select) : null; },
      async findFirst(input: Row) {
        state.queries.push(["task", input]);
        if (state.failRead) throw new Error("private database row secret");
        const row = view.tasks.find((item: Row) => matches(item, input.where));
        return row ? select(taskRow(row), input.select) : null;
      },
      async findMany(input: Row) {
        state.queries.push(["list", input]);
        if (state.failRead) throw new Error("private database row secret");
        if (state.beforeList) { const hook = state.beforeList; state.beforeList = null; hook(); }
        return ordered(view.tasks.filter((row: Row) => matches(row, input.where)), input.orderBy).slice(input.skip ?? 0, (input.skip ?? 0) + input.take).map((row: Row) => select(taskRow(row), input.select));
      },
      async count(input: Row) { state.queries.push(["count", input]); if (state.failRead) throw new Error("private count secret"); return view.tasks.filter((row: Row) => matches(row, input.where)).length; },
      async create(input: Row) {
        if (view.tasks.some((row: Row) => row.requestId === input.data.requestId)) throw knownError("P2002");
        const row = task(`new-task-${++state.counter}`, input.data.assigneeId, { ...input.data, createdAt: new Date(), updatedAt: new Date() });
        view.tasks.push(row); state.writes.push(["create", input]); return structuredClone(row);
      },
      async updateMany(input: Row) {
        state.writes.push(["update", input]);
        if (state.conflictUpdate) return { count: 0 };
        const rows = view.tasks.filter((row: Row) => matches(row, input.where));
        for (const row of rows) Object.assign(row, input.data, { version: row.version + input.data.version.increment, updatedAt: new Date() });
        return { count: rows.length };
      },
    },
    user: {
      async findFirst(input: Row) { state.queries.push(["eligible", input]); const user = state.users.find((row: Row) => matches(row, input.where)); return user ? select(user, input.select) : null; },
      async findMany(input: Row) { state.queries.push(["names", input]); return state.users.filter((row: Row) => matches(row, input.where)).map((row: Row) => select(row, input.select)); },
    },
    auditLog: {
      async create(input: Row) {
        if (state.failAudit) throw new Error("private audit storage secret");
        const row = { id: `audit-${String(++state.auditCounter).padStart(4, "0")}`, createdAt: new Date(), ...input.data };
        view.audit.push(row); state.writes.push(["audit", input]); return structuredClone(row);
      },
      async count(input: Row) { state.queries.push(["auditCount", input]); return view.audit.filter((row: Row) => matches(row, input.where)).length; },
      async findMany(input: Row) {
        state.queries.push(["history", input]);
        return ordered(view.audit.filter((row: Row) => matches(row, input.where)), input.orderBy).slice(input.skip, input.skip + input.take).map((row: Row) => select({ ...row, actor: state.users.find((user: Row) => user.id === row.actorId) }, input.select));
      },
    },
  };
}
const prisma = {
  mobileSession: { async findUnique(input: Row) { assert.equal(typeof input.where.tokenHash, "string"); if (state.failAuth) throw new Error("private auth session secret"); return state.session; } },
  async $transaction(operation: (tx: unknown) => Promise<unknown>, options: Row = {}) {
    const pending = serial.then(async () => {
      state.queries.push(["transaction", options]);
      const queued = state.transactionErrors.shift();
      if (queued) {
        if (state.onTransactionFailure) { const hook = state.onTransactionFailure; state.onTransactionFailure = null; hook(); }
        throw queued;
      }
      const original = structuredClone({ tasks: state.tasks, audit: state.audit });
      const view = options.isolationLevel === "RepeatableRead" ? structuredClone(original) : state;
      try { return await operation(database(view)); }
      catch (cause) { Object.assign(state, original); throw cause; }
    });
    serial = pending.catch(() => undefined);
    return pending;
  },
};
const effects = {
  prisma,
  revalidatePath(path: string) { if (state.cacheFailure) throw new Error("private-cache-error"); state.invalidated.push(path); },
  async requireUser() { state.webCalls++; if (!state.webUser) throw new Error("web cookie unavailable"); return state.webUser; },
  async getCurrentAuditLogRequestData() { return {}; },
  async getHomeDashboardData(userId: string, options: Row) { state.dashboardCalls.push({ userId, options }); if (state.failDashboard) throw new Error("private document dashboard secret"); return { counts: { activeSent: 2, recalled: 1, activeInbox: 3 }, sentDocuments: [], inboxDocuments: [] }; },
};
(globalThis as Row)[harnessKey] = effects;
const moduleUrl = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const effectsUrl = moduleUrl(`export const {prisma,revalidatePath,requireUser,getCurrentAuditLogRequestData,getHomeDashboardData}=globalThis.${harnessKey};`);
function compile(file: string, replacements: Record<string, string>) {
  let source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  // Notification delivery is an external effect; actual queue/integration tests cover it separately.
  source = source.replaceAll(JSON.stringify("@/lib/mobile-push-events"), JSON.stringify('data:text/javascript,export%20async%20function%20queueStaffPushEvent(){}%20export%20async%20function%20queueChatPush(){}'));

  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`"${from}"`, JSON.stringify(to));
  return moduleUrl(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const queryUrl = compile("lib/staff-task-queries.ts", { "@/lib/prisma": effectsUrl });
const mutationUrl = compile("lib/staff-task-mutations.ts", { "@/lib/prisma": effectsUrl, "@/lib/staff-task-queries": queryUrl });
const cacheUrl = compile("lib/staff-task-cache.ts", { "next/cache": effectsUrl });
const authUrl = compile("lib/mobile-auth.ts", { "@/lib/prisma": effectsUrl });
const helperUrl = compile("lib/mobile-staff-tasks.ts", { "@/lib/prisma": effectsUrl, "@/lib/mobile-auth": authUrl, "@/lib/staff-task-queries": queryUrl, "@/lib/staff-task-mutations": mutationUrl, "@/lib/staff-task-cache": cacheUrl });
const routePaths = ["tasks", "tasks/[id]", "tasks/[id]/completion", "tasks/[id]/history", "home"];
const routes = Object.fromEntries(await Promise.all(routePaths.map(async path => [path, await import(compile(`app/api/mobile/${path}/route.ts`, { "@/lib/mobile-staff-tasks": helperUrl, "@/lib/mobile-auth": authUrl, "@/lib/home-dashboard": effectsUrl }))])));
const web = await import(compile("app/tasks/actions.ts", { "@/lib/auth": effectsUrl, "@/lib/audit-log-request": effectsUrl, "@/lib/staff-task-cache": cacheUrl, "@/lib/staff-task-mutations": mutationUrl }));
function activeSession(role = "USER", userId = "staff", positionName = "생활지도원") {
  return { id: "session", userId, expiresAt: new Date(Date.now() + 60_000), user: { id: userId, name: "직원", role, status: "ACTIVE", position: { name: positionName } } };
}
function user(id: string, extra: Row = {}) { return { id, name: id === "staff" ? "직원" : "동료", status: "ACTIVE", role: "USER", resignationDate: null, department: { name: "운영팀" }, privateEmail: "private@example.test", ...extra }; }
function task(id: string, assigneeId = "staff", extra: Row = {}) {
  return { id, assigneeId, title: `할 일 ${id}`, description: null, meetingTitle: null, dueDate: null, completedAt: null, deletedAt: null, version: 0, requestId: `request-key-${id}-12345678`, createdById: "admin", createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-01T00:00:00Z"), privateKey: "private-task-secret", ...extra };
}
function ownTask(id = "own", extra: Row = {}) { const value = task(id, "staff", extra); state.tasks.push(value); return value; }
function request(path = "tasks", method = "GET", body?: unknown, authorization = `Bearer ${token}`, query = "", extraHeaders: Row = {}) {
  return new Request(`https://example.test/api/mobile/${path}${query}`, { method, headers: { ...(authorization ? { Authorization: authorization } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const input = (extra: Row = {}) => ({ title: "자료 정리", description: "확정 자료", meetingTitle: "팀 회의", dueDate: "", requestId: "request-1234567890", ...extra });
const list = (query = "") => routes.tasks.GET(request("tasks", "GET", undefined, `Bearer ${token}`, query));
const create = (extra: Row = {}) => routes.tasks.POST(request("tasks", "POST", input(extra)));
const complete = (id: string, completed = true, version: unknown = 0, extra: Row = {}) => routes["tasks/[id]/completion"].POST(request(`tasks/${id}/completion`, "POST", { completed, version, ...extra }), { params: Promise.resolve({ id }) });
const remove = (id: string, version: unknown = 0, extra: Row = {}) => routes["tasks/[id]"].DELETE(request(`tasks/${id}`, "DELETE", { version, ...extra }), { params: Promise.resolve({ id }) });
const history = (id: string, query = "") => routes["tasks/[id]/history"].GET(request(`tasks/${id}/history`, "GET", undefined, `Bearer ${token}`, query), { params: Promise.resolve({ id }) });
const home = () => routes.home.GET(request("home"));
function privateResponse(response: Response, status = 200) {
  assert.equal(response.status, status); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("location"), null); assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
}
function auditTask(row: Row, extra: Row = {}) {
  state.audit.push({ id: `history-${String(++state.auditCounter).padStart(4, "0")}`, createdAt: new Date("2026-10-02T01:00:00Z"), actorId: "admin", targetType: "StaffTask", targetId: row.id, message: "업무를 변경했습니다.", metadata: null, ipAddress: "private-address", userAgent: "private-device", ...extra });
}

describe("mobile own staff tasks", () => {
  beforeEach(() => {
    serial = Promise.resolve();
    Object.assign(state, { session: activeSession(), tasks: [], audit: [], users: [user("staff"), user("other"), user("admin", { role: "ADMIN", name: "관리자" })], queries: [], writes: [], invalidated: [], counter: 0, auditCounter: 0, webCalls: 0, webUser: null, failAudit: false, cacheFailure: false, failRead: false, failAuth: false, failDashboard: false, conflictUpdate: false, transactionErrors: [], onTransactionFailure: null, beforeList: null, dashboardCalls: [] });
  });
  after(() => { delete (globalThis as Row)[harnessKey]; });

  test("every task/home handler rejects missing, unknown, expired and inactive sessions without business effects", async () => {
    for (const kind of ["missing", "unknown", "expired", "inactive"]) {
      state.session = kind === "unknown" ? null : activeSession();
      if (kind === "expired") state.session.expiresAt = new Date(0);
      if (kind === "inactive") state.session.user.status = "RESIGNED";
      for (const path of routePaths) for (const method of Object.keys(routes[path]).filter(key => ["GET", "POST", "DELETE"].includes(key))) {
        const response = await routes[path][method](request(path, method, method === "GET" ? undefined : input({ completed: true, version: 0 }), kind === "missing" ? "" : `Bearer ${token}`), { params: Promise.resolve({ id: "own" }) });
        privateResponse(response, 401);
      }
    }
    assert.deepEqual(state.queries, []); assert.deepEqual(state.writes, []); assert.deepEqual(state.invalidated, []); assert.deepEqual(state.dashboardCalls, []); assert.equal(state.webCalls, 0);
  });

  test("authentication storage failures are private generic JSON for every task and home handler", async () => {
    state.failAuth = true;
    for (const action of [() => list(), () => create(), () => complete("own"), () => remove("own"), () => history("own"), () => home()]) {
      const response = await action(); privateResponse(response, 500); assert.equal(JSON.stringify(await response.json()).includes("private"), false);
    }
    assert.deepEqual(state.queries, []); assert.deepEqual(state.writes, []);
  });

  test("all five filters and counts are personal even for ADMIN and never include deleted tasks in active counts", async () => {
    const today = getStaffTaskToday();
    const pending = ownTask("pending", { dueDate: today });
    const overdue = ownTask("overdue", { dueDate: "2000-01-01" });
    const undated = ownTask("undated");
    const completed = ownTask("completed", { dueDate: "2000-01-01", completedAt: new Date() });
    const deleted = ownTask("deleted", { completedAt: new Date(), deletedAt: new Date() });
    state.tasks.push(task("foreign", "other")); state.session = activeSession("ADMIN");
    const expected = { pending: [pending.id, overdue.id, undated.id], overdue: [overdue.id], completed: [completed.id], all: [pending.id, overdue.id, undated.id, completed.id], deleted: [deleted.id] };
    for (const status of Object.keys(expected)) {
      const response = await list(`?status=${status}&assigneeId=other&role=ADMIN`); privateResponse(response);
      const body = await response.json(); assert.deepEqual(body.counts, { pending: 3, completed: 1, overdue: 1, deleted: 1 });
      assert.equal(body.total, expected[status].length); assert.deepEqual(body.tasks.map((row: Row) => row.id).sort(), expected[status].sort());
      assert.equal(body.today, today); assert.equal(body.status, status); assert.equal(body.pageSize, 20);
      assert.ok(body.tasks.every((row: Row) => row.assigneeId === "staff")); assert.equal(JSON.stringify(body).includes("private"), false);
      assert.equal(JSON.stringify(body).includes("request-key"), false); assert.ok(body.tasks.every((row: Row) => !("createdById" in row) && !("requestId" in row)));
    }
  });

  test("pending rows retain due-date/null/date/ID order across pages beyond twenty", async () => {
    state.tasks = Array.from({ length: 45 }, (_, index) => task(`t${String(index).padStart(3, "0")}`, "staff", { dueDate: index >= 40 ? null : index % 2 ? "2026-10-02" : "2026-10-01" }));
    const expected = ordered(state.tasks, [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }]).map(row => row.id);
    const pages = await Promise.all([1, 2, 3].map(async page => (await (await list(`?page=${page}`)).json()).tasks));
    const ids = pages.flat().map((row: Row) => row.id); assert.deepEqual(ids, expected); assert.equal(new Set(ids).size, 45); assert.equal(pages[2].length, 5);
    const body = await (await list("?page=9007199254740991")).json(); assert.equal(body.page, 3); assert.equal(body.totalPages, 3);
  });

  test("completed and deleted lists use their server event times with stable ID ties", async () => {
    state.tasks = [task("a", "staff", { completedAt: new Date(1000), deletedAt: new Date(1000) }), task("b", "staff", { completedAt: new Date(1000), deletedAt: new Date(1000) }), task("c", "staff", { completedAt: new Date(2000) }), task("d", "staff", { completedAt: new Date(2000) })];
    assert.deepEqual((await (await list("?status=completed")).json()).tasks.map((row: Row) => row.id), ["d", "c"]);
    assert.deepEqual((await (await list("?status=deleted")).json()).tasks.map((row: Row) => row.id), ["b", "a"]);
  });

  test("empty filters clamp to page one and invalid query/ID inputs make no business query", async () => {
    const body = await (await list("?status=deleted&page=99")).json(); assert.equal(body.page, 1); assert.equal(body.totalPages, 1); assert.deepEqual(body.tasks, []);
    state.queries = [];
    for (const query of ["?status=foreign", "?status=", "?page=0", "?page=-1", "?page=1.5", "?page=01", "?page=1e2", "?page=9007199254740992"]) privateResponse(await list(query), 400);
    for (const id of ["", " ", "a/b", "../own", "x".repeat(129)]) { privateResponse(await complete(id), 400); privateResponse(await remove(id), 400); privateResponse(await history(id), 400); }
    privateResponse(await history("own", "?page=0"), 400); assert.deepEqual(state.queries, []); assert.deepEqual(state.writes, []);
  });

  test("Korean midnight advances overdue counts while the due date itself remains on time", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-02T14:59:59.999Z") });
    state.session = activeSession(); ownTask("today", { dueDate: "2026-10-02" });
    let body = await (await list("?status=overdue")).json(); assert.equal(body.today, "2026-10-02"); assert.equal(body.total, 0);
    t.mock.timers.tick(1);
    body = await (await list("?status=overdue")).json(); assert.equal(body.today, "2026-10-03"); assert.equal(body.total, 1); assert.equal(body.counts.overdue, 1);
  });

  test("a repeatable-read page keeps summary and rows consistent during another device's update", async () => {
    ownTask(); state.beforeList = () => { state.tasks[0].completedAt = new Date(); state.tasks[0].version = 1; };
    const body = await (await list()).json(); assert.equal(body.counts.pending, 1); assert.equal(body.tasks.length, 1); assert.equal(body.tasks[0].completedAt, null);
    assert.equal(state.tasks[0].version, 1); assert.equal(state.queries.find((entry: Row) => entry[0] === "transaction")[1].isolationLevel, "RepeatableRead");
  });

  test("creation fixes owner to the Bearer account, normalizes values and audits once without cookie authentication", async () => {
    state.session = activeSession("ADMIN");
    const response = await create({ title: "  자료 정리  ", assigneeId: "other", actorId: "admin", role: "ADMIN" }); privateResponse(response, 201);
    const body = await response.json(); assert.equal(body.ok, true); assert.equal(body.task.assigneeId, "staff"); assert.equal(body.task.title, "자료 정리"); assert.equal(body.task.dueDate, null); assert.equal(body.task.version, 0);
    assert.equal(state.tasks[0].createdById, "staff"); assert.equal(state.webCalls, 0); assert.equal(state.audit.length, 1);
    assert.equal(state.audit[0].actorId, "staff"); assert.equal(state.audit[0].action, "UPDATE_STAFF_TASK"); assert.equal(state.audit[0].metadata.client, "mobile"); assert.equal(state.audit[0].metadata.before, null); assert.equal(state.audit[0].metadata.after.assigneeId, "staff");
    for (const path of ["/", "/tasks", "/admin/tasks", "/work-schedule/work-log"]) assert.ok(state.invalidated.includes(path));
    assert.equal(JSON.stringify(body).includes("request-123"), false); assert.equal(JSON.stringify(body).includes("createdById"), false);
  });

  test("same canonical create request replays while changed/foreign/deleted requests conflict without a duplicate", async () => {
    const first = await (await create()).json();
    const replay = await create({ title: "  자료 정리  " }); privateResponse(replay); assert.equal((await replay.json()).task.id, first.task.id);
    privateResponse(await create({ title: "다른 업무" }), 409); assert.equal(state.tasks.length, 1); assert.equal(state.audit.length, 1);
    state.session = activeSession("ADMIN", "other"); let response = await create(); privateResponse(response, 409); assert.equal((await response.json()).code, "REQUEST_CONFLICT");
    state.session = activeSession(); privateResponse(await remove(first.task.id)); response = await create(); privateResponse(response, 409); assert.equal((await response.json()).code, "REQUEST_CONFLICT"); assert.equal(state.tasks.length, 1); assert.equal(state.audit.length, 2);
  });

  test("concurrent identical creation returns one task and one registration audit", async () => {
    const responses = await Promise.all([create(), create()]); assert.deepEqual(responses.map(row => row.status).sort(), [200, 201]);
    const bodies = await Promise.all(responses.map(row => row.json())); assert.equal(bodies[0].task.id, bodies[1].task.id); assert.equal(state.tasks.length, 1); assert.equal(state.audit.length, 1);
  });

  test("eligibility checks new creation only, exclude resignation today/past, and permit future resignation", async () => {
    const person = state.users[0], today = getStaffTaskToday();
    for (const extra of [{ status: "INACTIVE", resignationDate: null }, { status: "ACTIVE", resignationDate: "2000-01-01" }, { status: "ACTIVE", resignationDate: today }]) { Object.assign(person, extra); privateResponse(await create(), 403); }
    Object.assign(person, { status: "ACTIVE", resignationDate: "9999-12-31" }); privateResponse(await create(), 201);
    person.resignationDate = today; privateResponse(await create()); assert.equal(state.tasks.length, 1); assert.equal(state.audit.length, 1);
    privateResponse(await complete(state.tasks[0].id)); assert.equal(state.tasks[0].version, 1);
  });

  test("invalid form types, limits, impossible dates and request IDs return field errors before writes", async () => {
    for (const [field, value] of [["title", " "], ["title", "가".repeat(161)], ["description", "가".repeat(2001)], ["meetingTitle", "가".repeat(161)], ["dueDate", "2026-02-29"], ["description", null], ["meetingTitle", 42]] as Array<[string, unknown]>) {
      const response = await create({ [field]: value }); privateResponse(response, 400); const body = await response.json(); assert.equal(body.code, "INVALID_INPUT"); assert.ok(body.fields[field]);
    }
    for (const requestId of ["", "short", "x".repeat(129), "request key-12345678"]) privateResponse(await create({ requestId }), 400);
    assert.deepEqual(state.queries, []); assert.deepEqual(state.writes, []);
    const response = await create({ title: "가".repeat(160), description: "가".repeat(2000), meetingTitle: "가".repeat(160), dueDate: "2028-02-29" }); privateResponse(response, 201);
  });

  test("empty optional fields are stored as null and missing optionals are accepted", async () => {
    const response = await routes.tasks.POST(request("tasks", "POST", { title: "자기 업무", requestId: "request-empty-123456" })); privateResponse(response, 201);
    const body = await response.json(); assert.equal(body.task.description, null); assert.equal(body.task.meetingTitle, null); assert.equal(body.task.dueDate, null);
  });

  test("JSON body caps enforce declared and streamed bytes and reject malformed/type-confused inputs", async () => {
    const oversized = request("tasks", "POST", input(), `Bearer ${token}`, "", { "Content-Length": String(16 * 1024 + 1) }); privateResponse(await routes.tasks.POST(oversized), 413);
    const extra = await create({ ignored: "x".repeat(16 * 1024) }); privateResponse(extra, 413);
    for (const body of [null, [], 1, "string"]) privateResponse(await routes.tasks.POST(request("tasks", "POST", body)), 400);
    for (const text of ["{", ""]) { const req = new Request("https://example.test/api/mobile/tasks", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: text }); privateResponse(await routes.tasks.POST(req), 400); }
    privateResponse(await routes.tasks.POST(request("tasks", "POST", input(), `Bearer ${token}`, "", { "Content-Type": "text/plain" })), 400);
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(16 * 1024 + 1)); }, cancel() { cancelled = true; } });
    const req = new Request("https://example.test/api/mobile/tasks", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: stream, duplex: "half" }); privateResponse(await routes.tasks.POST(req), 413);
    assert.equal(cancelled, true); assert.deepEqual(state.queries, []); assert.deepEqual(state.writes, []);
  });

  test("a stalled JSON upload cancels at the deadline without changing any task", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] }); let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const req = new Request("https://example.test/api/mobile/tasks", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: stream, duplex: "half" });
    const pending = routes.tasks.POST(req); for (let i = 0; i < 10; i++) await Promise.resolve(); t.mock.timers.tick(10_001);
    const response = await pending; privateResponse(response, 408); assert.equal((await response.json()).code, "REQUEST_TIMEOUT"); assert.equal(cancelled, true); assert.deepEqual(state.writes, []);
  });

  test("completion and reopening use server times, latest version and atomic before/after audits", async () => {
    const row = ownTask(); const before = Date.now();
    const response = await complete(row.id, true, 0, { assigneeId: "other", actorId: "other", role: "ADMIN" }); privateResponse(response);
    const body = await response.json(); assert.equal(body.task.version, 1); assert.ok(new Date(body.task.completedAt).getTime() >= before);
    assert.equal(state.audit[0].actorId, "staff"); assert.equal(state.audit[0].metadata.changeType, "staffTask.complete"); assert.equal(state.audit[0].metadata.before.completedAt, null); assert.equal(state.audit[0].metadata.after.completedAt, body.task.completedAt);
    const update = state.writes.find((entry: Row) => entry[0] === "update")[1]; assert.deepEqual(update.where, { id: row.id, assigneeId: "staff", version: 0, deletedAt: null });
    const reopened = await complete(row.id, false, 1); privateResponse(reopened); const next = await reopened.json(); assert.equal(next.task.completedAt, null); assert.equal(next.task.version, 2); assert.equal(state.audit[1].metadata.changeType, "staffTask.reopen");
  });

  test("current-version no-op preserves completion time and audit while stale identical requests conflict", async () => {
    ownTask(); privateResponse(await complete("own")); const saved = state.tasks[0].completedAt.toISOString();
    privateResponse(await complete("own", true, 1)); assert.equal(state.tasks[0].version, 1); assert.equal(state.tasks[0].completedAt.toISOString(), saved); assert.equal(state.audit.length, 1);
    const response = await complete("own", true, 0); privateResponse(response, 409); assert.equal((await response.json()).code, "TASK_CONFLICT"); assert.equal(state.audit.length, 1);
    const responses = await Promise.all([complete("own", false, 1), complete("own", false, 1)]); assert.deepEqual(responses.map(row => row.status).sort(), [200, 409]); assert.equal(state.audit.length, 2);
  });

  test("foreign, missing, deleted or reassigned task changes have identical 404 and ADMIN cannot bypass ownership", async () => {
    const deleted = ownTask("deleted", { deletedAt: new Date() }); state.tasks.push(task("foreign", "other")); state.session = activeSession("ADMIN");
    const bodies = [];
    for (const id of ["foreign", "missing", deleted.id]) { const response = await complete(id); privateResponse(response, 404); bodies.push(await response.json()); }
    const row = ownTask("reassigned"); row.assigneeId = "other"; row.version = 1;
    privateResponse(await complete(row.id, true, 1), 404); privateResponse(await remove("foreign"), 404); privateResponse(await remove("missing"), 404); privateResponse(await remove(row.id, 1), 404);
    assert.ok(bodies.every(body => JSON.stringify(body) === JSON.stringify(bodies[0]))); assert.deepEqual(state.writes, []);
  });

  test("malformed completion/version requests reject before reading or writing tasks", async () => {
    for (const version of [-1, 0.5, 2147483647, "0", null, Number.NaN]) { privateResponse(await complete("own", true, version), 400); privateResponse(await remove("own", version), 400); }
    privateResponse(await complete("own", true, 0, { completed: "true" }), 400); assert.deepEqual(state.queries, []); assert.deepEqual(state.writes, []);
  });

  test("failed conditional completion or deletion returns409 without writing audit or changing the task", async () => {
    ownTask(); state.conflictUpdate = true;
    for (const action of [() => complete("own"), () => remove("own")]) { const response = await action(); privateResponse(response, 409); assert.equal((await response.json()).code, "TASK_CONFLICT"); }
    assert.equal(state.tasks[0].version, 0); assert.equal(state.tasks[0].completedAt, null); assert.equal(state.tasks[0].deletedAt, null); assert.deepEqual(state.audit, []);
  });

  test("soft delete preserves completed content and history, removes active counts, and replays without new audit", async () => {
    const row = ownTask("own", { title: "보존할 업무", description: "기록", completedAt: new Date("2026-10-01T01:02:03Z"), version: 2 }); auditTask(row);
    const response = await remove(row.id, 2, { assigneeId: "other" }); privateResponse(response); const body = await response.json();
    assert.equal(body.task.version, 3); assert.equal(body.task.title, row.title); assert.equal(body.task.description, row.description); assert.equal(body.task.completedAt, "2026-10-01T01:02:03.000Z"); assert.ok(body.task.deletedAt);
    assert.equal(state.tasks.length, 1); assert.equal(state.audit.length, 2); assert.equal(state.audit[1].metadata.changeType, "staffTask.delete"); assert.equal(state.audit[1].metadata.before.deletedAt, null); assert.equal(state.audit[1].metadata.after.deletedAt, body.task.deletedAt);
    privateResponse(await remove(row.id, 2)); assert.equal(state.tasks[0].version, 3); assert.equal(state.audit.length, 2);
    privateResponse(await complete(row.id, false, 3), 404);
    assert.deepEqual((await (await list("?status=all")).json()).counts, { pending: 0, completed: 0, overdue: 0, deleted: 1 });
    assert.equal((await (await list("?status=deleted")).json()).tasks[0].id, row.id); assert.equal((await (await history(row.id)).json()).total, 2); assert.ok(state.invalidated.includes(`/tasks/${row.id}/history`));
  });

  test("audit failure rolls back creation, completion and soft deletion with private generic errors", async () => {
    const row = ownTask(); state.failAudit = true;
    for (const action of [() => create(), () => complete(row.id), () => remove(row.id)]) {
      const original = structuredClone(state.tasks); const response = await action(); privateResponse(response, 500); assert.equal(JSON.stringify(await response.json()).includes("private"), false); assert.deepEqual(state.tasks, original); assert.deepEqual(state.audit, []);
    }
    assert.deepEqual(state.invalidated, []);
  });

  test("Serializable P2034 retries are bounded and commit one mutation/audit only", async () => {
    state.transactionErrors = [knownError("P2034"), knownError("P2034")]; privateResponse(await create(), 201);
    assert.equal(state.queries.filter((entry: Row) => entry[0] === "transaction").length, 3); assert.ok(state.queries.filter((entry: Row) => entry[0] === "transaction").every((entry: Row) => entry[1].isolationLevel === "Serializable")); assert.equal(state.tasks.length, 1); assert.equal(state.audit.length, 1);
    state.transactionErrors = [knownError("P2034"), knownError("P2034"), knownError("P2034")]; const response = await complete(state.tasks[0].id); privateResponse(response, 500); assert.equal(state.tasks[0].version, 0); assert.equal(state.audit.length, 1);
  });

  test("a P2002 creation race is re-read as a canonical replay rather than creating a second task", async () => {
    state.transactionErrors = [knownError("P2002")]; state.onTransactionFailure = () => {
      const existing = task("concurrent", "staff", { createdById: "staff", title: "자료 정리", description: "확정 자료", meetingTitle: "팀 회의", dueDate: null, requestId: "request-1234567890" }); state.tasks.push(existing); auditTask(existing, { actorId: "staff", metadata: { changeType: "staffTask.create" } });
    };
    const response = await create(); privateResponse(response); assert.equal((await response.json()).task.id, "concurrent"); assert.equal(state.tasks.length, 1); assert.equal(state.audit.length, 1); assert.equal(state.writes.length, 0);
  });

  test("history checks current assignee before audit or user reads and ADMIN remains limited to their own tasks", async () => {
    const row = task("foreign", "other", { createdById: "staff" }); state.tasks.push(row); auditTask(row); state.session = activeSession("ADMIN");
    for (const id of [row.id, "missing"]) privateResponse(await history(id), 404);
    assert.equal(state.queries.some((entry: Row) => ["auditCount", "history", "names"].includes(entry[0])), false); assert.deepEqual(state.writes, []);
  });

  test("assigned push detail permits only its current ADMIN creator and stays read-only", async () => {
    const row = task("assigned", "other", { createdById: "staff" }); state.tasks.push(row); auditTask(row);
    state.session = activeSession("ADMIN");
    const ownAssigned = await history(row.id, "?assigned=1"); privateResponse(ownAssigned);
    assert.equal((await ownAssigned.json()).readOnly, true);
    state.session = activeSession("USER"); privateResponse(await history(row.id, "?assigned=1"), 404);
    state.session = activeSession("ADMIN"); row.createdById = "another-admin"; privateResponse(await history(row.id, "?assigned=1"), 404);
    privateResponse(await complete(row.id, true, 0), 404);
  });
  test("history maps authorized snapshot changes and names while excluding raw metadata, request keys and private request data", async () => {
    const row = ownTask(); auditTask(row, { metadata: { changeType: "staffTask.update", requestId: "private-registration-key", ipAddress: "private-metadata-address", before: { title: "이전 제목", assigneeId: "other", description: null, version: 4, privateToken: "private-token" }, after: { title: "수정 제목", assigneeId: "staff", description: "상세", version: 5, privateToken: "private-token" } } });
    const response = await history(row.id); privateResponse(response); const body = await response.json();
    assert.equal(body.logs[0].actorName, "관리자"); assert.equal(body.logs[0].changeType, "staffTask.update"); assert.deepEqual(body.logs[0].changes.map((change: Row) => change.field), ["title", "description", "assigneeName"]);
    const name = body.logs[0].changes.find((change: Row) => change.field === "assigneeName"); assert.equal(name.before, "동료"); assert.equal(name.after, "직원");
    assert.equal(JSON.stringify(body).includes("private"), false); assert.equal(JSON.stringify(body).includes("metadata"), false); assert.equal(JSON.stringify(body).includes("actorId"), false); assert.equal(JSON.stringify(body).includes("requestId"), false);
    const names = state.queries.find((entry: Row) => entry[0] === "names")[1]; assert.deepEqual(names.where.id.in.sort(), ["other", "staff"]); assert.deepEqual(names.select, { id: true, name: true });
  });

  test("legacy and malformed history metadata does not fabricate changes and pages retain stable date/ID order", async () => {
    const row = ownTask(); for (let i = 0; i < 25; i++) auditTask(row, { message: i ? "이전 기록" : null, metadata: i === 1 ? { before: [], after: [], changeType: "private-unknown-action", privateToken: "secret" } : null });
    let body = await (await history(row.id)).json(); assert.equal(body.total, 25); assert.equal(body.logs.length, 20); assert.ok(body.logs.every((log: Row) => log.changes.length === 0 && log.changeType === null)); assert.equal(body.logs[0].id, "history-0025");
    body = await (await history(row.id, "?page=99")).json(); assert.equal(body.page, 2); assert.equal(body.logs.length, 5); assert.equal(body.logs.at(-1).message, null); assert.equal(JSON.stringify(body).includes("private"), false);
  });

  test("home adds only personal pending/overdue counts without widening its approval dashboard policy", async () => {
    ownTask("pending"); ownTask("overdue", { dueDate: "2000-01-01" }); ownTask("done", { completedAt: new Date() }); ownTask("deleted", { deletedAt: new Date() }); state.tasks.push(task("foreign", "other", { dueDate: "2000-01-01" })); state.session = activeSession("ADMIN");
    const response = await home(); privateResponse(response); const body = await response.json(); assert.deepEqual(body.taskCounts, { pending: 2, overdue: 1 }); assert.equal(body.canApproveDocuments, false); assert.ok(!("inboxDocuments" in body)); assert.ok(!("activeInbox" in body.counts)); assert.equal(state.dashboardCalls[0].userId, "staff"); assert.equal(state.dashboardCalls[0].options.includeApprovalQueue, false);
    state.failDashboard = true; privateResponse(await home(), 500);
    state.failDashboard = false; state.failRead = true; const failed = await home(); privateResponse(failed, 500); assert.equal(JSON.stringify(await failed.json()).includes("private"), false);
  });

  test("list and history read failures stay private without exposing database details", async () => {
    ownTask(); state.failRead = true;
    for (const action of [() => list(), () => history("own")]) {
      const response = await action(); privateResponse(response, 500);
      assert.equal(JSON.stringify(await response.json()).includes("private"), false);
    }
    assert.deepEqual(state.writes, []); assert.deepEqual(state.audit, []);
  });

  test("confirmed mobile create/completion/delete keep success when postcommit cache refresh fails", async () => {
    state.cacheFailure = true;
    const created = await create(); privateResponse(created, 201); const saved = await created.json();
    assert.equal(saved.ok, true); assert.equal(state.tasks.length, 1); assert.equal(state.audit.length, 1);
    const id = saved.task.id;
    const completed = await complete(id); privateResponse(completed); assert.equal((await completed.json()).task.version, 1);
    assert.equal(state.audit.length, 2); assert.ok(state.tasks[0].completedAt);
    const deleted = await remove(id, 1); privateResponse(deleted); assert.equal((await deleted.json()).task.version, 2);
    assert.equal(state.audit.length, 3); assert.ok(state.tasks[0].deletedAt);
    assert.deepEqual(state.invalidated, []);
  });

  test("web creation and mobile completion/deletion share the same task version and audit policy", async () => {
    state.webUser = { id: "admin", role: "ADMIN" }; const form = new FormData(); for (const [key, value] of Object.entries({ ...input(), assigneeId: "staff" })) form.set(key, value);
    const result = await web.createStaffTaskAction({}, form); assert.ok(result.success); const id = result.savedTaskId;
    assert.equal(state.webCalls, 1); assert.equal(state.audit[0].actorId, "admin"); assert.ok(!("client" in state.audit[0].metadata));
    privateResponse(await complete(id)); privateResponse(await remove(id, 1)); assert.equal(state.webCalls, 1); assert.equal(state.tasks[0].version, 2); assert.equal(state.audit.length, 3); assert.equal(state.audit[2].metadata.client, "mobile");
  });
});
