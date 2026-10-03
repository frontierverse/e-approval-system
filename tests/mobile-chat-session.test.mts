import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

// Execute the current provider. Storage, native cleanup and transport are the
// boundaries; no native UI, real account or network request is involved.
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const source = readFileSync(new URL("../mobile/src/lib/session.tsx", import.meta.url), "utf8");
const same = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
function harness({ stored = null, heldCleanup = false }: { stored?: string | null; heldCleanup?: boolean } = {}) {
  let cursor = 0, alive = true, scheduled = false, tree: Row, saved = stored, heldWrite = false;
  const pendingWrites: (() => void)[] = [];
  const cells: Row[] = [], effects: (() => void)[] = [], events: string[] = [], requests: Row[] = [], pendingCleanup: (() => void)[] = [];
  const schedule = () => { if (!scheduled && alive) { scheduled = true; queueMicrotask(() => { scheduled = false; if (alive) render(); }); } };
  const hook = (kind: string, initial: Row) => { const i = cursor++; cells[i] ??= { kind, ...initial }; assert.equal(cells[i].kind, kind); return cells[i]; };
  const react: Row = {
    createContext: () => ({ Provider: "Provider" }), useContext: () => tree.props.value,
    useState(initial: unknown) { const cell = hook("state", { value: initial }); cell.set ??= (next: unknown) => { cell.value = typeof next === "function" ? next(cell.value) : next; schedule(); }; return [cell.value, cell.set]; },
    useRef(initial: unknown) { return hook("ref", { value: { current: initial } }).value; },
    useCallback(fn: unknown, deps: unknown[]) { const cell = hook("callback", {}); if (!same(cell.deps, deps)) { cell.deps = deps; cell.value = fn; } return cell.value; },
    useMemo(fn: () => unknown, deps: unknown[]) { const cell = hook("memo", {}); if (!same(cell.deps, deps)) { cell.deps = deps; cell.value = fn(); } return cell.value; },
    useEffect(fn: () => unknown, deps: unknown[]) { const cell = hook("effect", {}); if (!same(cell.deps, deps)) effects.push(() => { cell.cleanup?.(); cell.deps = deps; cell.cleanup = fn(); }); },
  };
  const imports: Row = {
    react, "react/jsx-runtime": { jsx: (type: unknown, props: unknown) => ({ type, props }) }, "react-native": { Platform: { OS: "ios" } },
    "expo-secure-store": { async getItemAsync() { events.push("storage:read"); return saved; }, async setItemAsync(_key: string, value: string) { events.push("storage:set"); if (heldWrite) await new Promise<void>(resolve => pendingWrites.push(resolve)); saved = value; }, async deleteItemAsync() { events.push("storage:delete"); saved = null; } },
    "./api": { ApiError, apiRequest(path: string, options: unknown) { events.push("api:" + path); return new Promise((resolve, reject) => requests.push({ path, options, resolve, reject, settled: false })); } },
    "./attachment-transfer": { async clearAttachmentTransferCache() { events.push("attachment:clear"); } },
    "./account-image": { async clearAccountImageResources() { events.push("image:clear"); } },
    "./chat-file-transfer": { clearChatFileResources() { events.push("chat:invalidate"); return heldCleanup ? new Promise<void>(resolve => pendingCleanup.push(resolve)) : Promise.resolve(); } },
  };
  const code = ts.transpileModule(source, { fileName: "session.tsx", compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const providerModule = { exports: {} as Row };
  new Function("require", "module", "exports", code)((name: string) => { assert(Object.hasOwn(imports, name), name); return imports[name]; }, providerModule, providerModule.exports);
  function render() { cursor = 0; tree = providerModule.exports.SessionProvider({ children: "synthetic" }); for (const effect of effects.splice(0)) effect(); }
  render();
  return {
    events, requests, pendingCleanup, pendingWrites, holdWrites() { heldWrite = true; }, get session() { return tree.props.value; }, get saved() { return saved; },
    resolve(path: string, result: unknown) { const entry = requests.find(r => !r.settled && r.path === path); assert(entry, path); entry.settled = true; entry.resolve(result); },
    reject(path: string, cause: unknown) { const entry = requests.find(r => !r.settled && r.path === path); assert(entry, path); entry.settled = true; entry.reject(cause); },
    destroy() { alive = false; for (const cell of cells) cell.cleanup?.(); },
  };
}
const user = (id: string) => ({ id, name: "가상 직원 " + id });
async function login(h: ReturnType<typeof harness>, id: string) {
  const pending = h.session.signIn("가상 " + id, "fixture"); h.resolve("/auth/login", { token: "synthetic-" + id, user: user(id) }); await pending; await settle();
}

test("stored session is withheld until chat resource purge completes, before private auth lookup", async () => {
  const h = harness({ stored: "synthetic-a", heldCleanup: true }); await settle();
  assert.deepEqual(h.events, ["attachment:clear", "chat:invalidate"]); assert.equal(h.session.token, null); assert.equal(h.session.loading, true);
  h.pendingCleanup.shift()!(); await settle(); assert(h.events.indexOf("image:clear") > h.events.indexOf("chat:invalidate"));
  assert(h.events.indexOf("storage:read") > h.events.indexOf("image:clear")); assert.equal(h.requests[0].path, "/auth/me");
  h.resolve("/auth/me", { user: user("a") }); await settle(); assert.equal(h.session.token, "synthetic-a"); h.destroy();
});
test("successful account switch waits for chat purge before publishing the new session", async () => {
  const h = harness({ heldCleanup: true }); h.pendingCleanup.shift()!(); await settle();
  const pending = h.session.signIn("가상 b", "fixture"); h.resolve("/auth/login", { token: "synthetic-b", user: user("b") }); await settle();
  assert.equal(h.pendingCleanup.length, 1); assert.equal(h.session.token, null); assert.equal(h.saved, null);
  h.pendingCleanup.shift()!(); await pending; await settle(); assert.equal(h.session.token, "synthetic-b"); assert.equal(h.saved, "synthetic-b"); h.destroy();
});
test("logout invalidates chat operations immediately and persists the empty session", async () => {
  const h = harness(); await settle(); await login(h, "a"); const before = h.events.length;
  const expired = h.session.expireSession("synthetic-a"); assert.equal(h.events[before], "chat:invalidate");
  await expired; await settle(); assert.equal(h.session.token, null); assert.equal(h.session.user, null); assert.equal(h.saved, null); h.destroy();
});
test("late old-account 401 cannot purge chat files or log out a newer session", async () => {
  const h = harness(); await settle(); await login(h, "a");
  const old = h.session.request("/chat").catch((cause: unknown) => cause); await login(h, "b"); const before = h.events.filter(v => v === "chat:invalidate").length;
  h.reject("/chat", new ApiError("old account expired", 401)); const cause = await old; await settle();
  assert(cause instanceof ApiError); assert.equal(h.events.filter(v => v === "chat:invalidate").length, before);
  assert.equal(h.session.token, "synthetic-b"); assert.equal(h.saved, "synthetic-b"); h.destroy();
});
test("failed login preserves the current account and does not release its chat resources", async () => {
  const h = harness(); await settle(); await login(h, "a"); const before = h.events.filter(v => v === "chat:invalidate").length;
  const pending = h.session.signIn("가상 b", "invalid"); h.reject("/auth/login", new ApiError("invalid", 401)); await assert.rejects(pending); await settle();
  assert.equal(h.events.filter(v => v === "chat:invalidate").length, before); assert.equal(h.session.token, "synthetic-a"); h.destroy();
});


test("account switch invalidates work started during the delayed encrypted token write", async () => {
  const h = harness(); await settle(); await login(h, "a"); h.holdWrites();
  const switched = h.session.signIn("가상 b", "fixture"); h.resolve("/auth/login", { token: "synthetic-b", user: user("b") }); await settle();
  assert.equal(h.session.token, "synthetic-a"); assert.equal(h.pendingWrites.length, 1);
  const purgesDuringWrite = h.events.filter(v => v === "chat:invalidate").length;
  h.pendingWrites.shift()!(); await switched; await settle();
  assert.equal(h.events.filter(v => v === "chat:invalidate").length, purgesDuringWrite + 1);
  assert.equal(h.session.token, "synthetic-b"); assert.equal(h.saved, "synthetic-b"); h.destroy();
});
