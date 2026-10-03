import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";
import { canReadApprovalDocument } from "../src/lib/approval-permissions-core.ts";

// Run the actual route, session, query and permission code with isolated database effects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const harnessKey = "__mobileNotificationsHarness";
const token = "a".repeat(43);
const state: Row = { session: null, documents: [], rows: [], queries: [], writes: [] };

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((item: Row) => matches(row, item));
    if (key === "AND") return value.every((item: Row) => matches(row, item));
    if (key === "document") return matches(state.documents.find((doc: Row) => doc.id === row.documentId) ?? {}, value.is);
    if (key === "approvalSteps") return row.approvalSteps?.some((step: Row) => matches(step, value.some));
    if (value && typeof value === "object" && "notIn" in value) return !value.notIn.includes(row[key]);
    return row[key] === value;
  });
}
function selected(row: Row, select: Row) {
  return Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]]));
}
function database(rows: Row[]) {
  return {
    notification: {
      async count(input: Row) {
        state.queries.push(["count", input]);
        if (state.failCount) throw new Error("private database token and storage key");
        return rows.filter(row => matches(row, input.where)).length;
      },
      async findMany(input: Row) {
        state.queries.push(["findMany", input]);
        if (state.beforeFindMany) { const hook = state.beforeFindMany; state.beforeFindMany = null; hook(); }
        const found = rows.filter(row => matches(row, input.where));
        found.sort((a, b) => {
          for (const order of input.orderBy) {
            const key = Object.keys(order)[0]!;
            const result = key === "createdAt" ? a[key].getTime() - b[key].getTime() : a[key].localeCompare(b[key]);
            if (result !== 0) return order[key] === "desc" ? -result : result;
          }
          return 0;
        });
        return found.slice(input.skip, input.skip + input.take).map(row => selected(row, input.select));
      },
      async findFirst(input: Row) {
        state.queries.push(["findFirst", input]);
        const found = rows.find(row => matches(row, input.where));
        return found ? selected(found, input.select) : null;
      },
      async updateMany(input: Row) {
        state.writes.push(input);
        const targets = rows.filter(row => matches(row, input.where));
        for (const row of targets) Object.assign(row, input.data);
        if (state.afterUpdate) { const hook = state.afterUpdate; state.afterUpdate = null; hook(); }
        return { count: targets.length };
      },
    },
    approvalDocument: {
      async findFirst(input: Row) {
        state.queries.push(["document", input]);
        const found = state.documents.find((doc: Row) => matches(doc, input.where));
        return found ? selected(found, input.select) : null;
      },
    },
  };
}
const prisma = {
  mobileSession: { async findUnique(input: Row) { assert.equal(typeof input.where.tokenHash, "string"); if (state.failAuth) throw new Error("private session database secret"); return state.session; } },
  async $transaction(callback: (tx: unknown) => Promise<unknown>, options?: Row) {
    state.queries.push(["transaction", options]);
    const original = structuredClone(state.rows);
    const rows = options?.isolationLevel === "RepeatableRead" ? structuredClone(state.rows) : state.rows;
    try { return await callback(database(rows)); }
    catch (cause) { state.rows = original; throw cause; }
  },
};
(globalThis as Row)[harnessKey] = { prisma };
const moduleUrl = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const effectsUrl = moduleUrl(`export const prisma=globalThis.${harnessKey}.prisma;`);
function compile(file: string, replacements: Record<string, string>) {
  let source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`"${from}"`, JSON.stringify(to));
  return moduleUrl(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const authUrl = compile("lib/mobile-auth.ts", { "@/lib/prisma": effectsUrl });
const helperUrl = compile("lib/mobile-notifications.ts", { "@/lib/prisma": effectsUrl });
const routePaths = ["notifications", "notifications/[id]/read", "notifications/read-all", "notifications/read-document"];
const routes = Object.fromEntries(await Promise.all(routePaths.map(async path => [path, await import(compile(`app/api/mobile/${path}/route.ts`, { "@/lib/mobile-auth": authUrl, "@/lib/mobile-notifications": helperUrl }))])));
function activeSession(role = "USER") {
  return { id: "session", userId: "staff", expiresAt: new Date(Date.now() + 60_000), user: { id: "staff", role, status: "ACTIVE", name: "직원", position: { name: "생활지도원" } } };
}
function document(id: string, drafterId: string, status: string, approverIds: string[] = []) {
  return { id, drafterId, status, approvalSteps: approverIds.map(approverId => ({ approverId })), content: "sensitive document content" };
}
function notification(id: string, documentId: string, userId = "staff", read = false, offset = 0) {
  return { id, documentId, userId, title: `알림 ${id}`, message: `내용 ${id}`, readAt: read ? new Date("2026-10-01T00:00:00Z") : null, createdAt: new Date(Date.UTC(2026, 9, 3) + offset), privateToken: "private-notification-secret" };
}
function visibleRows() {
  return state.rows.filter((row: Row) => row.userId === "staff" && canReadApprovalDocument("staff", "USER", state.documents.find((doc: Row) => doc.id === row.documentId)));
}
function request(path = "notifications", method = "GET", body?: unknown, authorization = `Bearer ${token}`, query = "") {
  return new Request(`https://example.test/api/mobile/${path}${query}`, { method, headers: { ...(authorization ? { Authorization: authorization } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const list = (query = "") => routes.notifications.GET(request("notifications", "GET", undefined, `Bearer ${token}`, query));
const read = (id: string, body?: unknown) => routes["notifications/[id]/read"].POST(request(`notifications/${encodeURIComponent(id)}/read`, "POST", body), { params: Promise.resolve({ id }) });
const readAll = (body?: unknown) => routes["notifications/read-all"].POST(request("notifications/read-all", "POST", body));
const readDocument = (documentId: unknown, extra: Row = {}) => routes["notifications/read-document"].POST(request("notifications/read-document", "POST", { documentId, ...extra }));
function privateResponse(response: Response, status = 200) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("location"), null);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
}

describe("mobile notification privacy and pagination", () => {
  beforeEach(() => {
    Object.assign(state, { session: activeSession(), queries: [], writes: [], failCount: false, failAuth: false, beforeFindMany: null, afterUpdate: null,
      documents: [document("own", "staff", "DRAFT"), document("approved", "other", "APPROVED", ["staff"]), document("empty-readable", "staff", "APPROVED"), document("unrelated", "other", "APPROVED"), document("private-draft", "other", "DRAFT", ["staff"]), document("private-recalled", "other", "RECALLED", ["staff"]), document("private-discarded", "other", "DISCARDED", ["staff"])],
      rows: Array.from({ length: 45 }, (_, i) => notification(`n${String(i).padStart(3, "0")}`, i % 2 ? "own" : "approved", "staff", i % 3 === 0, Math.floor(i / 2))),
    });
    state.rows.push(notification("foreign", "own", "other"), notification("unrelated-row", "unrelated"), notification("draft-row", "private-draft"), notification("recalled-row", "private-recalled"), notification("discarded-row", "private-discarded"));
  });
  after(() => { delete (globalThis as Row)[harnessKey]; });

  test("all handlers reject missing, unknown, expired and inactive sessions before notification queries or writes", async () => {
    for (const kind of ["missing", "unknown", "expired", "inactive"]) {
      state.session = kind === "unknown" ? null : activeSession();
      if (kind === "expired") state.session.expiresAt = new Date(0);
      if (kind === "inactive") state.session.user.status = "RESIGNED";
      for (const path of routePaths) {
        const method = path === "notifications" ? "GET" : "POST";
        const response = await routes[path][method](request(path, method, method === "POST" ? { documentId: "own" } : undefined, kind === "missing" ? "" : `Bearer ${token}`), { params: Promise.resolve({ id: "n001" }) });
        privateResponse(response, 401);
      }
    }
    assert.deepEqual(state.queries, []); assert.deepEqual(state.writes, []);
  });

  test("session storage failure returns private generic JSON without querying or updating notifications", async () => {
    state.failAuth = true;
    for (const action of [() => list(), () => read("n001"), () => readAll(), () => readDocument("own")]) {
      const response = await action(); privateResponse(response, 500);
      assert.equal(JSON.stringify(await response.json()).includes("private"), false);
    }
    assert.deepEqual(state.queries, []); assert.deepEqual(state.writes, []);
  });

  test("page 20 exposes only own readable alerts even for ADMIN and excludes internal keys", async () => {
    state.session = activeSession("ADMIN");
    const response = await list("?role=ADMIN&userId=other&filter=all"); privateResponse(response);
    const body = await response.json();
    assert.equal(body.total, 45); assert.equal(body.page, 1); assert.equal(body.pageSize, 20); assert.equal(body.totalPages, 3); assert.equal(body.unreadCount, 30);
    assert.equal(body.notifications.length, 20);
    assert.deepEqual(Object.keys(body.notifications[0]).sort(), ["createdAt", "documentId", "id", "message", "readAt", "title"]);
    assert.equal(JSON.stringify(body).includes("private-"), false); assert.equal(JSON.stringify(body).includes("sensitive"), false);
    assert.ok(body.notifications.every((row: Row) => visibleRows().some((visible: Row) => visible.id === row.id)));
  });

  test("stable date and ID ordering reaches old alerts beyond the former 30-row limit without duplicates", async () => {
    const pages = await Promise.all([1, 2, 3].map(async page => (await (await list(`?page=${page}`)).json()).notifications));
    const ids = pages.flat().map((row: Row) => row.id);
    assert.equal(ids.length, 45); assert.equal(new Set(ids).size, 45);
    const expected = [...visibleRows()].sort((a: Row, b: Row) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)).map((row: Row) => row.id);
    assert.deepEqual(ids, expected); assert.equal(ids.at(-1), "n000");
    assert.equal(pages[0][0].createdAt, visibleRows().at(-1).createdAt.toISOString());
  });

  test("unread filtering counts the entire visible scope independently of the selected page", async () => {
    const body = await (await list("?filter=unread&page=2")).json();
    assert.equal(body.filter, "unread"); assert.equal(body.total, 30); assert.equal(body.totalPages, 2); assert.equal(body.unreadCount, 30); assert.equal(body.notifications.length, 10);
    assert.ok(body.notifications.every((row: Row) => row.readAt === null));
    const filteredQuery = state.queries.find((entry: Row) => entry[0] === "findMany")[1];
    assert.equal(filteredQuery.where.readAt, null); assert.equal(filteredQuery.skip, 20); assert.equal(filteredQuery.take, 20);
  });

  test("excessive positive pages clamp to the last available page and empty results remain page one", async () => {
    let body = await (await list("?page=9007199254740991")).json();
    assert.equal(body.page, 3); assert.equal(body.notifications.length, 5);
    state.rows = state.rows.filter((row: Row) => row.userId !== "staff");
    body = await (await list("?filter=unread&page=99")).json();
    assert.deepEqual(body, { filter: "unread", total: 0, page: 1, pageSize: 20, totalPages: 1, unreadCount: 0, notifications: [] });
  });

  test("invalid filter and page syntax reject before any notification transaction", async () => {
    for (const query of ["?filter=other", "?filter=", "?page=", "?page=0", "?page=-1", "?page=1.5", "?page=Infinity", "?page=1e2", "?page=01", "?page=%201", "?page=9007199254740992"]) privateResponse(await list(query), 400);
    assert.deepEqual(state.queries, []); assert.deepEqual(state.writes, []);
  });

  test("counts and page rows use one repeatable-read snapshot during another device's update", async () => {
    state.beforeFindMany = () => { for (const row of state.rows) if (row.userId === "staff") row.readAt = new Date(); };
    const body = await (await list("?filter=unread")).json();
    assert.equal(body.total, 30); assert.equal(body.unreadCount, 30); assert.equal(body.notifications.length, 20); assert.ok(body.notifications.every((row: Row) => row.readAt === null));
    assert.equal(state.queries.find((entry: Row) => entry[0] === "transaction")[1].isolationLevel, "RepeatableRead");
    assert.equal(visibleRows().filter((row: Row) => row.readAt === null).length, 0);
  });

  test("individual read is personal, ignores forged ownership fields, and is idempotent", async () => {
    state.session = activeSession("ADMIN");
    let response = await read("n001", { userId: "other", role: "ADMIN", readAt: null }); privateResponse(response);
    assert.deepEqual(await response.json(), { ok: true, updatedCount: 1, unreadCount: 29 });
    const readAt = state.rows.find((row: Row) => row.id === "n001").readAt;
    response = await read("n001"); assert.deepEqual(await response.json(), { ok: true, updatedCount: 0, unreadCount: 29 });
    assert.equal(state.rows.find((row: Row) => row.id === "n001").readAt, readAt);
    assert.equal(state.rows.find((row: Row) => row.id === "foreign").readAt, null);
  });

  test("foreign, inaccessible and missing alert IDs have indistinguishable private 404 responses without updates", async () => {
    state.session = activeSession("ADMIN");
    const bodies = [];
    for (const id of ["foreign", "unrelated-row", "draft-row", "recalled-row", "discarded-row", "missing"]) {
      const response = await read(id); privateResponse(response, 404); bodies.push(await response.json());
    }
    assert.ok(bodies.every(body => JSON.stringify(body) === JSON.stringify(bodies[0]))); assert.deepEqual(state.writes, []);
  });

  test("malformed or blank IDs reject before notifications or documents are queried", async () => {
    for (const id of ["", " ", "n001 ", "../n001", "n001%00", "x".repeat(101), "알림"]) { privateResponse(await read(id), 400); privateResponse(await readDocument(id), 400); }
    for (const id of [null, 123, {}, []]) privateResponse(await readDocument(id), 400);
    const invalidJson = new Request("https://example.test/api/mobile/notifications/read-document", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{" });
    privateResponse(await routes["notifications/read-document"].POST(invalidJson), 400);
    assert.deepEqual(state.queries, []); assert.deepEqual(state.writes, []);
  });

  test("read-all updates only unread, readable alerts owned by the authenticated account", async () => {
    state.session = activeSession("ADMIN");
    const alreadyRead = new Map(state.rows.filter((row: Row) => row.readAt).map((row: Row) => [row.id, row.readAt]));
    const response = await readAll({ userId: "other", role: "ADMIN" }); privateResponse(response);
    assert.deepEqual(await response.json(), { ok: true, updatedCount: 30, unreadCount: 0 });
    assert.ok(visibleRows().every((row: Row) => row.readAt !== null));
    for (const id of ["foreign", "unrelated-row", "draft-row", "recalled-row", "discarded-row"]) assert.equal(state.rows.find((row: Row) => row.id === id).readAt, null);
    for (const [id, timestamp] of alreadyRead) assert.equal(state.rows.find((row: Row) => row.id === id).readAt, timestamp);
    assert.deepEqual(await (await readAll()).json(), { ok: true, updatedCount: 0, unreadCount: 0 });
  });

  test("a new alert arriving after read-all is preserved and included in the returned unread count", async () => {
    state.afterUpdate = () => state.rows.push(notification("arrived", "own"));
    assert.deepEqual(await (await readAll()).json(), { ok: true, updatedCount: 30, unreadCount: 1 });
    assert.equal(state.rows.find((row: Row) => row.id === "arrived").readAt, null);
  });

  test("read-document gates navigation with document USER permission before any notification update", async () => {
    state.session = activeSession("ADMIN");
    const bodies = [];
    for (const id of ["unrelated", "private-draft", "private-recalled", "private-discarded", "missing"]) {
      const response = await readDocument(id); privateResponse(response, 404); bodies.push(await response.json());
    }
    assert.ok(bodies.every(body => JSON.stringify(body) === JSON.stringify(bodies[0])));
    assert.deepEqual(state.writes, []); assert.equal(state.queries.some((entry: Row) => entry[0] === "count"), false);
  });

  test("opening a readable document marks all its own alerts and leaves other accounts and documents unchanged", async () => {
    const expected = visibleRows().filter((row: Row) => row.documentId === "own" && !row.readAt).length;
    const response = await readDocument("own", { userId: "other", role: "ADMIN" }); privateResponse(response);
    assert.deepEqual(await response.json(), { ok: true, updatedCount: expected, unreadCount: 30 - expected });
    assert.ok(visibleRows().filter((row: Row) => row.documentId === "own").every((row: Row) => row.readAt));
    assert.equal(state.rows.find((row: Row) => row.id === "foreign").readAt, null);
    assert.deepEqual(await (await readDocument("own")).json(), { ok: true, updatedCount: 0, unreadCount: 30 - expected });
    assert.equal(state.queries.filter((entry: Row) => entry[0] === "document").length, 2);
  });

  test("readable documents without notifications can be opened and return the remaining visible count", async () => {
    const response = await readDocument("empty-readable"); privateResponse(response);
    assert.deepEqual(await response.json(), { ok: true, updatedCount: 0, unreadCount: 30 });
    assert.equal(state.writes[0].where.documentId, "empty-readable");
  });

  test("an unread page that disappears after a read clamps safely on the next request", async () => {
    state.rows = state.rows.slice(0, 22).map((row: Row) => ({ ...row, readAt: null }));
    assert.equal((await (await list("?filter=unread&page=2")).json()).notifications.length, 2);
    for (const id of ["n000", "n001"]) privateResponse(await read(id));
    const body = await (await list("?filter=unread&page=2")).json();
    assert.equal(body.total, 20); assert.equal(body.page, 1); assert.equal(body.totalPages, 1); assert.equal(body.unreadCount, 20);
  });

  test("database failures return generic private errors and roll back any attempted read update", async () => {
    state.failCount = true;
    for (const action of [() => list(), () => read("n001"), () => readAll(), () => readDocument("own")]) {
      const before = structuredClone(state.rows);
      const response = await action(); privateResponse(response, 500);
      assert.equal(JSON.stringify(await response.json()).includes("private"), false); assert.deepEqual(state.rows, before);
    }
  });
});
