import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { ApiError } from "../mobile/src/lib/api.ts";

// Run the production hook with controlled focus, effects and deferred API responses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const key = "__notificationPageHarness", state: Row = {};
const same = (a: unknown[] | undefined, b: unknown[]) => !!a && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
function reset() { Object.assign(state, { slots: [], cursor: 0, effects: [], layouts: [], requests: [], counts: [], opens: [], token: "account-a", user: { id: "user-a" }, revision: 0, focusSlot: null }); }
reset();
function cell() { return state.slots[state.cursor++] ??= {}; }
const request = (path: string, options?: Row) => new Promise((resolve, reject) => state.requests.push({ path, options, resolve, reject }));
const setUnreadCount = (n: number | null) => state.counts.push(n);
const openNotificationDocument = (id: string, active: () => boolean) => new Promise((resolve, reject) => state.opens.push({ id, active, resolve, reject }));
const scheduleEffect = (fn: () => unknown, deps: unknown[], layouts = false) => { const c = cell(); if (!same(c.deps, deps)) { c.deps = deps; c.fn = fn; (layouts ? state.layouts : state.effects).push(c); } };
(globalThis as Row)[key] = {
  ApiError,
  useRef: (initial: unknown) => { const c = cell(); return c.ref ??= { current: initial }; },
  useState: (initial: unknown) => { const c = cell(); if (!c.state) { c.state = { value: initial }; c.set = (next: unknown) => { c.state.value = typeof next === "function" ? next(c.state.value) : next; }; } return [c.state.value, c.set]; },
  useCallback: (fn: unknown, deps: unknown[]) => { const c = cell(); if (!same(c.deps, deps)) { c.deps = deps; c.value = fn; } return c.value; },
  useEffect: scheduleEffect, useLayoutEffect: (fn: () => unknown, deps: unknown[]) => scheduleEffect(fn, deps, true),
  useFocusEffect: (fn: unknown) => { const c = cell(); c.fn = fn; state.focusSlot = c; },
  useSession: () => ({ request, token: state.token, user: state.user }),
  useNotifications: () => ({ setUnreadCount, openNotificationDocument, notificationRevision: state.revision }),
};
let source = readFileSync(new URL("../mobile/src/lib/use-notification-page.ts", import.meta.url), "utf8");
source = source.replace(/^import .* from "(expo-router|react|\.\/api|\.\/notifications|\.\/session)";$/gm, "");
source = `const {useFocusEffect,useCallback,useEffect,useLayoutEffect,useRef,useState,ApiError,useNotifications,useSession}=globalThis.${key};\n` + source;
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { useNotificationPage: readNotificationPageState } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
function render(filter = "all", page = 1) {
  state.cursor = 0; const value = readNotificationPageState(filter, page);
  for (const c of [...state.layouts.splice(0), ...state.effects.splice(0)]) { c.cleanup?.(); c.cleanup = c.fn(); }
  return value;
}
function focus() { state.focusSlot.cleanup?.(); state.focusSlot.cleanup = state.focusSlot.fn(); }
function blur() { state.focusSlot.cleanup?.(); state.focusSlot.cleanup = null; }
const tick = () => new Promise(resolve => setImmediate(resolve));
const item = (id = "n1", documentId = "doc1", readAt: string | null = null) => ({ id, documentId, title: "예시 알림", message: "예시 메시지", readAt, createdAt: "2026-10-05T00:30:00.000Z" });
const response = (rows = [item()], total = rows.length, unreadCount = rows.filter(r => !r.readAt).length, page = 1) => ({ notifications: rows, total, unreadCount, page, pageSize: 20, totalPages: Math.max(1, Math.ceil(total / 20)) });
async function ready(filter = "all", page = 1, data = response()) { render(filter, page); focus(); state.requests[0].resolve(data); await tick(); return render(filter, page); }
beforeEach(reset);
after(() => { delete (globalThis as Row)[key]; });

test("refreshes coalesce, preserve the prior observation on transport failure and recover", async () => {
  const current = await ready(), time = current.loadedAt;
  void current.reload(); void current.reload(); assert.equal(state.requests.length, 2);
  state.requests[1].reject(new ApiError("offline", 503)); await tick();
  const failed = render(); assert.equal(failed.data.total, 1); assert.equal(failed.loadedAt, time); assert.equal(failed.loading, false);
  void failed.retry(); state.requests[2].resolve(response([item(), item("n2")], 2, 2)); await tick();
  assert.equal(render().data.total, 2); assert.equal(render().error, null);
});
test("late filter and old account results never overwrite the active list or count", async () => {
  render(); focus(); render("unread"); focus();
  state.requests[1].resolve(response([item("current")], 1, 1)); await tick(); state.requests[0].resolve(response([], 99, 99)); await tick();
  assert.equal(render("unread").data.notifications[0].id, "current"); assert.deepEqual(state.counts, [1]);
  void render("unread").reload(); state.token = "account-b"; state.user = { id: "user-b" };
  assert.equal(render("unread").data, null); state.requests[2].resolve(response([item("private")], 7, 7)); await tick();
  assert.equal(render("unread").data, null); assert.deepEqual(state.counts, [1]);
});
test("read taps deduplicate and modify only the selected row after confirmed success", async (t) => {
  let clock = 1234; t.mock.method(Date, "now", () => clock);
  const current = await ready("all", 1, response([item(), item("n2", "doc1")], 2, 2));
  clock = 5678;
  const pending = current.run({ kind: "read", item: item() }); void current.run({ kind: "read", item: item() });
  assert.equal(state.requests.length, 2); assert.equal(render().data.unreadCount, 2);
  state.requests[1].resolve({ ok: true, updatedCount: 1, unreadCount: 1 }); await pending;
  const changed = render(); assert.ok(changed.data.notifications[0].readAt); assert.equal(changed.data.notifications[1].readAt, null); assert.equal(changed.data.unreadCount, 1);
  assert.equal(changed.loadedAt, 1234); // A POST is not a successful list observation.
  assert.equal(state.opens.length, 0); assert.equal(state.requests[2].path, "/notifications?filter=all&page=1");
});
test("failed or unconfirmed reads preserve rows and count and retry the same action", async () => {
  for (const invalid of [false, true]) {
    reset(); const current = await ready(); const pending = current.run({ kind: "read", item: item() });
    if (invalid) state.requests[1].resolve({ ok: false, unreadCount: 0, updatedCount: 1 }); else state.requests[1].reject(new ApiError("failed", 503));
    await pending; const failed = render(); assert.equal(failed.data.notifications[0].readAt, null); assert.equal(failed.data.unreadCount, 1); assert.equal(failed.message, null);
    void failed.retry(); assert.equal(state.requests[2].path, "/notifications/n1/read");
  }
});
test("read-all uses server unread count when a new notification arrives during the mutation", async () => {
  const current = await ready(); const pending = current.run({ kind: "all" });
  state.requests[1].resolve({ ok: true, updatedCount: 1, unreadCount: 1 }); await pending;
  assert.equal(render().data.unreadCount, 1); assert.equal(state.counts.at(-1), 1);
  state.requests[2].resolve(response([item("new"), item("n1", "doc1", "read")], 2, 1)); await tick();
  assert.equal(render().data.notifications[0].id, "new"); assert.equal(render().data.unreadCount, 1);
});
test("last unread page is bounded after a read and the server's clamped page remains authoritative", async () => {
  const current = await ready("unread", 2, response([item("n21")], 21, 21, 2));
  const pending = current.run({ kind: "read", item: item("n21") }); state.requests[1].resolve({ ok: true, updatedCount: 1, unreadCount: 20 }); await pending;
  assert.equal(render("unread", 2).data.page, 1); assert.equal(render("unread", 2).data.totalPages, 1);
  state.requests[2].resolve(response([item("page1")], 20, 20, 1)); await tick();
  assert.equal(render("unread", 2).data.page, 1); assert.equal(render("unread", 2).data.notifications[0].id, "page1");
});
test("401 and 403 discard cached list, observation and badge count", async () => {
  for (const status of [401, 403]) {
    reset(); const current = await ready(); void current.reload(); state.requests[1].reject(new ApiError("denied", status)); await tick();
    const failed = render(); assert.equal(failed.data, null); assert.equal(failed.loadedAt, null); assert.equal(state.counts.at(-1), null); assert.equal(failed.error.status, status);
  }
});
test("404 hides old document text and re-queries the current readable list", async () => {
  const current = await ready(); const pending = current.run({ kind: "open", item: item() }); state.opens[0].reject(new ApiError("not found", 404)); await pending;
  assert.equal(render().data, null); assert.equal(state.counts.at(-1), null); assert.equal(state.requests[1].path, "/notifications?filter=all&page=1");
  state.requests[1].resolve(response([], 0, 0)); await tick(); assert.equal(render().data.total, 0); assert.equal(render().error.status, 404);
});
test("leaving and re-entering during a document open cancels old navigation and resumes queued refresh", async () => {
  const current = await ready(); const pending = current.run({ kind: "open", item: item() }); assert.equal(state.opens[0].active(), true);
  blur(); focus(); assert.equal(state.opens[0].active(), false); assert.equal(state.requests.length, 1);
  const error = new Error("cancelled"); error.name = "AbortError"; state.opens[0].reject(error); await pending;
  assert.equal(render().error, null); assert.equal(state.requests[1].path, "/notifications?filter=all&page=1");
});
test("a push refresh blocked by a mutation resumes without losing its scope", async () => {
  const current = await ready("unread"); const pending = current.run({ kind: "read", item: item() });
  state.revision++; render("unread"); focus(); state.requests[1].resolve({ ok: true, updatedCount: 1, unreadCount: 0 }); await pending;
  assert.equal(state.requests[2].path, "/notifications?filter=unread&page=1");
  state.requests[2].resolve(response([], 0, 0)); await tick(); assert.equal(render("unread").data.unreadCount, 0);
});
