import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { ApiError } from "../mobile/src/lib/api";
import * as reports from "../mobile/src/lib/daily-reports";

// Production TSX is executed with lexical React/native/navigation/session boundaries.
// These tests do not claim physical keyboard, screen-reader, or OS navigation verification.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const key = "__mobileDailyReportClientBoundary";
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
    const props = { reportId: "report-a", date: "2026-10-03", ...this.props, isCurrentAccount: this.guard };
    this.tree = this.kind === "editor" ? editor.DailyReportEditorContent(props) : detail.DailyReportDetailContent(props);
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
  KeyboardAvoidingView: "KeyboardAvoidingView", KeyboardScreen: "KeyboardScreen", KeyboardScrollView: "ScrollView", KeyboardFlatList: "FlatList", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput", View: "View", ActivityIndicator: "ActivityIndicator", RefreshControl: "RefreshControl", FlatList: "FlatList",
  AccountFeedback: "AccountFeedback", PrimaryButton: "PrimaryButton", TextAction: "TextAction", EmptyState: "EmptyState",
};
(globalThis as Row)[key] = harness;
async function component(file: string, exports: string) {
  const source = readFileSync(new URL(`../mobile/src/components/${file}`, import.meta.url), "utf8");
  const injected = source.replace(/^import[\s\S]*?from "@\/lib\/types";\n/, `const {${Object.keys(harness).join(",")}} = globalThis.${key};\n`) + `\nexport {${exports}};\n`;
  const output = ts.transpileModule(injected, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}
const editor = await component("daily-report-editor.tsx", "DailyReportEditorContent,ReportField");
const detail = await component("daily-report-detail-screen.tsx", "DailyReportDetailContent");
let scopes: Hooks[] = [];
const tick = async () => { await new Promise<void>(resolve => setImmediate(resolve)); };
const initialEntry = (patch: Row = {}) => ({ id: "report-a", workDate: "2026-10-03", mainContent: "저장된 업무", youthReports: [{ youthId: "youth-a", youthName: "청소년 가", content: "기존 보고" }], authorId: "account-a", authorName: "직원 가", departmentName: "지원팀", version: 3, submittedAt: null, reviewedAt: null, reviewedByName: null, updatedAt: "2026-10-03T00:00:00Z", ...patch });
function editorResponse() { return { mode: "employee", today: "2026-10-03", selectedDate: "2026-10-03", userName: "직원 가", canWrite: true, recipients: ["시설장"], youths: [{ id: "youth-a", name: "청소년 가" }, { id: "youth-b", name: "청소년 나" }], entry: state.entry, ...state.editorPatch }; }
function detailResponse() { return { mode: state.mode, today: "2026-10-03", canWrite: state.mode === "employee", canReview: state.mode === "director" && !!state.entry?.submittedAt && !state.entry?.reviewedAt, entry: state.entry, ...state.detailPatch }; }
function saved(body: Row) {
  state.entry = initialEntry({ ...state.entry, mainContent: body.mainContent, youthReports: body.youthReports.map((note: Row) => ({ ...note, youthName: note.youthId === "youth-a" ? "청소년 가" : "청소년 나" })), version: body.version + 1, submittedAt: body.intent === "submit" ? state.entry?.submittedAt ?? "2026-10-03T01:00:00Z" : null, reviewedAt: null, reviewedByName: null });
  return { ok: true, message: "업무보고를 저장했습니다.", entry: state.entry };
}
function deferred() { let resolve!: (value: unknown) => void; let reject!: (cause: unknown) => void; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; }
beforeEach(() => {
  for (const scope of scopes) scope.unmount(); scopes = [];
  Object.assign(state, { account: "account-a", entry: initialEntry(), mode: "employee", editorPatch: {}, detailPatch: {}, requests: [], routes: [], params: [], dispatched: [], confirmations: [], confirmation: true });
  state.onRequest = async (path: string, options: Row) => options.method === "POST" ? path.endsWith("/review") ? { ok: true, message: "확인했습니다.", entry: (state.entry = { ...state.entry, reviewedAt: "2026-10-03T02:00:00Z", reviewedByName: "시설장" }) } : saved(options.body) : path.includes("/editor") ? editorResponse() : detailResponse();
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
function change(scope: Hooks, name: string, value: string) { const node = nodes(scope.tree).find(node => node.type === editor.ReportField && node.props.name === name); assert.ok(node, `Missing field ${name}`); node.props.onChange(name, value); update(scope); }
function field(scope: Hooks, name: string) { return nodes(scope.tree).find(node => node.type === editor.ReportField && node.props.name === name); }
function feedback(scope: Hooks, kind: string) { return nodes(scope.tree).filter(node => node.type === "AccountFeedback").map(node => node.props[kind]).filter(Boolean); }
function posts() { return state.requests.filter((row: Row) => row.method === "POST"); }
async function press(scope: Hooks, label: string) { button(scope, label).props.onPress(); await tick(); update(scope); }
function output(scope: Hooks) { return JSON.stringify(nodes(scope.tree).filter(node => node.type === "Text" || node.type === editor.ReportField).map(node => node.props)); }

test("editor uses the exact authenticated date path and refuses malformed explicit dates before GET", async () => {
  await mount("editor"); assert.equal(state.requests[0].path, "/daily-reports/editor?date=2026-10-03"); assert.equal(state.requests[0].token, "account-a");
  state.requests = []; const bad = await mount("editor", { date: "2026-02-30" }); assert.equal(state.requests.length, 0); assert.ok(feedback(bad, "error").length); assert.equal(field(bad, "workDate")?.props.value, "2026-02-30");
});
test("omitted date asks the server for KST today while an explicit future date stays visible after 400", async () => {
  state.requests = []; const today = await mount("editor", { date: undefined }); assert.equal(state.requests[0].path, "/daily-reports/editor"); assert.equal(field(today, "workDate")?.props.value, "2026-10-03");
  state.onRequest = async () => { throw new ApiError("미래 날짜", 400, { workDate: "오늘까지 가능" }); }; const future = await mount("editor", { date: "2026-10-04" }); assert.equal(field(future, "workDate")?.props.value, "2026-10-04"); assert.equal(state.params.length, 0);
});
test("empty draft saves but empty submission validates locally and prevents duplicate taps", async () => {
  state.entry = null; const scope = await mount("editor"); await press(scope, "시설장에게 제출"); assert.equal(posts().length, 0); assert.ok(field(scope, "mainContent")?.props.error);
  const pending = deferred(); state.onRequest = () => pending.promise; const action = button(scope, "임시저장").props.onPress; action(); action(); assert.equal(posts().length, 1); assert.equal(posts()[0].body.intent, "draft"); assert.equal(posts()[0].body.version, 0);
  pending.resolve(saved(posts()[0].body)); await tick(); update(scope); await tick(); update(scope); assert.equal(posts().length, 1);
});
test("ordinary 400 keeps main and accordion inputs and exposes server field feedback", async () => {
  const scope = await mount("editor"); change(scope, "mainContent", "보존할 주요 내용"); await press(scope, "청소년 나"); change(scope, "youth-youth-b", "보존할 개별 내용");
  state.onRequest = async () => { throw new ApiError("입력 오류", 400, { "youth-youth-b": "개별 입력 오류" }); }; await press(scope, "임시저장");
  assert.equal(field(scope, "mainContent")?.props.value, "보존할 주요 내용"); assert.equal(field(scope, "youth-youth-b")?.props.value, "보존할 개별 내용"); assert.equal(field(scope, "youth-youth-b")?.props.error, "개별 입력 오류");
});
test("search, written-only and accordion changes preserve all allowed notes in the payload", async () => {
  const scope = await mount("editor"); await press(scope, "청소년 나"); change(scope, "youth-youth-b", "새 개별 내용"); change(scope, "search", "청소년 가"); assert.equal(field(scope, "youth-youth-b"), undefined); await press(scope, "작성한 기록만 보기");
  await press(scope, "임시저장"); assert.deepEqual(posts()[0].body.youthReports, [{ youthId: "youth-a", content: "기존 보고" }, { youthId: "youth-b", content: "새 개별 내용" }]);
});
test("lost save response freezes POST and confirms matching newer content using explicit GET only", async () => {
  const scope = await mount("editor"); change(scope, "mainContent", "확인할 저장 내용");
  state.onRequest = async (path: string, options: Row) => { if (options.method === "POST") { saved(options.body); throw new ApiError("응답 손실", 0); } return editorResponse(); };
  await press(scope, "임시저장"); assert.equal(posts().length, 1); assert.equal(button(scope, "임시저장").props.disabled, true);
  await press(scope, "최신 보고 확인"); assert.equal(posts().length, 1); assert.ok(feedback(scope, "message").some((message: string) => message.includes("저장된 내용을 확인"))); assert.equal(button(scope, "임시저장").props.disabled, false);
});
test("a truncated 200 save response never repeats POST and preserves local values for GET comparison", async () => {
  const scope = await mount("editor"); change(scope, "mainContent", "원래 입력"); state.onRequest = async (path: string, options: Row) => { if (options.method === "POST") throw new ApiError("잘린 JSON", 200); return editorResponse(); };
  await press(scope, "임시저장"); await press(scope, "최신 보고 확인"); assert.equal(posts().length, 1); assert.equal(field(scope, "mainContent")?.props.value, "원래 입력"); assert.ok(button(scope, "내 입력으로 계속 작성"));
});
test("conflict GET compares latest content and requires an explicit choice before a newer-version save", async () => {
  const scope = await mount("editor"); change(scope, "mainContent", "내 입력"); state.onRequest = async (path: string, options: Row) => { if (options.method === "POST") throw new ApiError("버전 충돌", 409); return editorResponse(); };
  await press(scope, "임시저장"); state.entry = initialEntry({ mainContent: "다른 곳에서 저장", version: 4 }); await press(scope, "최신 보고 확인"); assert.equal(field(scope, "mainContent")?.props.value, "내 입력"); assert.ok(output(scope).includes("다른 곳에서 저장"));
  await press(scope, "내 입력으로 계속 작성"); state.onRequest = async (path: string, options: Row) => options.method === "POST" ? saved(options.body) : editorResponse(); await press(scope, "임시저장"); assert.equal(posts()[1].body.version, 4); assert.equal(posts()[1].body.mainContent, "내 입력");
});
test("server replacement is confirmed and cancel keeps local unsaved input", async () => {
  const scope = await mount("editor"); change(scope, "mainContent", "내 입력"); state.onRequest = async (path: string, options: Row) => { if (options.method === "POST") throw new ApiError("충돌", 409); return editorResponse(); }; await press(scope, "임시저장"); await press(scope, "최신 보고 확인");
  state.confirmation = false; await press(scope, "서버 내용으로 교체"); assert.equal(field(scope, "mainContent")?.props.value, "내 입력"); state.confirmation = true; await press(scope, "서버 내용으로 교체"); assert.equal(field(scope, "mainContent")?.props.value, "저장된 업무");
});
test("ROSTER_CHANGED immediately removes names and notes and restores only the fresh permitted intersection", async () => {
  const scope = await mount("editor"); await press(scope, "청소년 나"); change(scope, "youth-youth-b", "권한 상실 노트"); change(scope, "mainContent", "보존 주요 내용");
  state.onRequest = async (path: string, options: Row) => { if (options.method === "POST") throw new ApiError("명단 변경", 400, { youthReports: "명단 확인" }, "ROSTER_CHANGED"); return editorResponse(); };
  await press(scope, "임시저장"); assert.equal(output(scope).includes("청소년 나"), false); assert.equal(output(scope).includes("권한 상실 노트"), false); assert.equal(button(scope, "임시저장").props.disabled, true);
  state.editorPatch = { youths: [{ id: "youth-a", name: "청소년 가" }] }; await press(scope, "최신 보고 확인"); await press(scope, "내 입력으로 계속 작성");
  assert.equal(field(scope, "mainContent")?.props.value, "보존 주요 내용"); state.onRequest = async (path: string, options: Row) => options.method === "POST" ? saved(options.body) : editorResponse(); await press(scope, "임시저장"); assert.deepEqual(posts()[1].body.youthReports, [{ youthId: "youth-a", content: "기존 보고" }]);
});
test("submitted reports cannot return to draft and no recipient disables submission without disabling draft", async () => {
  state.entry = initialEntry({ submittedAt: "2026-10-03T00:00:00Z" }); const submitted = await mount("editor"); assert.equal(nodes(submitted.tree).some(node => node.props?.label === "임시저장"), false); assert.ok(button(submitted, "수정 제출"));
  state.entry = null; state.editorPatch = { recipients: [] }; const draft = await mount("editor"); assert.equal(button(draft, "시설장에게 제출").props.disabled, true); assert.equal(button(draft, "임시저장").props.disabled, false);
});
test("date change and SDK57 leave confirmation preserve input on cancel and cannot cross account scope", async () => {
  const scope = await mount("editor"); change(scope, "mainContent", "입력"); state.confirmation = false; change(scope, "workDate", "2026-10-02"); await press(scope, "날짜 조회"); assert.equal(state.params.length, 0);
  assert.equal(scope.prevent.enabled, true); state.confirmation = true; scope.prevent.callback({ data: { action: "back" } }); state.account = "account-b"; await tick(); assert.equal(state.dispatched.length, 0);
});
test("old account save results and StrictMode old GET cannot alter a replacement scope", async () => {
  const scope = await mount("editor"); change(scope, "mainContent", "내 입력"); const pending = deferred(); state.onRequest = () => pending.promise; button(scope, "임시저장").props.onPress(); state.account = "account-b"; pending.resolve({ ok: true, message: "잘못된 늦은 성공", entry: initialEntry({ version: 4, mainContent: "내 입력" }) }); await tick(); update(scope); assert.equal(feedback(scope, "message").includes("잘못된 늦은 성공"), false);
  state.account = "account-a"; const oldGet = deferred(); const newGet = deferred(); let gets = 0; state.onRequest = () => ++gets === 1 ? oldGet.promise : newGet.promise;
  const strict = new Hooks("editor"); scopes.push(strict); strict.render(); strict.flush(); strict.replay(); newGet.resolve(editorResponse()); await tick(); update(strict); oldGet.resolve({ ...editorResponse(), entry: initialEntry({ mainContent: "이전 세대 비공개" }) }); await tick(); update(strict); assert.equal(field(strict, "mainContent")?.props.value, "저장된 업무");
});
test("confirmed 404 editor reload clears already displayed private main content and all notes", async () => {
  const scope = await mount("editor"); state.onRequest = async () => { throw new ApiError("찾을 수 없음", 404); }; await press(scope, "최신 보고 확인"); assert.equal(field(scope, "mainContent"), undefined); assert.equal(output(scope).includes("청소년 가"), false); assert.equal(output(scope).includes("저장된 업무"), false);
});
test("detail renders own private draft but forbids director draft or mismatched resource DTO", async () => {
  const own = await mount("detail"); assert.ok(output(own).includes("본인만 볼 수 있는 임시저장")); assert.ok(button(own, "이어서 작성"));
  state.mode = "director"; const head = await mount("detail"); assert.equal(output(head).includes("저장된 업무"), false); assert.ok(feedback(head, "error").length);
  state.mode = "employee"; state.entry = initialEntry({ id: "foreign-id" }); const mismatch = await mount("detail"); assert.equal(output(mismatch).includes("저장된 업무"), false);
});
test("review sends the current version once and verifies version stays unchanged", async () => {
  state.mode = "director"; state.entry = initialEntry({ submittedAt: "2026-10-03T01:00:00Z" }); const scope = await mount("detail"); const pending = deferred(); state.onRequest = () => pending.promise; const action = button(scope, "확인 완료로 표시").props.onPress; action(); action(); assert.equal(posts().length, 1); assert.deepEqual(posts()[0].body, { version: 3 });
  pending.resolve({ ok: true, message: "확인했습니다.", entry: { ...state.entry, reviewedAt: "2026-10-03T02:00:00Z", reviewedByName: "시설장" } }); await tick(); update(scope); assert.ok(feedback(scope, "message").includes("확인했습니다."));
});
test("lost review and conflict resolve by explicit GET without repeating POST", async () => {
  state.mode = "director"; state.entry = initialEntry({ submittedAt: "2026-10-03T01:00:00Z" }); const scope = await mount("detail"); state.onRequest = async (path: string, options: Row) => { if (options.method === "POST") { state.entry = { ...state.entry, reviewedAt: "2026-10-03T02:00:00Z", reviewedByName: "시설장" }; throw new ApiError("응답 손실", 0); } return detailResponse(); };
  await press(scope, "확인 완료로 표시"); await press(scope, "최신 보고 확인"); assert.equal(posts().length, 1); assert.ok(feedback(scope, "message").some((message: string) => message.includes("확인 완료 상태"))); assert.equal(nodes(scope.tree).some(node => node.props?.title === "확인 완료로 표시"), false);
});
test("review success survives a later GET error while confirmed 404 clears private detail", async () => {
  state.mode = "director"; state.entry = initialEntry({ submittedAt: "2026-10-03T01:00:00Z" }); const scope = await mount("detail"); state.onRequest = async (path: string, options: Row) => { if (options.method === "POST") return { ok: true, message: "확인 성공", entry: (state.entry = { ...state.entry, reviewedAt: "2026-10-03T02:00:00Z", reviewedByName: "시설장" }) }; throw new ApiError("조회 장애", 503); };
  await press(scope, "확인 완료로 표시"); assert.ok(feedback(scope, "message").includes("확인 성공")); assert.ok(feedback(scope, "error").includes("조회 장애")); assert.equal(posts().length, 1);
  state.onRequest = async () => { throw new ApiError("권한 상실", 404); }; await press(scope, "새로고침"); assert.equal(output(scope).includes("저장된 업무"), false); assert.equal(output(scope).includes("청소년 가"), false);
});
test("NOT_ELIGIBLE keeps own input but blocks further saves", async () => {
  const scope = await mount("editor"); change(scope, "mainContent", "본인 보존 입력"); state.onRequest = async () => { throw new ApiError("작성 자격 없음", 403, undefined, "NOT_ELIGIBLE"); }; await press(scope, "임시저장"); assert.equal(field(scope, "mainContent")?.props.value, "본인 보존 입력"); assert.equal(button(scope, "임시저장").props.disabled, true);
});

test("focus revalidation masks every cached editor name and body until GET succeeds, including retry after 500", async () => {
  const scope = await mount("editor"); change(scope, "mainContent", "보존할 비공개 입력"); const pending = deferred(); state.onRequest = () => pending.promise;
  scope.blur(); scope.refocus(); update(scope); assert.equal(field(scope, "mainContent"), undefined); assert.equal(output(scope).includes("청소년 가"), false); assert.equal(output(scope).includes("직원 가"), false);
  pending.reject(new ApiError("권한 확인 장애", 503)); await tick(); update(scope); assert.equal(field(scope, "mainContent"), undefined);
  state.onRequest = async () => editorResponse(); await press(scope, "최신 보고 확인"); assert.equal(field(scope, "mainContent")?.props.value, "보존할 비공개 입력");
});
test("a saved POST retains its confirmed content and success notice if only the subsequent GET fails", async () => {
  const scope = await mount("editor"); change(scope, "mainContent", "확정 저장 내용"); state.onRequest = async (path: string, options: Row) => { if (options.method === "POST") return saved(options.body); throw new ApiError("후속 조회 장애", 503); };
  await press(scope, "임시저장"); assert.equal(field(scope, "mainContent")?.props.value, "확정 저장 내용"); assert.ok(feedback(scope, "message").includes("업무보고를 저장했습니다.")); assert.ok(feedback(scope, "error").includes("후속 조회 장애")); assert.equal(posts().length, 1);
});
test("blur during save refocuses through matching GET recovery and never creates another identical save", async () => {
  const scope = await mount("editor"); change(scope, "mainContent", "화면 이탈 중 저장"); const pending = deferred(); state.onRequest = () => pending.promise;
  button(scope, "임시저장").props.onPress(); saved(posts()[0].body); scope.blur(); state.onRequest = async () => editorResponse(); scope.refocus(); await tick(); update(scope);
  assert.ok(feedback(scope, "message").some((message: string) => message.includes("저장된 내용을 확인"))); assert.equal(nodes(scope.tree).some(node => node.props?.label === "내 입력으로 계속 작성"), false); assert.equal(posts().length, 1);
  pending.resolve({ ok: true, message: "오래된 응답", entry: state.entry }); await tick(); update(scope); assert.equal(feedback(scope, "message").includes("오래된 응답"), false);
});
test("cached detail is hidden on focus permission checks and 403 removes a former employee draft", async () => {
  const scope = await mount("detail"); const pending = deferred(); state.onRequest = () => pending.promise; scope.blur(); scope.refocus(); update(scope);
  assert.equal(output(scope).includes("저장된 업무"), false); assert.equal(output(scope).includes("청소년 가"), false); pending.reject(new ApiError("현재 시설장 draft 접근 불가", 403)); await tick(); update(scope); assert.equal(output(scope).includes("저장된 업무"), false);
});
test("review pending across blur refocus resolves by fresh GET and ignores the old response", async () => {
  state.mode = "director"; state.entry = initialEntry({ submittedAt: "2026-10-03T00:00:00Z" }); const scope = await mount("detail"); const pending = deferred(); state.onRequest = () => pending.promise;
  button(scope, "확인 완료로 표시").props.onPress(); state.entry = { ...state.entry, reviewedAt: "2026-10-03T02:00:00Z", reviewedByName: "시설장" }; scope.blur(); state.onRequest = async () => detailResponse(); scope.refocus(); await tick(); update(scope);
  assert.ok(feedback(scope, "message").some((message: string) => message.includes("확인 완료 상태"))); assert.equal(posts().length, 1); pending.resolve({ ok: true, message: "오래된 확인", entry: state.entry }); await tick(); update(scope); assert.equal(feedback(scope, "message").includes("오래된 확인"), false);
});
test("employee preview rejects a foreign author even when the report ID and date match", async () => {
  state.entry = initialEntry({ authorId: "account-b" }); const editorScope = await mount("editor"); assert.equal(field(editorScope, "mainContent"), undefined);
  const detailScope = await mount("detail"); assert.equal(output(detailScope).includes("저장된 업무"), false);
});

test("an old save button closure cannot bypass the recovery guard after unknown or roster failures", async () => {
  const scope = await mount("editor"); change(scope, "mainContent", "새 입력"); const oldAction = button(scope, "임시저장").props.onPress;
  state.onRequest = async () => { throw new ApiError("응답 손실", 0); }; oldAction(); await tick(); oldAction(); await tick(); assert.equal(posts().length, 1);
});
test("detail account changes ignore a pending private GET and a delayed review response", async () => {
  const pendingGet = deferred(); state.onRequest = () => pendingGet.promise; const scope = new Hooks("detail"); scopes.push(scope); scope.render(); scope.flush(); state.account = "account-b";
  pendingGet.resolve(detailResponse()); await tick(); update(scope); assert.equal(output(scope).includes("저장된 업무"), false);
  state.account = "account-a"; state.mode = "director"; state.entry = initialEntry({ submittedAt: "2026-10-03T00:00:00Z" }); state.onRequest = async () => detailResponse(); const reviewing = await mount("detail"); const pendingReview = deferred(); state.onRequest = () => pendingReview.promise;
  button(reviewing, "확인 완료로 표시").props.onPress(); state.account = "account-b"; pendingReview.resolve({ ok: true, message: "늦은 다른 계정 처리", entry: { ...state.entry, reviewedAt: "2026-10-03T02:00:00Z" } }); await tick(); update(reviewing); assert.equal(feedback(reviewing, "message").includes("늦은 다른 계정 처리"), false);
});

test("submit requirement is explicit and draft/submit actions remain outside a 200-person scrolling list", async () => {
  state.entry = null; state.editorPatch = { youths: Array.from({ length: 200 }, (_, index) => ({ id: `youth-${index}`, name: `청소년 ${index}` })) };
  const scope = await mount("editor"); const list = nodes(scope.tree).find(node => node.type === "FlatList"); assert.ok(list); assert.equal(list.props.data.length, 200);
  assert.ok(nodes(list.props.ListHeaderComponent).some(node => node.type === "Text" && JSON.stringify(node.props.children).includes("제출 시 필수")));
  assert.equal(nodes(list.props.ListFooterComponent).some(node => node.props?.label === "임시저장" || node.props?.title === "시설장에게 제출"), false);
  const bar = nodes(scope.tree).find(node => node.props?.accessibilityLabel === "업무보고 저장 및 제출"); assert.ok(bar); assert.ok(nodes(bar).some(node => node.props?.label === "임시저장")); assert.ok(nodes(bar).some(node => node.props?.title === "시설장에게 제출")); assert.equal(bar.props.style[1].paddingBottom, 16);
  await press(scope, "임시저장"); assert.equal(posts().length, 1); assert.equal(posts()[0].body.mainContent, "");
});
test("the fixed action bar disappears throughout fresh focus permission verification", async () => {
  const scope = await mount("editor"); const pending = deferred(); state.onRequest = () => pending.promise; scope.blur(); scope.refocus(); update(scope);
  assert.equal(nodes(scope.tree).some(node => node.props?.accessibilityLabel === "업무보고 저장 및 제출"), false); pending.reject(new ApiError("권한 확인 장애", 503)); await tick(); update(scope);
  assert.equal(nodes(scope.tree).some(node => node.props?.accessibilityLabel === "업무보고 저장 및 제출"), false);
});
