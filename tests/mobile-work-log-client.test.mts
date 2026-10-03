import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { ApiError } from "../mobile/src/lib/api";
import * as reports from "../mobile/src/lib/work-logs";

// Production TSX is executed with lexical React/native/navigation/session boundaries.
// These tests do not claim physical keyboard, screen-reader, or OS navigation verification.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const key = "__mobileWorkLogClientBoundary";
const state: Row = {};
let rendering: Hooks;
function activate(scope: Hooks) { rendering = scope; }
const same = (a: unknown[] | undefined, b: unknown[]) => !!a && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
class Hooks {
  slots: Row[] = []; index = 0; effects: Row[] = []; tree: Row = {}; token = "account-a"; props: Row; prevent: Row = {};
  guard = () => state.account === this.token;
  request = (path: string, options: Row = {}) => { state.requests.push({ path, token: this.token, ...options }); return state.onRequest(path, options); };
  constructor(public kind: "editor" | "detail", props: Row = {}) { this.props = props; }
  render() {
    activate(this); this.index = 0;
    const props = { date: "2026-10-03", ...this.props, isCurrentAccount: this.guard };
    this.tree = this.kind === "editor" ? editor.WorkLogEditorContent(props) : detail.WorkLogDetailContent(props);
    return this.tree;
  }
  flush() { for (const item of this.effects.splice(0)) { item.slot.cleanup?.(); item.slot.cleanup = item.slot.fn(); } }
  unmount() { for (const cell of this.slots) cell.cleanup?.(); }
  blur() { for (const cell of this.slots) if (cell.focus) cell.cleanup?.(); }
  refocus() { for (const cell of this.slots) if (cell.focus) cell.cleanup = cell.fn(); }
  replay() { for (const cell of this.slots) if (cell.effect) { cell.cleanup?.(); cell.cleanup = cell.fn(); } }
}
function slot() { const index = rendering.index++; return rendering.slots[index] ?? (rendering.slots[index] = {}); }
function effect(fn: () => unknown, deps: unknown[]) {
  const cell = slot(); cell.effect = true;
  if (!same(cell.deps, deps)) { cell.deps = deps; cell.fn = fn; rendering.effects.push({ slot: cell }); }
}
const harness: Row = {
  ...reports, ApiError,
  React: { createElement: (type: unknown, props: Row | null, ...children: unknown[]) => ({ type, props: { ...props, children } }), Fragment: "Fragment" },
  useRef: (initial: unknown) => { const cell = slot(); return cell.ref ?? (cell.ref = { current: initial }); },
  useState: (initial: unknown) => {
    const cell = slot();
    if (!cell.state) { cell.state = { value: typeof initial === "function" ? initial() : initial }; cell.setter = (next: unknown) => { cell.state.value = typeof next === "function" ? next(cell.state.value) : next; }; }
    return [cell.state.value, cell.setter];
  },
  useCallback: (fn: unknown, deps: unknown[]) => { const cell = slot(); if (!same(cell.deps, deps)) { cell.deps = deps; cell.value = fn; } return cell.value; },
  useEffect: effect, useLayoutEffect: effect, useFocusEffect: (fn: () => unknown) => { const index = rendering.index; effect(fn, [fn]); rendering.slots[index].focus = true; },
  usePreventRemove: (enabled: boolean, callback: unknown) => { rendering.prevent = { enabled, callback }; },
  useNavigation: () => ({ dispatch: (action: unknown) => state.dispatched.push(action) }),
  useSafeAreaInsets: () => ({ top: 24, bottom: 16 }),
  useTheme: () => ({ background: "background", surface: "surface", border: "border", text: "text", secondary: "secondary", muted: "muted", accent: "accent", danger: "danger", success: "success", surfaceMuted: "muted" }),
  useConfirmAction: () => ({ dialog: null, ask: async (options: Row) => { state.confirmations.push(options); return state.confirmation; } }),
  useSession: () => {
    const token = rendering.token;
    return { token, user: { id: token }, request: rendering.request };
  },
  router: { replace: (value: unknown) => state.routes.push(value), push: (value: unknown) => state.routes.push(value), setParams: (value: unknown) => state.params.push(value) },
  Platform: { OS: "android" }, StyleSheet: { create: (value: unknown) => value },
  KeyboardAvoidingView: "KeyboardAvoidingView", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", View: "View", ActivityIndicator: "ActivityIndicator", RefreshControl: "RefreshControl", FlatList: "FlatList",
  AccountFeedback: "AccountFeedback", PrimaryButton: "PrimaryButton", TextAction: "TextAction", EmptyState: "EmptyState", WorkLogContent: "WorkLogContent", WorkLogField: "WorkLogField",
};
(globalThis as Row)[key] = harness;
async function component(file: string, exports: string) {
  const source = readFileSync(new URL(`../mobile/src/components/${file}`, import.meta.url), "utf8");
  const injected = source.replace(/^import[\s\S]*?from "@\/lib\/types";\n/, `const {${Object.keys(harness).join(",")}} = globalThis.${key};\n`) + `\nexport {${exports}};\n`;
  const output = ts.transpileModule(injected, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}
const editor = await component("work-log-editor.tsx", "WorkLogEditorContent");
const detail = await component("work-log-detail-screen.tsx", "WorkLogDetailContent");
let scopes: Hooks[] = [];
const tick = async () => { await new Promise<void>(resolve => setImmediate(resolve)); };
const initialEntry = (patch: Row = {}) => ({ id: "2026-10-03", workDate: "2026-10-03", keyword: "기존 키워드", content: "저장된 업무", manualLogId: "manual-a", manualUpdatedAt: "2026-10-03T00:00:00.000Z", authorName: "직원 가", updatedByName: null, createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z", completedTasks: [], meetingDocuments: [], ...patch });
function dateResponse() { return { today: "2026-10-03", workDate: "2026-10-03", entry: state.entry, linkedScheduleState: state.schedule, ...state.responsePatch }; }
function pageResponse() { return { today: "2026-10-03", selectedDate: "2026-10-03", userName: "직원 가", selectedEntry: state.entry, contributionDates: [], recentLogs: [], linkedScheduleState: state.schedule, ...state.responsePatch }; }
function saved(body: Row) {
 const old = state.entry;
 const unchanged = old?.manualLogId && old.keyword === body.keyword && old.content === body.content;
 const token = unchanged ? old.manualUpdatedAt : new Date(new Date(old?.manualUpdatedAt ?? "2026-10-03T00:00:00.000Z").getTime() + 1).toISOString();
 state.entry = initialEntry({ ...old, keyword: body.keyword, content: body.content, manualLogId: old?.manualLogId ?? "manual-new", manualUpdatedAt: token, updatedAt: token });
 return { ok: true, message: "업무일지를 저장했습니다.", change: unchanged ? "unchanged" : body.manualLogId ? "update" : "create", entry: state.entry };
}
function deleted(body: Row) { state.entry = null; return { ok: true, message: "직접 작성 기록을 삭제했습니다.", change: "deleted", workDate: "2026-10-03", deletedId: body.manualLogId, entry: null }; }
function deferred() { let resolve!: (value: unknown) => void; let reject!: (cause: unknown) => void; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; }
beforeEach(() => {
  for (const scope of scopes) scope.unmount(); scopes = [];
  Object.assign(state, { account: "account-a", entry: initialEntry(), responsePatch: {}, schedule: { status: "ready", schedules: [] }, requests: [], routes: [], params: [], dispatched: [], confirmations: [], confirmation: true });
  state.onRequest = async (path: string, options: Row) => options.method === "POST" ? saved(options.body) : options.method === "DELETE" ? deleted(options.body) : path === "/work-logs" ? pageResponse() : dateResponse();
});
after(() => { for (const scope of scopes) scope.unmount(); delete (globalThis as Row)[key]; });
async function mount(kind: "editor" | "detail", props: Row = {}) { const scope = new Hooks(kind, props); scopes.push(scope); scope.render(); scope.flush(); await tick(); update(scope); return scope; }
function update(scope: Hooks) { scope.render(); scope.flush(); }
function nodes(tree: unknown): Row[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  const value = tree as Row;
  return [value, ...nodes(value.props?.children), ...nodes(value.props?.ListHeaderComponent), ...nodes(value.props?.ListFooterComponent), ...(value.type === "FlatList" ? value.props.data.flatMap((item: Row) => nodes(value.props.renderItem({ item }))) : [])];
}
function button(scope: Hooks, label: string): Row { const node = nodes(scope.tree).find(node => node.props?.title === label || node.props?.label === label); assert.ok(node, `Missing action ${label}`); return node; }
function change(scope: Hooks, name: string, value: string) { const node = nodes(scope.tree).find(node => node.type === "WorkLogField" && node.props.name === name); assert.ok(node, `Missing field ${name}`); node.props.onChange(name, value); update(scope); }
function field(scope: Hooks, name: string) { return nodes(scope.tree).find(node => node.type === "WorkLogField" && node.props.name === name); }
function feedback(scope: Hooks, kind: string) { return nodes(scope.tree).filter(node => node.type === "AccountFeedback").map(node => node.props[kind]).filter(Boolean); }
function posts() { return state.requests.filter((row: Row) => row.method === "POST"); }
function deletes() { return state.requests.filter((row: Row) => row.method === "DELETE"); }
async function press(scope: Hooks, label: string) { button(scope, label).props.onPress(); await tick(); update(scope); }
function output(scope: Hooks) { return JSON.stringify(nodes(scope.tree).filter(node => node.type === "Text" || node.type === "WorkLogField").map(node => node.props)); }

test("explicit date GET is authenticated and malformed route never fetches another today", async () => {
  await mount("editor"); assert.equal(state.requests[0].path, "/work-logs/2026-10-03"); assert.equal(state.requests[0].token, "account-a");
  state.requests = []; const invalid = await mount("editor", { date: "2026-02-30" }); assert.equal(state.requests.length, 0); assert.ok(feedback(invalid, "error").length); assert.equal(field(invalid, "workDate")?.props.value, "2026-02-30");
});
test("omitted date alone uses the server KST today and future 400 preserves explicit input", async () => {
  await mount("editor", { date: undefined }); assert.equal(state.requests[0].path, "/work-logs");
  state.onRequest = async () => { throw new ApiError("미래 날짜", 400, { workDate: "오늘까지 가능" }); }; const future = await mount("editor", { date: "2026-10-04" }); assert.equal(field(future, "workDate")?.props.value, "2026-10-04"); assert.equal(state.params.length, 0);
});
test("new required fields validate and generated automatic keyword never becomes manual input", async () => {
  state.entry = initialEntry({ keyword: "할 일 완료 1건", content: "", manualLogId: null, manualUpdatedAt: null }); const scope = await mount("editor"); assert.equal(field(scope, "keyword")?.props.value, "");
  await press(scope, "직접 작성 기록 저장"); assert.equal(posts().length, 0); assert.ok(field(scope, "keyword")?.props.error); assert.ok(field(scope, "content")?.props.error);
  change(scope, "keyword", " 새 키워드 "); change(scope, "content", "새 내용\n두 번째 줄"); await press(scope, "직접 작성 기록 저장"); assert.deepEqual(posts()[0].body, { workDate: "2026-10-03", keyword: "새 키워드", content: "새 내용\n두 번째 줄", manualLogId: null, expectedUpdatedAt: "" });
});
test("duplicate native taps and stale pre-render actions send one exact ID/token mutation", async () => {
  const scope = await mount("editor"); change(scope, "content", "새 내용"); const pending = deferred(); state.onRequest = () => pending.promise;
  const action = button(scope, "직접 작성 기록 저장").props.onPress; action(); action(); assert.equal(posts().length, 1); assert.equal(posts()[0].body.manualLogId, "manual-a"); assert.equal(posts()[0].body.expectedUpdatedAt, "2026-10-03T00:00:00.000Z");
  pending.reject(new ApiError("응답 손실", 0)); await tick(); action(); assert.equal(posts().length, 1);
});
test("definitive 400 preserves user input and field feedback for correction", async () => {
  const scope = await mount("editor"); change(scope, "keyword", "수정할 키워드"); change(scope, "content", "보관할 내용"); state.onRequest = async () => { throw new ApiError("검증 오류", 400, { content: "내용 확인" }); }; await press(scope, "직접 작성 기록 저장");
  assert.equal(field(scope, "keyword")?.props.value, "수정할 키워드"); assert.equal(field(scope, "content")?.props.value, "보관할 내용"); assert.equal(field(scope, "content")?.props.error, "내용 확인"); assert.equal(button(scope, "직접 작성 기록 저장").props.disabled, false);
});
test("all 2xx invalid response errors freeze POST until explicit latest GET", async () => {
  for (const status of [200, 201, 204]) {
    const scope = await mount("editor"); change(scope, "content", `입력-${status}`); state.onRequest = async () => { throw new ApiError("잘린 응답", status); }; await press(scope, "직접 작성 기록 저장"); await press(scope, "직접 작성 기록 저장"); assert.equal(button(scope, "직접 작성 기록 저장").props.disabled, true);
    assert.equal(field(scope, "content")?.props.value, `입력-${status}`); scope.unmount(); state.requests = []; state.onRequest = async () => dateResponse();
  }
});
test("unknown save uses GET only then confirms exact payload with a newer same-ID token", async () => {
  const scope = await mount("editor"); change(scope, "content", "응답이 손실된 내용"); state.onRequest = async (_path: string, options: Row) => { if (options.method === "POST") { saved(options.body); throw new ApiError("응답 손실", 0); } return dateResponse(); };
  await press(scope, "직접 작성 기록 저장"); assert.equal(posts().length, 1); await press(scope, "최신 기록 확인"); assert.equal(posts().length, 1); assert.equal(field(scope, "content")?.props.value, "응답이 손실된 내용"); assert.equal(button(scope, "직접 작성 기록 저장").props.disabled, false); assert.ok(feedback(scope, "message").includes("최신 기록에서 저장된 내용을 확인했습니다."));
});
test("ABA replacement with the same payload requires explicit choice and updates ID/token together", async () => {
  const scope = await mount("editor"); change(scope, "content", "내 입력"); state.onRequest = async () => { throw new ApiError("다른 기록", 409, undefined, "WORK_LOG_CONFLICT"); }; await press(scope, "직접 작성 기록 저장");
  state.entry = initialEntry({ manualLogId: "manual-b", manualUpdatedAt: "2026-10-03T00:00:00.002Z", content: "내 입력" }); state.onRequest = async (_path: string, options: Row) => options.method === "POST" ? saved(options.body) : dateResponse();
  await press(scope, "최신 기록 확인"); assert.equal(button(scope, "직접 작성 기록 저장").props.disabled, true); assert.ok(button(scope, "보관한 입력 유지")); await press(scope, "보관한 입력 유지"); await press(scope, "직접 작성 기록 저장"); assert.equal(posts().length, 2); assert.equal(posts()[1].body.manualLogId, "manual-b"); assert.equal(posts()[1].body.expectedUpdatedAt, "2026-10-03T00:00:00.002Z");
});
test("server replacement requires confirmation and cancellation preserves local input", async () => {
  const scope = await mount("editor"); change(scope, "content", "내 입력"); state.onRequest = async () => { throw new ApiError("충돌", 409); }; await press(scope, "직접 작성 기록 저장"); state.entry = initialEntry({ content: "서버 입력", manualUpdatedAt: "2026-10-03T00:00:00.001Z" }); state.onRequest = async () => dateResponse(); await press(scope, "최신 기록 확인");
  state.confirmation = false; await press(scope, "서버 내용으로 교체"); assert.equal(field(scope, "content")?.props.value, "내 입력"); state.confirmation = true; await press(scope, "서버 내용으로 교체"); assert.equal(field(scope, "content")?.props.value, "서버 입력");
});
test("unchanged saves are valid with the original canonical token and no second save", async () => { const scope = await mount("editor"); await press(scope, "직접 작성 기록 저장"); assert.equal(posts().length, 1); assert.ok(feedback(scope, "message").includes("업무일지를 저장했습니다.")); assert.equal(button(scope, "직접 작성 기록 저장").props.disabled, false); });
test("confirmed save stays confirmed if optional follow-up GET fails", async () => { const scope = await mount("editor"); change(scope, "content", "확정 내용"); state.onRequest = async (_path: string, options: Row) => { if (options.method === "POST") return saved(options.body); throw new ApiError("후속 조회 장애", 503); }; await press(scope, "직접 작성 기록 저장"); await tick(); update(scope); assert.equal(field(scope, "content")?.props.value, "확정 내용"); assert.ok(feedback(scope, "message").includes("업무일지를 저장했습니다.")); assert.ok(feedback(scope, "error").includes("후속 조회 장애")); assert.equal(posts().length, 1); });
test("whole editor body and fixed actions hide on fresh focus until permission GET succeeds", async () => {
  const scope = await mount("editor"); change(scope, "content", "보관할 입력"); const pending = deferred(); state.onRequest = () => pending.promise; scope.blur(); scope.refocus(); update(scope); assert.equal(field(scope, "content"), undefined); assert.equal(output(scope).includes("보관할 입력"), false); assert.equal(nodes(scope.tree).some(node => node.props?.accessibilityLabel === "업무일지 저장"), false);
  pending.reject(new ApiError("권한 재확인 장애", 503)); await tick(); update(scope); assert.equal(field(scope, "content"), undefined); state.onRequest = async () => dateResponse(); await press(scope, "최신 기록 확인"); assert.equal(field(scope, "content")?.props.value, "보관할 입력");
});
test("blur during POST then refocus recovers via GET and ignores the older POST completion", async () => {
  const scope = await mount("editor"); change(scope, "content", "진행 중 입력"); const pending = deferred(); state.onRequest = () => pending.promise; button(scope, "직접 작성 기록 저장").props.onPress(); saved(posts()[0].body); scope.blur(); state.onRequest = async () => dateResponse(); scope.refocus(); await tick(); update(scope); assert.equal(button(scope, "직접 작성 기록 저장").props.disabled, false); assert.equal(posts().length, 1);
  pending.resolve({ ok: true, message: "오래된 완료", change: "update", entry: state.entry }); await tick(); update(scope); assert.equal(feedback(scope, "message").includes("오래된 완료"), false);
});
test("confirmed permission loss clears cached input, comparison and private references", async () => { const scope = await mount("editor"); change(scope, "content", "민감한 입력"); state.onRequest = async () => { throw new ApiError("권한 없음", 403); }; await press(scope, "직접 작성 기록 저장"); assert.equal(field(scope, "content"), undefined); assert.equal(output(scope).includes("민감한 입력"), false); assert.equal(output(scope).includes("기존 키워드"), false); });
test("account changes ignore a pending private GET, old POST callbacks and delayed responses", async () => {
  const pendingGet = deferred(); state.onRequest = () => pendingGet.promise; const scope = new Hooks("editor"); scopes.push(scope); scope.render(); scope.flush(); state.account = "account-b"; pendingGet.resolve(dateResponse()); await tick(); update(scope); assert.equal(field(scope, "content"), undefined);
  state.account = "account-a"; state.onRequest = async () => dateResponse(); const current = await mount("editor"); const oldSave = button(current, "직접 작성 기록 저장").props.onPress; state.account = "account-b"; oldSave(); assert.equal(posts().length, 0);
  state.account = "account-a"; const pendingPost = deferred(); state.onRequest = () => pendingPost.promise; oldSave(); state.account = "account-b"; pendingPost.resolve(saved(posts()[0].body)); await tick(); update(current); assert.equal(feedback(current, "message").includes("업무일지를 저장했습니다."), false);
});
test("StrictMode cleanup/replay invalidates pre-cleanup private GET responses", async () => { const first = deferred(); let requests = 0; state.onRequest = () => ++requests === 1 ? first.promise : Promise.resolve(dateResponse()); const scope = new Hooks("editor"); scopes.push(scope); scope.render(); scope.flush(); scope.replay(); await tick(); update(scope); first.resolve({ ...dateResponse(), entry: initialEntry({ content: "오래된 응답" }) }); await tick(); update(scope); assert.equal(field(scope, "content")?.props.value, "저장된 업무"); });
test("date changes disclose discarded input and canceled dirty navigation does not dispatch", async () => {
  const scope = await mount("editor"); change(scope, "content", "날짜별 입력"); change(scope, "workDate", "2026-10-02"); state.confirmation = false; await press(scope, "날짜 조회"); assert.equal(state.params.length, 0); assert.match(state.confirmations.at(-1).message, /입력이 사라집니다/);
  scope.prevent.callback({ data: { action: { type: "GO_BACK" } } }); await tick(); assert.equal(state.dispatched.length, 0); state.confirmation = true; scope.prevent.callback({ data: { action: { type: "GO_BACK" } } }); await tick(); assert.deepEqual(state.dispatched, [{ type: "GO_BACK" }]);
});
test("dirty task/document/file navigation asks before push and stale approvals cannot route", async () => {
  const scope = await mount("editor"); change(scope, "content", "내 입력"); await press(scope, "참고 자료 펼치기"); const source = nodes(scope.tree).find(node => node.type === "WorkLogContent"); assert.ok(source);
  state.confirmation = false; source.props.onNavigate({ pathname: "/attachments/[id]", params: { id: "file-a" } }); await tick(); assert.equal(state.routes.length, 0); state.confirmation = true; source.props.onNavigate({ pathname: "/tasks/[id]", params: { id: "task-a" } }); await tick(); assert.equal(state.routes.length, 1);
  state.account = "account-b"; source.props.onNavigate({ pathname: "/documents/[id]", params: { id: "doc-a" } }); await tick(); assert.equal(state.routes.length, 1);
});
test("schedule partial failure preserves input and merge only changes local text before save", async () => {
  state.schedule = { status: "error" }; const scope = await mount("editor"); change(scope, "content", "내 업무"); await press(scope, "참고 자료 펼치기"); assert.ok(output(scope).includes("참고 일정을 불러오지 못했습니다")); state.schedule = { status: "ready", schedules: [{ id: "schedule", youthId: "youth", youthName: "청소년 가", content: "상담", startMinute: 540, endMinute: 600 }] }; await press(scope, "참고 일정 다시 불러오기"); await press(scope, "참고 일정 내용에 추가"); assert.equal(field(scope, "content")?.props.value, "내 업무\n09:00-10:00 청소년 가 · 상담"); assert.equal(posts().length, 0); await press(scope, "참고 일정 내용에 추가"); assert.equal(field(scope, "content")?.props.value, "내 업무\n09:00-10:00 청소년 가 · 상담");
});
test("save actions are fixed outside the scrolling form with safe area inset", async () => { const scope = await mount("editor"); const scroll = nodes(scope.tree).find(node => node.type === "ScrollView"); assert.ok(scroll); assert.equal(nodes(scroll).some(node => node.props?.title === "직접 작성 기록 저장"), false); const bar = nodes(scope.tree).find(node => node.props?.accessibilityLabel === "업무일지 저장"); assert.ok(bar); assert.equal(bar.props.style[1].paddingBottom, 16); });
test("valid empty detail offers creation and never deletes automatic-only entries", async () => { state.entry = null; const empty = await mount("detail"); assert.ok(button(empty, "직접 작성 기록 작성")); assert.equal(nodes(empty.tree).some(node => node.props?.title === "직접 작성 기록 삭제"), false); state.entry = initialEntry({ manualLogId: null, manualUpdatedAt: null, content: "" }); const auto = await mount("detail"); assert.equal(nodes(auto.tree).some(node => node.props?.title === "직접 작성 기록 삭제"), false); });
test("delete confirms irreversible manual content and sends exact ID/date/token once", async () => {
  const scope = await mount("detail"); const pending = deferred(); state.onRequest = () => pending.promise; const action = button(scope, "직접 작성 기록 삭제").props.onPress; action(); action(); await tick(); assert.equal(deletes().length, 1); assert.deepEqual(deletes()[0].body, { manualLogId: "manual-a", expectedUpdatedAt: "2026-10-03T00:00:00.000Z" }); assert.equal(deletes()[0].path, "/work-logs/2026-10-03"); assert.match(state.confirmations[0].message, /복구할 수 없습니다/); assert.match(state.confirmations[0].message, /할 일과 회의록은 유지/);
  pending.reject(new ApiError("응답 손실", 0)); await tick(); action(); await tick(); assert.equal(deletes().length, 1);
});
test("delete cancellation, blur and account rollover prevent a delayed approval from mutating", async () => { const scope = await mount("detail"); state.confirmation = false; await press(scope, "직접 작성 기록 삭제"); assert.equal(deletes().length, 0); state.confirmation = true; state.account = "account-b"; button(scope, "직접 작성 기록 삭제").props.onPress(); await tick(); assert.equal(deletes().length, 0); });
test("unknown delete GET retains a re-created record with a new ID and never auto-deletes it", async () => {
  const scope = await mount("detail"); state.onRequest = async () => { throw new ApiError("응답 손실", 0); }; await press(scope, "직접 작성 기록 삭제"); state.entry = initialEntry({ manualLogId: "manual-new", content: "재등록 업무", manualUpdatedAt: "2026-10-03T00:00:00.001Z" }); state.onRequest = async () => dateResponse(); await press(scope, "최신 기록 확인"); assert.equal(deletes().length, 1); assert.ok(output(scope).includes("재등록 업무")); assert.equal(button(scope, "직접 작성 기록 삭제").props.disabled, false); assert.ok(feedback(scope, "message").some((message: string) => message.includes("새 직접 작성 기록은 삭제하지 않았습니다")));
});
test("delete 409 needs GET then a fresh confirmation carrying the updated exact token", async () => { const scope = await mount("detail"); state.onRequest = async () => { throw new ApiError("다른 기기 수정", 409); }; await press(scope, "직접 작성 기록 삭제"); assert.equal(button(scope, "직접 작성 기록 삭제").props.disabled, true); state.entry = initialEntry({ manualUpdatedAt: "2026-10-03T00:00:00.001Z" }); state.onRequest = async (_path: string, options: Row) => options.method === "DELETE" ? deleted(options.body) : dateResponse(); await press(scope, "최신 기록 확인"); await press(scope, "직접 작성 기록 삭제"); assert.equal(deletes()[1].body.expectedUpdatedAt, "2026-10-03T00:00:00.001Z"); assert.equal(state.confirmations.length, 2); });
test("known delete success survives a later failed GET without reporting save ambiguity", async () => { const scope = await mount("detail"); state.onRequest = async (_path: string, options: Row) => { if (options.method === "DELETE") return deleted(options.body); throw new ApiError("후속 조회 장애", 503); }; await press(scope, "직접 작성 기록 삭제"); await tick(); update(scope); assert.ok(feedback(scope, "message").includes("직접 작성 기록을 삭제했습니다.")); assert.ok(feedback(scope, "error").includes("후속 조회 장애")); assert.equal(output(scope).includes("저장된 업무"), false); assert.equal(deletes().length, 1); });
test("detail whole-body fresh mask persists through failed scope check and clears on 404", async () => { const scope = await mount("detail"); const pending = deferred(); state.onRequest = () => pending.promise; scope.blur(); scope.refocus(); update(scope); assert.equal(output(scope).includes("저장된 업무"), false); assert.equal(nodes(scope.tree).some(node => node.type === "WorkLogContent"), false); pending.reject(new ApiError("권한 재확인 장애", 503)); await tick(); update(scope); assert.equal(output(scope).includes("저장된 업무"), false); state.onRequest = async () => { throw new ApiError("권한 없음", 404); }; await press(scope, "최신 기록 확인"); assert.equal(output(scope).includes("기존 키워드"), false); });
test("detail account changes suppress private GET and old delete completion", async () => { const pending = deferred(); state.onRequest = () => pending.promise; const scope = new Hooks("detail"); scopes.push(scope); scope.render(); scope.flush(); state.account = "account-b"; pending.resolve(dateResponse()); await tick(); update(scope); assert.equal(output(scope).includes("저장된 업무"), false); });
test("old detail edit and source callbacks cannot navigate after blur or unmount", async () => { const scope = await mount("detail"); const edit = button(scope, "직접 작성 기록 수정").props.onPress; const source = nodes(scope.tree).find(node => node.type === "WorkLogContent"); scope.blur(); edit(); source.props.onNavigate({ pathname: "/attachments/[id]", params: { id: "file" } }); assert.equal(state.routes.length, 0); scope.unmount(); edit(); assert.equal(state.routes.length, 0); });
test("delete approval invalidated by focus rollover never sends DELETE", async () => { const scope = await mount("detail"); const question = deferred(); state.confirmation = question.promise; button(scope, "직접 작성 기록 삭제").props.onPress(); scope.blur(); scope.refocus(); await tick(); update(scope); question.resolve(true); await tick(); update(scope); assert.equal(deletes().length, 0); });

test("omitted editor date becomes a fixed server date and never moves dirty input at KST midnight", async () => { const scope = await mount("editor", { date: undefined }); change(scope, "content", "어제 작성 중 입력"); state.responsePatch = { today: "2026-10-04" }; scope.blur(); scope.refocus(); await tick(); update(scope); assert.equal(state.requests.at(-1).path, "/work-logs/2026-10-03"); assert.equal(field(scope, "workDate")?.props.value, "2026-10-03"); assert.equal(field(scope, "content")?.props.value, "어제 작성 중 입력"); });
test("known missing old-ID delete makes the preserved re-created record explicit", async () => { const scope = await mount("detail"); state.onRequest = async (_path: string, options: Row) => { if (options.method === "DELETE") { state.entry = initialEntry({ manualLogId: "manual-new", content: "새 기록" }); return { ok: true, change: "missing", message: "이미 삭제", deletedId: options.body.manualLogId, workDate: "2026-10-03", entry: state.entry }; } return dateResponse(); }; await press(scope, "직접 작성 기록 삭제"); assert.ok(output(scope).includes("새 기록")); assert.ok(feedback(scope, "message").some((message: string) => message.includes("새 직접 작성 기록은 삭제하지 않았습니다"))); assert.equal(deletes().length, 1); });
test("late delete completion from a switched account cannot set success or restore private content", async () => { const scope = await mount("detail"); const pending = deferred(); state.onRequest = () => pending.promise; button(scope, "직접 작성 기록 삭제").props.onPress(); await tick(); state.account = "account-b"; pending.resolve(deleted(deletes()[0].body)); await tick(); update(scope); assert.equal(feedback(scope, "message").includes("직접 작성 기록을 삭제했습니다."), false); });
