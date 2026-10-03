import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";
// Execute the actual TSX with React/navigation/server-action boundaries only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const filename = new URL("../src/components/resource-delete-form.tsx", import.meta.url), source = readFileSync(filename, "utf8");
const sourceSha256 = createHash("sha256").update(source).digest("hex");
const key = "__resourceDeleteFormFlow", h: Row = { current: null, calls: [], api: {}, FormData: globalThis.FormData };
(globalThis as Row)[key] = h;
const url = (value: string) => `data:text/javascript;base64,${Buffer.from(value).toString("base64")}`;
const hooks = url(`const h=globalThis.${key};export function useState(initial){const r=h.current,i=r.index++;if(!(i in r.slots))r.slots[i]=typeof initial==='function'?initial():initial;return[r.slots[i],next=>{r.slots[i]=typeof next==='function'?next(r.slots[i]):next;}];}export function useRef(initial){const r=h.current,i=r.index++;if(!(i in r.slots))r.slots[i]={current:initial};return r.slots[i];}export function useEffect(fn,deps){const r=h.current,i=r.index++,old=r.effects[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))r.scheduled.push(()=>{old?.cleanup?.();r.effects[i]={deps,cleanup:fn()};});}export function useActionState(){return[h.serverState??{},h.fallback,false];}export function startTransition(fn){const r=h.current,job=Promise.resolve(fn());r.jobs.push(job);job.catch(()=>{});}`);
const jsx = url(`export const Fragment='Fragment';export function jsx(type,props){return{type,props:props??{}};}export const jsxs=jsx;`);
const ports = url(`const h=globalThis.${key};export function useRouter(){return{replace:path=>h.calls.push(['replace',path]),refresh:()=>h.calls.push(['refresh'])};}export async function deleteResourceAction(state,payload){h.calls.push(['delete',payload]);return h.api.delete(state,payload);}export async function getResourceMutationStatusAction(...args){h.calls.push(['status',...args]);return h.api.status(...args);}export async function getResourceEditorAction(...args){h.calls.push(['editor',...args]);return h.api.editor(...args);}export const ConfirmSubmitButton='button';`);
let transformed = `const FormData = globalThis.${key}.FormData;\n${source}`;
for (const alias of ["react", "next/navigation", "@/app/resources/actions", "@/app/resources/upload-actions", "@/components/confirm-submit-button"]) transformed = transformed.replaceAll(JSON.stringify(alias), JSON.stringify(alias === "react" ? hooks : ports));
const output = ts.transpileModule(transformed, { fileName: filename.pathname, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(jsx));
const { ResourceDeleteForm } = await import(url(output));
const baseline = "2026-10-03T03:00:00.000Z", freshToken = "2026-10-03T04:00:00.000Z";
function deferred<T>() { let resolve!: (value: T) => void, reject!: (cause: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function walk(node: unknown): Row[] { if (Array.isArray(node)) return node.flatMap(walk); if (!node || typeof node !== "object" || !("type" in node)) return []; return [node as Row, ...Object.values((node as Row).props).flatMap(walk)]; }
function text(node: unknown): string { if (Array.isArray(node)) return node.map(text).join(""); if (node && typeof node === "object" && "type" in node) return text((node as Row).props.children); return typeof node === "string" ? node : ""; }
class Screen {
  slots: Row[] = []; index = 0; effects: Row[] = []; scheduled: Array<() => void> = []; jobs: Promise<unknown>[] = []; nodes: Row[] = []; tree: Row | null = null; mounted = true;
  props: Row = { resourceId: "resource", actorId: "actor", category: "bajaul", expectedUpdatedAt: baseline, initialRequestId: "delete-request-key" };
  constructor(extra: Row = {}) { Object.assign(this.props, extra); this.render(); }
  render() { this.index = 0; this.scheduled = []; h.current = this; this.tree = ResourceDeleteForm(this.props); this.nodes = walk(this.tree); for (const node of this.nodes) if (node.props.ref) node.props.ref.current = { focus() { h.calls.push(["focus"]); } }; for (const effect of this.scheduled) effect(); return this; }
  field(name: string) { const node = this.nodes.find(node => node.props.name === name); assert.ok(node, `missing ${name}`); return node; }
  button(label: string) { const node = this.nodes.find(node => node.type === "button" && text(node).includes(label)); assert.ok(node, `missing button ${label}`); return node; }
  submit() { const form = this.nodes.find(node => node.type === "form"); if (form) form.props.onSubmit({ preventDefault() {}, currentTarget: {} }); this.render(); }
  click(label: string) { this.button(label).props.onClick(); this.render(); }
  async flush() { const result = await Promise.allSettled(this.jobs); if (this.mounted) this.render(); return result; }
  unmount() { this.mounted = false; for (const effect of this.effects) effect?.cleanup?.(); }
}
describe("actual ResourceDeleteForm retry and actor boundaries", () => {
  beforeEach(() => { Object.assign(h, { calls: [], serverState: {}, fallback: () => {}, api: { delete: async () => ({ error: "응답 유실", code: "INTERNAL_ERROR", status: 500 }), status: async () => ({ ok: false, status: 404, code: "NOT_FOUND", error: "미확인" }), editor: async () => ({ ok: true, data: { resource: { id: "resource", title: "최신 자료 제목", category: "bajaul", updatedAt: freshToken, canManage: true } } }) } }); });
  after(() => delete (globalThis as Row)[key]);
  test("actual source fingerprint, native action fallback and synchronous duplicate gate", async t => {
    t.diagnostic(`ResourceDeleteForm source SHA256: ${sourceSha256}`); const gate = deferred<Row>(); h.api.delete = () => gate.promise; const screen = new Screen();
    assert.equal(screen.nodes.find(node => node.type === "form")!.props.action, h.fallback);
    assert.match(screen.button("삭제").props.message, /첨부파일.*삭제.*복구할 수 없습니다/);
    screen.submit(); screen.submit(); assert.equal(h.calls.filter((c: Row) => c[0] === "delete").length, 1);
    gate.resolve({ error: "응답 유실", status: 500 }); await screen.flush(); screen.unmount();
  });
  test("thrown transport failure preserves exact body/key and receipt-first retry despite new props baseline", async () => {
    h.api.delete = async () => { throw Error("RAW_PRIVATE_NETWORK"); }; const screen = new Screen(); screen.submit(); await screen.flush();
    const payload = h.calls.find((c: Row) => c[0] === "delete")[1]; assert.doesNotMatch(text(screen.tree), /RAW_PRIVATE/);
    screen.props.expectedUpdatedAt = freshToken; screen.props.initialRequestId = "new-prop-request"; screen.render();
    screen.submit(); await screen.flush(); const calls = h.calls.filter((c: Row) => ["status", "delete"].includes(c[0]));
    assert.deepEqual(calls.map((c: Row) => c[0]), ["delete", "status", "delete"]); assert.equal(calls[2][1], payload);
    assert.equal(payload.get("requestId"), "delete-request-key"); assert.equal(payload.get("expectedUpdatedAt"), baseline); assert.equal(payload.get("expectedActorId"), "actor"); screen.unmount();
  });
  test("committed deletion receipt recovers without another delete", async () => {
    const screen = new Screen(); screen.submit(); await screen.flush(); h.api.status = async () => ({ ok: true, data: { ok: true, operation: "delete", outcome: "deleted", resourceId: "resource", resource: null } });
    screen.submit(); await screen.flush(); assert.equal(h.calls.filter((c: Row) => c[0] === "delete").length, 1); assert.ok(h.calls.some((c: Row) => c[0] === "replace")); screen.unmount();
  });
  test("unknown or mismatched receipt never authorizes another mutation", async () => {
    const screen = new Screen(); screen.submit(); await screen.flush(); h.api.status = async () => ({ ok: false, status: 503, code: "INTERNAL_ERROR", error: "나중에 다시 확인" }); screen.submit(); await screen.flush();
    h.api.status = async () => ({ ok: true, data: { ok: true, operation: "delete", outcome: "deleted", resourceId: "other-resource", resource: null } }); screen.submit(); await screen.flush();
    assert.equal(h.calls.filter((c: Row) => c[0] === "delete").length, 1); assert.equal(h.calls.some((c: Row) => c[0] === "replace"), false); screen.unmount();
  });
  test("conflict keeps old token/key until fresh detail is explicitly selected", async () => {
    h.api.delete = async () => ({ error: "충돌", conflict: true, code: "RESOURCE_CONFLICT", status: 409 }); const screen = new Screen(); screen.submit(); await screen.flush(); screen.submit();
    assert.equal(h.calls.filter((c: Row) => c[0] === "delete").length, 1); screen.click("최신 자료 확인"); await screen.flush();
    assert.equal(screen.field("expectedUpdatedAt").props.value, baseline); assert.equal(screen.field("requestId").props.value, "delete-request-key"); assert.match(text(screen.tree), /최신 자료 제목/);
    screen.click("최신 기준 사용"); assert.equal(screen.field("expectedUpdatedAt").props.value, freshToken); assert.notEqual(screen.field("requestId").props.value, "delete-request-key");
    screen.submit(); await screen.flush(); assert.equal(h.calls.filter((c: Row) => c[0] === "delete").length, 2); screen.unmount();
  });
  test("403 clears hidden identity and retained transport body", async () => {
    h.api.delete = async () => ({ error: "계정 변경", code: "FORBIDDEN", status: 403 }); const screen = new Screen(); screen.submit(); await screen.flush();
    const payload = h.calls.find((c: Row) => c[0] === "delete")[1]; assert.equal(Array.from(payload.keys()).length, 0); assert.equal(screen.nodes.some(node => node.type === "input"), false); screen.submit(); assert.equal(h.calls.filter((c: Row) => c[0] === "delete").length, 1); screen.unmount();
  });
  test("actor change during receipt lookup discards private body and prevents late delete", async () => {
    const screen = new Screen(); screen.submit(); await screen.flush(); const gate = deferred<Row>(); h.api.status = () => gate.promise; screen.submit();
    screen.props.actorId = "other-actor"; screen.render(); gate.resolve({ ok: false, status: 404, code: "NOT_FOUND", error: "missing" }); await screen.flush();
    assert.equal(h.calls.filter((c: Row) => c[0] === "delete").length, 1); assert.equal(screen.nodes.some(node => node.type === "input"), false); screen.unmount();
  });
  test("unmount during unknown lookup blocks late dispatch/navigation", async () => {
    const screen = new Screen(); screen.submit(); await screen.flush(); const gate = deferred<Row>(); h.api.status = () => gate.promise; screen.submit(); screen.unmount();
    gate.resolve({ ok: false, status: 404, code: "NOT_FOUND", error: "missing" }); await screen.flush(); assert.equal(h.calls.filter((c: Row) => c[0] === "delete").length, 1); assert.equal(h.calls.some((c: Row) => c[0] === "replace"), false);
  });
  test("successful NEXT_REDIRECT control flow is rethrown without unknown feedback", async () => {
    const redirect = Object.assign(Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/resources;303;" }); h.api.delete = async () => { throw redirect; }; const screen = new Screen(); screen.submit(); const result = await screen.flush();
    assert.equal(result[0].status, "rejected"); assert.equal((result[0] as PromiseRejectedResult).reason, redirect); assert.doesNotMatch(text(screen.tree), /삭제 결과를 확인하지/); screen.unmount();
  });
});
