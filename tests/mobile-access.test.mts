import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";
import { hashPassword } from "../src/lib/password.ts";

// Test the actual authentication and route handlers; database and external effects are isolated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const token = "a".repeat(43);
const state: Row = { session: null, users: [], creates: [], effects: [], lookups: [] };
const prisma = {
  mobileSession: {
    async findUnique(input: Row) { state.lookups.push(input); return state.session; },
    async create(input: Row) { state.creates.push(input.data); },
    async delete(input: Row) { assert.equal(input.where.id, state.session.id); state.session = null; },
  },
  user: { async findMany() { return state.users; } },
  attachment: { async findFirst(input: Row) { state.effects.push(input); return null; } },
};
const key = "__mobileAccessHarness";
(globalThis as Row)[key] = { state, prisma };
const moduleUrl = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const effectsUrl = moduleUrl(`
  export const prisma = globalThis.${key}.prisma;
  const state = globalThis.${key}.state;
  export async function getReadableDocumentById(...args) { state.effects.push(args); return null; }
  export async function recordLoginHistory(input) { state.effects.push(input); }
  export async function ensureStaffLeaveAccrualsForUser() {}
  export async function approveCurrentApprovalStep() { throw new Error('Unexpected decision'); }
  export async function rejectCurrentApprovalStep() { throw new Error('Unexpected decision'); }
  export async function attachStampedApprovalPdfToDocument() { throw new Error('Unexpected PDF generation'); }
  export async function readApprovalAttachmentFile() { throw new Error('Unexpected attachment read'); }
  export async function markDocumentNotificationsRead() { throw new Error('Unexpected notification write'); }
  export async function dispatchMobilePushDeliveries() { throw new Error('Unexpected push dispatch'); }
  export function revalidatePath() { throw new Error('Unexpected revalidation'); }
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
  "@/lib/login-history", "@/lib/staff-leave", "@/lib/mobile-push", "next/cache",
].map(name => [name, effectsUrl]));
replacements["@/lib/mobile-auth"] = authUrl;
const route = (path: string) => import(compile(`app/api/mobile/${path}/route.ts`, replacements));
const handlers = await Promise.all([
  ["auth/me", "GET"], ["inbox", "GET"], ["notifications", "GET"],
  ["notifications/read-document", "POST"], ["documents/[id]", "GET"],
  ["documents/[id]/decision", "POST"], ["attachments/[id]/preview", "GET"],
  ["push-subscription", "GET"], ["push-subscription", "POST"], ["push-subscription", "DELETE"],
].map(async ([path, method]) => ({ path, method, handler: (await route(path!))[method!] })));
const login = (await route("auth/login")).POST;
const logout = (await route("auth/logout")).POST;
const dispatch = (await route("push-dispatch")).GET;
function activeSession() {
  return { id: "session", userId: "staff", expiresAt: new Date(Date.now() + 60_000),
    user: { id: "staff", name: "Test staff", role: "USER", status: "ACTIVE" } };
}
const request = (path: string, authorization?: string, method = "GET", body?: unknown) => new Request(`https://example.test/api/mobile/${path}`, {
  method,
  headers: { ...(authorization ? { Authorization: authorization } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
beforeEach(() => Object.assign(state, { session: null, users: [], creates: [], effects: [], lookups: [] }));
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
    state.users = [{ id:"staff", name:"Test staff", role:"USER", status:"ACTIVE", passwordHash:hashPassword("correct") }];
    const response = await login(request("auth/login", undefined, "POST", {name:"Test staff", password:"correct"}));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.user, {id:"staff", name:"Test staff", role:"USER"});
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
      const entry = handlers.find(row=>row.path === path)!;
      const response = await entry.handler(request(path, "Bearer " + token, entry.method,
        entry.method === "POST" ? {decision:"approve"} : undefined), { params:Promise.resolve({id:"other-document"}) });
      assert.equal(response.status, 404);
    }
    assert.deepEqual(state.effects[0], ["other-document", "staff", "USER"]);
    assert.deepEqual(state.effects[1], ["other-document", "staff", "USER"]);
    assert.ok(JSON.stringify(state.effects[2].where.document).includes("staff"));
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
