import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";
import { hashPassword } from "../src/lib/password.ts";

// Test the actual authentication and route handlers; database and external effects are isolated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const token = "a".repeat(43);
const state: Row = { session: null, users: [], creates: [], effects: [], lookups: [], document: null, dashboard: null };
const prisma = {
  mobileSession: {
    async findUnique(input: Row) { state.lookups.push(input); return state.session; },
    async create(input: Row) { state.creates.push(input.data); },
    async delete(input: Row) { assert.equal(input.where.id, state.session.id); state.session = null; },
  },
  user: { async findMany() { return state.users; } },
  attachment: { async findFirst(input: Row) { state.effects.push(input); return null; } },
  approvalDocument: {
    async count(input: Row) { state.effects.push(input); return 0; },
    async findMany(input: Row) { state.effects.push(input); return []; },
  },
};
const key = "__mobileAccessHarness";
(globalThis as Row)[key] = { state, prisma };
const moduleUrl = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const effectsUrl = moduleUrl(`
  export const prisma = globalThis.${key}.prisma;
  const state = globalThis.${key}.state;
  export async function getReadableDocumentById(...args) { state.effects.push(args); return state.document; }
  export async function getHomeDashboardData(...args) { state.effects.push(args); return state.dashboard; }
  export async function recordLoginHistory(input) { state.effects.push(input); }
  export async function ensureStaffLeaveAccrualsForUser() {}
  export async function approveCurrentApprovalStep(...args) { state.effects.push(['approve', ...args]); return {ok:true, documentId:args[0]}; }
  export async function rejectCurrentApprovalStep(...args) { state.effects.push(['reject', ...args]); return {ok:true, documentId:args[0]}; }
  export async function attachStampedApprovalPdfToDocument(...args) { state.effects.push(['pdf', ...args]); }
  export async function readApprovalAttachmentFile() { throw new Error('Unexpected attachment read'); }
  export async function markDocumentNotificationsRead() { throw new Error('Unexpected notification write'); }
  export async function dispatchMobilePushDeliveries() { throw new Error('Unexpected push dispatch'); }
  export function revalidatePath(...args) { state.effects.push(['revalidate', ...args]); }
`);
function compile(file: string, replacements: Record<string, string>) {
  let source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`"${from}"`, JSON.stringify(to));
  return moduleUrl(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
const authUrl = compile("lib/mobile-auth.ts", { "@/lib/prisma": effectsUrl });
const { getMobileSession, hashMobileToken, createMobileSession } = await import(authUrl);
const replacements = Object.fromEntries([
  "@/lib/prisma", "@/lib/approval-queries", "@/lib/approval-mutations",
  "@/lib/generated-approval-pdf", "@/lib/approval-attachment-file", "@/lib/notifications",
  "@/lib/login-history", "@/lib/staff-leave", "@/lib/mobile-push", "@/lib/home-dashboard", "next/cache",
].map(name => [name, effectsUrl]));
replacements["@/lib/mobile-auth"] = authUrl;
const route = (path: string) => import(compile(`app/api/mobile/${path}/route.ts`, replacements));
const handlers = await Promise.all([
  ["auth/me", "GET"], ["home", "GET"], ["inbox", "GET"], ["notifications", "GET"],
  ["notifications/read-document", "POST"], ["documents/[id]", "GET"],
  ["documents/[id]/decision", "POST"], ["attachments/[id]/preview", "GET"],
  ["push-subscription", "GET"], ["push-subscription", "POST"], ["push-subscription", "DELETE"],
].map(async ([path, method]) => ({ path, method, handler: (await route(path!))[method!] })));
const login = (await route("auth/login")).POST;
const logout = (await route("auth/logout")).POST;
const dispatch = (await route("push-dispatch")).GET;
function activeSession(positionName = "생활지도원", role = "USER") {
  return { id: "session", userId: "staff", expiresAt: new Date(Date.now() + 60_000),
    user: { id: "staff", name: "Test staff", role, status: "ACTIVE", position: {name:positionName} } };
}
const request = (path: string, authorization?: string, method = "GET", body?: unknown) => new Request(`https://example.test/api/mobile/${path}`, {
  method,
  headers: { ...(authorization ? { Authorization: authorization } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
beforeEach(() => Object.assign(state, { session: null, users: [], creates: [], effects: [], lookups: [], document: null, dashboard: null }));
after(() => { delete (globalThis as Row)[key]; });

describe("staff-only mobile access", () => {
  test("rejects malformed tokens without a database lookup", async () => {
    for (const header of [undefined, "Basic password", "Bearer short", "Bearer " + token + " extra"]) {
      assert.equal(await getMobileSession(request("auth/me", header)), null);
    }
    assert.equal(state.lookups.length, 0);
  });
  test("looks up the token hash and permits only an unexpired active employee", async () => {
    state.session = activeSession();
    assert.equal((await getMobileSession(request("auth/me", "Bearer " + token))).userId, "staff");
    assert.deepEqual(state.lookups[0].where, { tokenHash: hashMobileToken(token) });
    for (const status of ["INACTIVE", "RESIGNED"]) {
      state.session.user.status = status;
      assert.equal(await getMobileSession(request("auth/me", "Bearer " + token)), null);
    }
    state.session = activeSession(); state.session.expiresAt = new Date(0);
    assert.equal(await getMobileSession(request("auth/me", "Bearer " + token)), null);
  });
  test("every protected endpoint rejects missing, unknown, expired and inactive sessions", async () => {
    for (const kind of ["missing", "unknown", "expired", "inactive"]) {
      state.session = kind === "expired" || kind === "inactive" ? activeSession() : null;
      if (kind === "expired") state.session.expiresAt = new Date(0);
      if (kind === "inactive") state.session.user.status = "RESIGNED";
      for (const { path, method, handler } of handlers) {
        const response = await handler(request(path, kind === "missing" ? undefined : "Bearer " + token, method), { params: Promise.resolve({id:"other-document"}) });
        assert.equal(response.status, 401, `${kind}: ${method} ${path}`);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        assert.equal(response.headers.get("location"), null);
      }
    }
    assert.equal(state.effects.length, 0);
  });
  test("stores only a hash of a random token with a bounded lifetime", async () => {
    const session = await createMobileSession("staff");
    assert.match(session.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(state.creates[0].tokenHash, hashMobileToken(session.token));
    assert.equal(state.creates[0].userId, "staff");
    assert.equal("token" in state.creates[0], false);
    assert.ok(new Date(session.expiresAt).getTime() - Date.now() <= 30 * 86_400_000);
  });
  test("invalid credentials and inactive accounts cannot create a mobile session", async () => {
    for (const [status, password] of [["ACTIVE", "incorrect"], ["RESIGNED", "correct"]]) {
      state.users = [{ id:"staff", name:"Test staff", role:"USER", status, passwordHash:hashPassword("correct") }];
      const response = await login(request("auth/login", undefined, "POST", {name:"Test staff", password}));
      assert.equal(response.status, 401);
    }
    assert.equal(state.creates.length, 0);
  });
  test("valid staff login returns a token and safe user fields", async () => {
    state.users = [{ id:"staff", name:"Test staff", role:"USER", status:"ACTIVE", passwordHash:hashPassword("correct"), position:{name:"생활지도원"} }];
    const response = await login(request("auth/login", undefined, "POST", {name:"Test staff", password:"correct"}));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.user, {id:"staff", name:"Test staff", role:"USER", positionName:"생활지도원", canApproveDocuments:false});
    assert.equal(state.creates[0].tokenHash, hashMobileToken(body.token));
  });
  test("logout revokes the current session and later requests fail", async () => {
    state.session = activeSession();
    assert.equal((await logout(request("auth/logout", "Bearer " + token, "POST"))).status, 200);
    const me = handlers.find(row=>row.path === "auth/me")!;
    assert.equal((await me.handler(request("auth/me", "Bearer " + token))).status, 401);
  });
  test("document detail, decision and attachment use the logged-in employee's read policy", async () => {
    state.session = activeSession();
    for (const path of ["documents/[id]", "documents/[id]/decision", "attachments/[id]/preview"]) {
      state.session = activeSession(path.endsWith("/decision") ? "시설장" : "생활지도원");
      const entry = handlers.find(row=>row.path === path)!;
      const response = await entry.handler(request(path, "Bearer " + token, entry.method,
        entry.method === "POST" ? {decision:"approve"} : undefined), { params:Promise.resolve({id:"other-document"}) });
      assert.equal(response.status, 404);
    }
    assert.deepEqual(state.effects[0], ["other-document", "staff", "USER"]);
    assert.deepEqual(state.effects[1], ["other-document", "staff", "USER"]);
    assert.ok(JSON.stringify(state.effects[2].where.document).includes("staff"));
  });
  test("mobile approval capability follows position, including administrator accounts", async () => {
    const me = handlers.find(row => row.path === "auth/me")!;
    for (const [position, role, allowed] of [["생활지도원", "USER", false], ["팀장", "ADMIN", false], ["시설장", "USER", true]]) {
      state.session = activeSession(String(position), String(role));
      const body = await (await me.handler(request("auth/me", "Bearer " + token))).json();
      assert.equal(body.user.canApproveDocuments, allowed);
      assert.equal(body.user.positionName, position);
    }
  });
  test("non-head employees cannot load an approval queue or submit either decision", async () => {
    for (const role of ["USER", "ADMIN"]) {
      state.session = activeSession("생활지도원", role);
      const inbox = handlers.find(row => row.path === "inbox")!;
      assert.equal((await inbox.handler(request("inbox", "Bearer " + token))).status, 403);
      const decision = handlers.find(row => row.path === "documents/[id]/decision")!;
      for (const action of ["approve", "reject"]) {
        assert.equal((await decision.handler(request(decision.path, "Bearer " + token, "POST", {decision:action, comment:"사유"}),
          {params:Promise.resolve({id:"document"})})).status, 403);
      }
    }
    assert.equal(state.effects.length, 0);
  });
  test("employee home requests only personal progress and never returns the approval queue", async () => {
    state.session = activeSession();
    state.dashboard = {
      counts: {activeSent:1, recalled:2, activeInbox:999},
      inboxDocuments: [{id:"other-document"}],
      sentDocuments: [{id:"own-document", title:"내 문서", documentNo:"D-1", status:"submitted", submittedAt:null,
        drafter:{name:"Test staff", profileImageStorageKey:"private-storage-key"}, currentApprover:{name:"Facility head"}}],
    };
    const home = handlers.find(row => row.path === "home")!;
    const body = await (await home.handler(request("home", "Bearer " + token))).json();
    assert.deepEqual(state.effects[0], ["staff", {includeApprovalQueue:false}]);
    assert.equal(body.canApproveDocuments, false);
    assert.deepEqual(body.counts, {activeSent:1, recalled:2});
    assert.equal("inboxDocuments" in body, false);
    assert.equal(body.sentDocuments[0].id, "own-document");
    assert.equal(body.sentDocuments[0].currentApproverName, "Facility head");
    assert.equal(JSON.stringify(body).includes("private-storage-key"), false);
  });
  test("facility head home and inbox use their own identity", async () => {
    state.session = activeSession("시설장");
    state.dashboard = {counts:{activeSent:0, recalled:0, activeInbox:0}, inboxDocuments:[], sentDocuments:[]};
    const home = handlers.find(row => row.path === "home")!;
    const body = await (await home.handler(request("home", "Bearer " + token))).json();
    assert.deepEqual(state.effects[0], ["staff", {includeApprovalQueue:true}]);
    assert.equal(body.canApproveDocuments, true);
    assert.deepEqual(body.inboxDocuments, []);
    const inbox = handlers.find(row => row.path === "inbox")!;
    assert.equal((await inbox.handler(request("inbox", "Bearer " + token))).status, 200);
    assert.equal(state.effects[1].where.approvalSteps.some.approverId, "staff");
    assert.equal(state.effects[2].where.approvalSteps.some.approverId, "staff");
  });
  test("detail offers decisions only to the facility head in the current pending step", async () => {
    const detail = handlers.find(row => row.path === "documents/[id]")!;
    for (const [position, approverId, status, canDecide] of [
      ["생활지도원", "staff", "submitted", false],
      ["시설장", "other", "submitted", false],
      ["시설장", "staff", "approved", false],
      ["시설장", "staff", "submitted", true],
    ]) {
      state.session = activeSession(String(position));
      state.document = {id:"document", status, drafter:{name:"Test staff"}, attachments:[],
        approvalSteps:[{id:"step", order:1, approverId, status:"pending", approver:{name:"Approver"}}]};
      const body = await (await detail.handler(request(detail.path, "Bearer " + token), {params:Promise.resolve({id:"document"})})).json();
      assert.equal(body.document.canDecide, canDecide);
    }
    state.session = activeSession();
    state.document.attachments = [{originalName:"data.xlsx", mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}];
    const body = await (await detail.handler(request(detail.path, "Bearer " + token), {params:Promise.resolve({id:"document"})})).json();
    assert.equal(body.document.canDecide, false);
    assert.equal(body.document.decisionBlockedReason, null);
  });
  test("facility head cannot decide another approver's pending step", async () => {
    state.session = activeSession("시설장");
    state.document = {id:"document", status:"submitted", attachments:[], approvalSteps:[{approverId:"other", status:"pending"}]};
    const decision = handlers.find(row => row.path === "documents/[id]/decision")!;
    const response = await decision.handler(request(decision.path, "Bearer " + token, "POST", {decision:"approve"}),
      {params:Promise.resolve({id:"document"})});
    assert.equal(response.status, 403);
    assert.deepEqual(state.effects, [["document", "staff", "USER"]]);
  });
  test("facility head can approve or reject their own current step", async () => {
    state.session = activeSession("시설장");
    state.document = {id:"document", status:"submitted", attachments:[], approvalSteps:[{approverId:"staff", status:"pending"}]};
    const decision = handlers.find(row => row.path === "documents/[id]/decision")!;
    for (const action of ["approve", "reject"]) {
      const response = await decision.handler(request(decision.path, "Bearer " + token, "POST", {decision:action, comment:"사유"}),
        {params:Promise.resolve({id:"document"})});
      assert.equal(response.status, 200);
      assert.ok(state.effects.some((effect: Row) => effect[0] === action && effect[2] === "staff"));
    }
  });
  test("push dispatch never accepts employee tokens or a missing dispatcher secret", async () => {
    const previous = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      assert.equal((await dispatch(request("push-dispatch", "Bearer " + token))).status, 401);
      process.env.CRON_SECRET = "test-dispatch-secret";
      assert.equal((await dispatch(request("push-dispatch", "Bearer " + token))).status, 401);
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous;
    }
    assert.equal(state.effects.length, 0);
  });
});
