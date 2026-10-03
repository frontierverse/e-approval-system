import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { ApiError } from "../mobile/src/lib/api";
import * as tasks from "../mobile/src/lib/tasks";

// Production TSX is executed with lexical React/native/navigation/session boundaries.
// These tests do not claim physical keyboard, screen-reader, or OS navigation verification.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const key = "__mobileTaskClientBoundary";
const state: Row = {};
let rendering: Hooks;
function activate(scope: Hooks) { rendering = scope; }
const same = (a: unknown[] | undefined, b: unknown[]) => !!a && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
class Hooks {
  slots: Row[] = []; index = 0; effects: Row[] = []; tree: Row = {}; token = "account-a"; props: Row; prevent: Row = {};
  constructor(public kind: "editor" | "detail", props: Row = {}) { this.props = props; }
  render() {
    activate(this); this.index = 0;
    const props = { taskId: "own-task", page: 1, created: false, ...this.props, isCurrentAccount: () => state.account === this.token };
    this.tree = this.kind === "editor" ? editor.TaskEditorContent(props) : detail.TaskDetailContent(props);
    return this.tree;
  }
  flush() { for (const item of this.effects.splice(0)) { item.slot.cleanup?.(); item.slot.cleanup = item.slot.fn(); } }
  unmount() { for (const cell of this.slots) cell.cleanup?.(); }
  replay() { for (const cell of this.slots) if (cell.effect) { cell.cleanup?.(); cell.cleanup = cell.fn(); } }
}
function slot() { const index = rendering.index++; return rendering.slots[index] ?? (rendering.slots[index] = {}); }
function effect(fn: () => unknown, deps: unknown[]) {
  const cell = slot(); cell.effect = true;
  if (!same(cell.deps, deps)) { cell.deps = deps; cell.fn = fn; rendering.effects.push({ slot: cell }); }
}
const harness: Row = {
  ...tasks, ApiError,
  React: { createElement: (type: unknown, props: Row | null, ...children: unknown[]) => ({ type, props: { ...props, children } }), Fragment: "Fragment" },
  useRef: (initial: unknown) => { const cell = slot(); return cell.ref ?? (cell.ref = { current: initial }); },
  useState: (initial: unknown) => {
    const cell = slot();
    if (!cell.state) { cell.state = { value: typeof initial === "function" ? initial() : initial }; cell.setter = (next: unknown) => { cell.state.value = typeof next === "function" ? next(cell.state.value) : next; }; }
    return [cell.state.value, cell.setter];
  },
  useCallback: (fn: unknown, deps: unknown[]) => { const cell = slot(); if (!same(cell.deps, deps)) { cell.deps = deps; cell.value = fn; } return cell.value; },
  useEffect: effect, useLayoutEffect: effect, useFocusEffect: (fn: () => unknown) => effect(fn, [fn]),
  usePreventRemove: (enabled: boolean, callback: unknown) => { rendering.prevent = { enabled, callback }; },
  useNavigation: () => ({ dispatch: (action: unknown) => state.dispatched.push(action) }),
  useSafeAreaInsets: () => ({ top: 24, bottom: 16 }),
  useTheme: () => ({ background: "background", surface: "surface", border: "border", text: "text", secondary: "secondary", muted: "muted", accent: "accent", danger: "danger", success: "success", surfaceMuted: "muted" }),
  useConfirmAction: () => ({ dialog: null, ask: async (options: Row) => { state.confirmations.push(options); return state.confirmation; } }),
  useSession: () => {
    const token = rendering.token;
    return { token, user: { id: token }, request: (path: string, options: Row = {}) => { state.requests.push({ path, token, ...options }); return state.onRequest(path, options); } };
  },
  router: { replace: (value: unknown) => state.routes.push(value), push: (value: unknown) => state.routes.push(value), setParams: (value: unknown) => state.params.push(value) },
  Platform: { OS: "android" }, StyleSheet: { create: (value: unknown) => value },
  KeyboardAvoidingView: "KeyboardAvoidingView", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", View: "View", ActivityIndicator: "ActivityIndicator", RefreshControl: "RefreshControl",
  AccountFeedback: "AccountFeedback", PrimaryButton: "PrimaryButton", TextAction: "TextAction", EmptyState: "EmptyState",
};
(globalThis as Row)[key] = harness;
async function component(file: string, exports: string) {
  const source = readFileSync(new URL(`../mobile/src/components/${file}`, import.meta.url), "utf8");
  const injected = source.replace(/^import[\s\S]*?from "@\/lib\/types";\n/, `const {${Object.keys(harness).join(",")}} = globalThis.${key};\n`) + `\nexport {${exports}};\n`;
  const output = ts.transpileModule(injected, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}
const editor = await component("task-editor.tsx", "TaskEditorContent,TaskField");
const detail = await component("task-detail-screen.tsx", "TaskDetailContent,HistoryRow");
let scopes: Hooks[] = [];
const tick = async () => { await new Promise<void>(resolve => setImmediate(resolve)); };
const originalTask = () => ({ id: "own-task", title: "개인 업무 제목", description: "개인 상세 내용", meetingTitle: "개인 회의명", dueDate: "2026-10-02", assigneeId: "account-a", assigneeName: "직원", departmentName: "부서", completedAt: null, deletedAt: null, version: 3, createdAt: "2026-10-01T01:00:00Z", updatedAt: "2026-10-01T01:00:00Z" });
function history(task = state.task, page = 1) {
  return { task: { ...task }, today: "2026-10-03", page, pageSize: 20, total: 21, totalPages: 2,
    logs: [{ id: `log-${page}`, message: `개인 이력 ${page}`, actorName: "직원", changeType: "staffTask.create", changes: [{ field: "description", label: "상세 내용", before: null, after: "개인 이력 내용" }], createdAt: "2026-10-01T01:00:00Z" }] };
}
function saved(patch: Row = {}) { state.task = { ...state.task, ...patch, version: state.task.version + 1 }; return { ok: true, message: "저장했습니다.", task: { ...state.task } }; }
function deferred() { let resolve!: (value: unknown) => void; let reject!: (cause: unknown) => void; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; }
beforeEach(() => {
  for (const scope of scopes) scope.unmount(); scopes = [];
  Object.assign(state, { account: "account-a", task: originalTask(), requests: [], routes: [], params: [], dispatched: [], confirmations: [], confirmation: true });
  state.onRequest = async (path: string, options: Row) => path.includes("/history") ? history(state.task, Number(path.split("page=")[1])) : path === "/tasks" ? { ok: true, message: "등록했습니다.", task: { ...state.task, id: "new-task" } } : saved(options.method === "DELETE" ? { deletedAt: "2026-10-03T00:00:00Z" } : { completedAt: options.body.completed ? "2026-10-03T00:00:00Z" : null });
});
after(() => { for (const scope of scopes) scope.unmount(); delete (globalThis as Row)[key]; });
async function mount(kind: "editor" | "detail", props: Row = {}) { const scope = new Hooks(kind, props); scopes.push(scope); scope.render(); scope.flush(); await tick(); scope.render(); return scope; }
function nodes(tree: unknown): Row[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  const value = tree as Row; return [value, ...nodes(value.props?.children)];
}
function button(scope: Hooks, label: string): Row { const node = nodes(scope.tree).find(node => node.props?.title === label || node.props?.label === label); assert.ok(node, `Missing action ${label}`); return node; }
function change(scope: Hooks, name: string, value: string) { const node = nodes(scope.tree).find(node => node.type === editor.TaskField && node.props.name === name); assert.ok(node); node.props.onChange(name, value); scope.render(); }
function feedback(scope: Hooks, kind: string) { return nodes(scope.tree).filter(node => node.type === "AccountFeedback").map(node => node.props[kind]).filter(Boolean); }
function calls(method: string) { return state.requests.filter((row: Row) => row.method === method); }

test("registration shows validation feedback and retains original input after a server field error", async () => {
  const scope = await mount("editor"); button(scope, "할 일 등록").props.onPress(); await tick(); scope.render(); assert.equal(state.requests.length, 0); assert.ok(feedback(scope, "error").length);
  change(scope, "title", "  입력한 업무  "); change(scope, "description", "보존할 내용"); state.onRequest = async () => { throw new ApiError("입력 오류", 400, { dueDate: "날짜 오류" }); };
  button(scope, "할 일 등록").props.onPress(); await tick(); scope.render();
  assert.equal(nodes(scope.tree).find(node => node.type === editor.TaskField && node.props.name === "title")?.props.value, "  입력한 업무  ");
  assert.equal(nodes(scope.tree).find(node => node.type === editor.TaskField && node.props.name === "dueDate")?.props.error, "날짜 오류");
});
test("duplicate registration taps issue one request and route only after successful save", async () => {
  const pending = deferred(); state.onRequest = () => pending.promise; const scope = await mount("editor"); change(scope, "title", "할 일");
  const submit = button(scope, "할 일 등록").props.onPress; submit(); submit(); assert.equal(calls("POST").length, 1); assert.equal(state.routes.length, 0);
  pending.resolve({ ok: true, task: { ...state.task, id: "new-task" }, message: "등록했습니다." }); await tick();
  assert.equal(state.routes.length, 1); assert.equal(state.routes[0].params.id, "new-task");
});
test("lost registration response replays the same normalized payload and key while edits are guarded", async () => {
  let attempts = 0; state.onRequest = async () => { if (++attempts === 1) throw new ApiError("결과 확인 불가", 0); return { ok: true, task: { ...state.task, id: "new-task" } }; };
  const scope = await mount("editor"); change(scope, "title", "  할 일  "); change(scope, "description", " 원문 "); button(scope, "할 일 등록").props.onPress(); await tick(); scope.render();
  change(scope, "title", "변경하려던 입력"); assert.equal(nodes(scope.tree).find(node => node.type === editor.TaskField && node.props.name === "title")?.props.value, "  할 일  ");
  button(scope, "등록 결과 다시 확인").props.onPress(); await tick(); assert.equal(calls("POST").length, 2); assert.deepEqual(calls("POST")[0].body, calls("POST")[1].body); assert.equal(calls("POST")[0].body.title, "할 일"); assert.equal(state.routes.length, 1);
});
test("a truncated 201 creation response keeps the original payload and request identifier for replay", async () => {
  let attempts = 0; state.onRequest = async () => { if (++attempts === 1) throw new ApiError("앱 서버가 올바르게 응답하지 않습니다", 201); return { ok: true, task: { ...state.task, id: "new-task" } }; };
  const scope = await mount("editor"); change(scope, "title", "등록된 업무"); button(scope, "할 일 등록").props.onPress(); await tick(); scope.render();
  assert.ok(button(scope, "등록 결과 다시 확인")); button(scope, "등록 결과 다시 확인").props.onPress(); await tick();
  assert.deepEqual(calls("POST")[0].body, calls("POST")[1].body); assert.equal(state.routes.length, 1);
});
test("definitive 400 permits corrected values with a fresh key, while request conflict cannot loop POST", async () => {
  state.onRequest = async () => { throw new ApiError("입력 오류", 400); }; const scope = await mount("editor"); change(scope, "title", "첫 입력"); button(scope, "할 일 등록").props.onPress(); await tick(); scope.render(); const first = calls("POST")[0].body.requestId;
  change(scope, "title", "수정한 입력"); state.onRequest = async () => { throw new ApiError("이미 처리된 등록 요청", 409); }; button(scope, "할 일 등록").props.onPress(); await tick(); scope.render();
  assert.notEqual(calls("POST")[1].body.requestId, first); assert.equal(calls("POST")[1].body.title, "수정한 입력"); assert.equal(nodes(scope.tree).some(node => node.props?.title === "할 일 등록"), false); assert.ok(button(scope, "내 할 일에서 확인"));
});
test("account change fences a pending registration and a confirmed leave dialog", async () => {
  const pending = deferred(); state.onRequest = () => pending.promise; const scope = await mount("editor"); change(scope, "title", "할 일"); button(scope, "할 일 등록").props.onPress(); state.account = "account-b";
  pending.resolve({ ok: true, task: { ...state.task, id: "new-task" } }); await tick(); assert.equal(state.routes.length, 0);
  const second = await mount("editor"); state.account = "account-a"; change(second, "title", "입력"); second.prevent.callback({ data: { action: "back" } }); state.account = "account-b"; await tick(); assert.equal(state.dispatched.length, 0);
});
test("dirty navigation asks confirmation and busy navigation does not dispatch", async () => {
  const scope = await mount("editor"); change(scope, "title", "입력"); assert.equal(scope.prevent.enabled, true); state.confirmation = false;
  scope.prevent.callback({ data: { action: "back" } }); await tick(); assert.equal(state.dispatched.length, 0); state.confirmation = true;
  scope.prevent.callback({ data: { action: "back" } }); await tick(); assert.deepEqual(state.dispatched, ["back"]);
  const pending = deferred(); state.onRequest = () => pending.promise; button(scope, "할 일 등록").props.onPress(); scope.prevent.callback({ data: { action: "busy-back" } }); await tick(); assert.deepEqual(state.dispatched, ["back"]);
  pending.resolve({ ok: true, task: { ...state.task, id: "new-task" } }); await tick();
});
test("history uses the authorized own-task endpoint and list semantics", async () => {
  const scope = await mount("detail"); assert.equal(state.requests[0].path, "/tasks/own-task/history?page=1"); assert.equal(state.requests[0].token, "account-a");
  assert.ok(nodes(scope.tree).some(node => node.props?.role === "list" && node.props.accessibilityLabel === "처리 이력"));
  assert.ok(nodes(scope.tree).some(node => node.type === detail.HistoryRow));
});
test("completion carries version, locks duplicate taps and requires explicit conflict refresh before another mutation", async () => {
  const scope = await mount("detail"); const pending = deferred(); state.onRequest = (path: string) => path.includes("/history") ? Promise.resolve(history()) : pending.promise;
  const complete = button(scope, "완료 처리").props.onPress; complete(); complete(); assert.equal(calls("POST").length, 1); assert.deepEqual(calls("POST")[0].body, { completed: true, version: 3 });
  pending.reject(new ApiError("다른 창에서 변경되었습니다", 409)); await tick(); scope.render(); assert.equal(state.requests.length, 2); assert.equal(button(scope, "완료 처리").props.disabled, true);
  state.task.version = 8; button(scope, "최신 내용 확인").props.onPress(); await tick(); scope.render(); assert.equal(calls("POST").length, 1); assert.equal(button(scope, "완료 처리").props.disabled, false);
  state.onRequest = async (path: string, options: Row) => path.includes("/history") ? history() : saved({ completedAt: options.body.completed ? "2026-10-03T00:00:00Z" : null }); button(scope, "완료 처리").props.onPress(); await tick(); scope.render(); assert.equal(calls("POST")[1].body.version, 8);
});
test("confirmed loss of access removes task content and history immediately", async () => {
  const scope = await mount("detail"); state.onRequest = async () => { throw new ApiError("할 일을 찾을 수 없습니다", 404); }; button(scope, "완료 처리").props.onPress(); await tick(); scope.render();
  const rendered = JSON.stringify(scope.tree); for (const value of ["개인 업무 제목", "개인 상세 내용", "개인 회의명", "개인 이력 내용"]) assert.equal(rendered.includes(value), false); assert.equal(nodes(scope.tree).some(node => node.type === detail.HistoryRow), false);
});
test("deletion cancellation does not call DELETE and one confirmed request preserves completed details as read-only", async () => {
  state.task.completedAt = "2026-10-02T00:00:00Z"; const scope = await mount("detail"); state.confirmation = false; button(scope, "삭제").props.onPress(); await tick(); scope.render(); assert.equal(calls("DELETE").length, 0);
  state.confirmation = true; const remove = button(scope, "삭제").props.onPress; remove(); remove(); await tick(); scope.render(); assert.equal(calls("DELETE").length, 1); assert.deepEqual(calls("DELETE")[0].body, { version: 3 }); assert.ok(state.confirmations.at(-1).message.includes("복구할 수 없습니다"));
  assert.equal(nodes(scope.tree).some(node => node.props?.title === "완료 취소" || node.props?.label === "삭제"), false); assert.ok(JSON.stringify(scope.tree).includes("개인 상세 내용")); assert.equal(state.task.completedAt, "2026-10-02T00:00:00Z");
});
test("successful mutation remains successful if the following history refresh fails, and retry is GET only", async () => {
  const scope = await mount("detail"); state.onRequest = async (path: string) => { if (path.includes("/history")) throw new ApiError("이력 조회 장애", 503); return saved({ completedAt: "2026-10-03T00:00:00Z" }); };
  button(scope, "완료 처리").props.onPress(); await tick(); scope.render(); assert.deepEqual(feedback(scope, "message"), ["저장했습니다."]); assert.deepEqual(feedback(scope, "error"), ["이력 조회 장애"]); assert.equal(calls("POST").length, 1);
  button(scope, "다시 불러오기").props.onPress(); await tick(); assert.equal(calls("POST").length, 1);
});
test("a later history page cannot be overwritten by an older page response", async () => {
  const first = deferred(), second = deferred(); state.onRequest = (path: string) => path.endsWith("page=1") ? first.promise : second.promise; const scope = await mount("detail");
  scope.props.page = 2; scope.render(); scope.flush(); second.resolve(history(state.task, 2)); await tick(); scope.render(); first.resolve(history({ ...state.task, title: "오래된 제목" }, 1)); await tick(); scope.render();
  assert.equal(JSON.stringify(scope.tree).includes("오래된 제목"), false); assert.equal(nodes(scope.tree).find(node => node.type === detail.HistoryRow)?.props.log.id, "log-2");
});
test("StrictMode lifetime replay ignores an old private history result", async () => {
  const requests: Row[] = []; state.onRequest = () => { const pending = deferred(); requests.push(pending); return pending.promise; }; const scope = await mount("detail"); scope.replay();
  assert.equal(requests.length, 2); requests[0].resolve(history({ ...state.task, title: "오래된 계정 업무" })); await tick(); scope.render(); assert.equal(JSON.stringify(scope.tree).includes("오래된 계정 업무"), false);
  requests[1].resolve(history()); await tick(); scope.render(); assert.ok(JSON.stringify(scope.tree).includes("개인 업무 제목"));
});
test("account transition ignores old detail mutations and does not refresh the next account", async () => {
  const scope = await mount("detail"); const pending = deferred(); state.onRequest = () => pending.promise; button(scope, "완료 처리").props.onPress(); const total = state.requests.length; state.account = "account-b";
  pending.resolve({ ok: true, message: "이전 계정 저장", task: { ...state.task, completedAt: "2026-10-03T00:00:00Z", version: 4 } }); await tick(); scope.render(); assert.equal(state.requests.length, total); assert.equal(feedback(scope, "message").includes("이전 계정 저장"), false);
});
test("invalid IDs and a mismatched history task never expose another task", async () => {
  const scope = await mount("detail", { taskId: "../private" }); assert.equal(state.requests.length, 0); assert.ok(feedback(scope, "error").length);
  state.onRequest = async () => history({ ...state.task, id: "foreign", title: "다른 직원 업무" }); const valid = await mount("detail"); assert.equal(JSON.stringify(valid.tree).includes("다른 직원 업무"), false); assert.ok(feedback(valid, "error").length);
});
