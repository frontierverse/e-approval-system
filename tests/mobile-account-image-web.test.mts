import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import ts from "typescript";
import { ApiError } from "../mobile/src/lib/api.ts";
import * as core from "../mobile/src/lib/account-image-core.ts";

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S8AAAAASUVORK5CYII=", "base64"));
const imageMetadata = { exists: true, mimeType: "image/webp", size: 128, updatedAt: "2026-10-03T03:04:05.000Z" };
const success = { ok: true, message: "이미지가 저장되었습니다.", image: imageMetadata };
type Listener = () => void | Promise<void>;
type Input = { type: string; accept: string; multiple: boolean; style: { display: string }; files: File[]; listeners: Map<string, Set<Listener>>; removed: boolean; clicked: boolean; remove: () => void; click: () => void; addEventListener: (type: string, listener: Listener) => void; removeEventListener: (type: string, listener: Listener) => void; emit: (type: string) => Promise<void> };
type RequestRecord = { url: string; init: RequestInit };
const state = {
  inputs: [] as Input[], children: new Set<Input>(), requests: [] as RequestRecord[],
  objects: new Map<string, Blob>(), revoked: [] as string[], counter: 0, clickError: null as Error | null,
  responseFactory: (() => Promise.resolve(new Response(JSON.stringify(success), { headers: { "Content-Type": "application/json" } }))) as (url: string, init: RequestInit) => Promise<Response>,
};
const key = "__mobileAccountImageWebBoundary";
const boundary = {
  ...core, ApiError,
  apiUrl: (path: string) => `https://mobile.example/api/mobile${path}`,
  fetch: async (url: string, init: RequestInit) => { state.requests.push({ url, init }); return state.responseFactory(url, init); },
  document: {
    createElement(tag: string) {
      assert.equal(tag, "input");
      const input: Input = {
        type: "", accept: "", multiple: true, style: { display: "" }, files: [], listeners: new Map(), removed: false, clicked: false,
        remove() { input.removed = true; state.children.delete(input); },
        click() { input.clicked = true; if (state.clickError) throw state.clickError; },
        addEventListener(type, listener) { if (!input.listeners.has(type)) input.listeners.set(type, new Set()); input.listeners.get(type)!.add(listener); },
        removeEventListener(type, listener) { input.listeners.get(type)?.delete(listener); },
        async emit(type) { for (const listener of [...(input.listeners.get(type) ?? [])]) await listener(); },
      };
      state.inputs.push(input); return input;
    },
    body: { appendChild(input: Input) { state.children.add(input); } },
  },
  URL: {
    createObjectURL(blob: Blob) { const uri = `blob:synthetic-account-image-${++state.counter}`; state.objects.set(uri, blob); return uri; },
    revokeObjectURL(uri: string) { state.revoked.push(uri); state.objects.delete(uri); },
  },
};
// Lexical native/browser boundaries preserve the real Node fetch, URL and timer
// globals when the repository runs every file with test isolation disabled.
Object.assign(globalThis, { [key]: boundary });
let source = readFileSync(new URL("../mobile/src/lib/account-image.web.ts", import.meta.url), "utf8");
source = source.replace(/^import[\s\S]*?from "\.\/account-image-core";\n/,
  `const {ApiError,apiUrl,ACCOUNT_IMAGE_MIME_TYPES,accountImageAbortError,accountImageInputName,accountImagePath,accountImageResponse,isAccountImageAbortError,validateAccountImage,validateAccountImagePreview,fetch,document,URL}=globalThis.${key};\n`);
source = source.replace(/^export type \{[^\n]*\} from "\.\/account-image-core";\n/m, "");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const web = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function reset() {
  await web.clearAccountImageResources(); state.inputs = []; state.children.clear(); state.requests = [];
  state.objects.clear(); state.revoked = []; state.clickError = null;
  state.responseFactory = () => Promise.resolve(new Response(JSON.stringify(success), { headers: { "Content-Type": "application/json" } }));
}
async function choose(file = new File([png], "가상 프로필.png", { type: "image/png" })) {
  const pending = web.pickAccountImage(), input = state.inputs.at(-1)!;
  input.files = [file]; await input.emit("change");
  return pending;
}
after(async () => { await web.clearAccountImageResources(); Reflect.deleteProperty(globalThis, key); });

test("web account image selection creates a private Blob preview and removes its input/listeners", async () => {
  await reset(); const selected = await choose();
  assert.ok(selected); assert.equal(selected.name, "가상 프로필.png"); assert.equal(selected.size, png.length); assert.equal(selected.mimeType, "image/png");
  assert.deepEqual(new Uint8Array(await state.objects.get(selected.uri)!.arrayBuffer()), png);
  const input = state.inputs[0]; assert.equal(input.type, "file"); assert.equal(input.multiple, false); assert.ok(input.accept.includes(".webp")); assert.equal(input.clicked, true);
  assert.equal(input.removed, true); assert.equal(state.children.size, 0); assert.equal([...input.listeners.values()].reduce((count, listeners) => count + listeners.size, 0), 0);
  selected.release(); selected.release(); assert.equal(state.objects.size, 0); assert.deepEqual(state.revoked, [selected.uri]);
});

test("browser picker cancellation and account cleanup settle silently and remove pending inputs", async () => {
  await reset(); const cancelled = web.pickAccountImage(); await state.inputs[0].emit("cancel"); assert.equal(await cancelled, null);
  const pending = web.pickAccountImage(); await web.clearAccountImageResources(); assert.equal(await pending, null);
  assert.equal(state.children.size, 0); assert.equal(state.objects.size, 0); assert.equal(state.requests.length, 0);
  for (const input of state.inputs) assert.equal(input.removed, true);
});

test("account cleanup during asynchronous file inspection cannot create an old account preview", async () => {
  await reset(); const file = new File([png], "private.png", { type: "image/png" });
  let finishInspection!: (value: ArrayBuffer) => void;
  const inspected = new Blob([png]); Object.defineProperty(inspected, "arrayBuffer", { value: () => new Promise<ArrayBuffer>(resolve => { finishInspection = resolve; }) });
  Object.defineProperty(file, "slice", { value: () => inspected });
  const pending = web.pickAccountImage(), input = state.inputs[0]; input.files = [file]; const changed = input.emit("change");
  await tick(); await web.clearAccountImageResources(); assert.equal(await pending, null);
  finishInspection(png.slice().buffer); await changed;
  assert.equal(state.objects.size, 0); assert.equal(state.children.size, 0); assert.equal(state.requests.length, 0);
});

test("forged format, wrong extension and images over 4 MiB fail before a preview or upload", async () => {
  for (const file of [new File(["not image bytes"], "fake.png", { type: "image/png" }), new File([png], "wrong.jpg", { type: "image/jpeg" }), new File([new Uint8Array(core.ACCOUNT_IMAGE_MAX_INPUT_BYTES + 1)], "large.png", { type: "image/png" })]) {
    await reset(); const pending = web.pickAccountImage(), rejected = assert.rejects(pending, (error: Error) => error instanceof ApiError);
    state.inputs[0].files = [file]; await state.inputs[0].emit("change"); await rejected;
    assert.equal(state.objects.size, 0); assert.equal(state.children.size, 0); assert.equal(state.requests.length, 0);
  }
});

test("account image upload sends exact selected bytes in the correct authenticated multipart field", async () => {
  for (const kind of ["profile", "signature"] as const) {
    await reset(); const selected = await choose(new File([png], "../../가상 이미지.png", { type: "image/png" })); assert.ok(selected);
    assert.deepEqual(await web.uploadAccountImage({ kind, token: "synthetic-account-token", image: selected }), success);
    const request = state.requests[0]; assert.equal(request.url, `https://mobile.example/api/mobile/account/${kind}-image`); assert.equal(request.url.includes("synthetic-account-token"), false);
    assert.deepEqual(request.init.headers, { Authorization: "Bearer synthetic-account-token", Accept: "application/json" }); assert.equal(request.init.method, "POST"); assert.equal(request.init.cache, "no-store"); assert.equal(request.init.redirect, "error");
    assert.ok(request.init.body instanceof FormData); const part = request.init.body.get(kind === "profile" ? "profileImage" : "signatureImage"); assert.ok(part instanceof File);
    assert.equal(part.name, selected.name); assert.equal(part.type, "image/png"); assert.deepEqual(new Uint8Array(await part.arrayBuffer()), png);
    assert.equal(state.objects.has(selected.uri), true, "Uploading must retain selection for an explicit release/retry."); selected.release();
  }
});

test("failed account image upload keeps the selected image available for retry", async () => {
  await reset(); const selected = await choose();
  state.responseFactory = () => Promise.resolve(new Response(JSON.stringify({ error: "다시 저장하세요." }), { status: 500 }));
  await assert.rejects(web.uploadAccountImage({ kind: "profile", token: "synthetic", image: selected }), (error: Error) => error instanceof ApiError && error.status === 500);
  assert.equal(state.objects.has(selected.uri), true);
  state.responseFactory = () => Promise.resolve(new Response(JSON.stringify(success)));
  assert.equal((await web.uploadAccountImage({ kind: "profile", token: "synthetic", image: selected })).ok, true); assert.equal(state.requests.length, 2);
  selected.release();
});

test("401 upload and preview return authentication errors without creating public image URLs", async () => {
  await reset(); const selected = await choose();
  state.responseFactory = () => Promise.resolve(new Response(JSON.stringify({ error: "로그인이 필요합니다." }), { status: 401 }));
  await assert.rejects(web.uploadAccountImage({ kind: "signature", token: "synthetic", image: selected }), (error: Error) => error instanceof ApiError && error.status === 401);
  await assert.rejects(web.loadAccountImage({ kind: "signature", token: "synthetic" }), (error: Error) => error instanceof ApiError && error.status === 401);
  assert.equal(state.objects.size, 1, "Only the existing selected private preview may remain before caller logout.");
  await web.clearAccountImageResources(); assert.equal(state.objects.size, 0);
});

test("private preview requests a safe revision URL and exposes exact received image Blob bytes", async () => {
  await reset(); state.responseFactory = () => Promise.resolve(new Response(png, { headers: { "Content-Type": "image/png", "Content-Length": String(png.length) } }));
  const updatedAt = "2026-10-03T01:02:03Z&unexpected=private";
  const preview = await web.loadAccountImage({ kind: "profile", token: "synthetic-private-token", updatedAt });
  assert.equal(state.requests[0].url, "https://mobile.example/api/mobile/account/profile-image?v=" + encodeURIComponent(updatedAt));
  assert.equal(state.requests[0].url.includes("synthetic-private-token"), false); assert.equal(state.requests[0].init.cache, "no-store"); assert.equal(state.requests[0].init.redirect, "error");
  assert.deepEqual(new Uint8Array(await state.objects.get(preview.uri)!.arrayBuffer()), png);
  preview.release(); preview.release(); assert.equal(state.objects.size, 0); assert.deepEqual(state.revoked, [preview.uri]);
});

test("incomplete, MIME-mismatched or oversized private previews cannot produce a Blob URL", async () => {
  for (const [data, responseHeaders] of [
    [png, { "Content-Type": "image/png", "Content-Length": String(png.length + 1) }],
    [png, { "Content-Type": "image/jpeg" }],
    [new Uint8Array(core.ACCOUNT_IMAGE_MAX_STORED_BYTES + 1), { "Content-Type": "image/png" }],
  ] as [Uint8Array, Record<string, string>][]) {
    await reset(); state.responseFactory = () => Promise.resolve(new Response(data, { headers: responseHeaders }));
    await assert.rejects(web.loadAccountImage({ kind: "profile", token: "synthetic" }), (error: Error) => error instanceof ApiError);
    assert.equal(state.objects.size, 0);
  }
});

test("account cleanup revokes selections and previews, aborts active upload and blocks stale selection reuse", async () => {
  await reset(); const selected = await choose();
  state.responseFactory = () => Promise.resolve(new Response(png, { headers: { "Content-Type": "image/png", "Content-Length": String(png.length) } }));
  const preview = await web.loadAccountImage({ kind: "signature", token: "synthetic" }); assert.equal(state.objects.size, 2);
  state.responseFactory = (_url, init) => new Promise<Response>((_resolve, reject) => { init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }); });
  const pending = web.uploadAccountImage({ kind: "profile", token: "synthetic", image: selected }); const rejected = assert.rejects(pending, { name: "AbortError" });
  await tick(); await web.clearAccountImageResources(); await rejected;
  assert.equal(state.requests.at(-1)?.init.signal?.aborted, true); assert.equal(state.objects.size, 0);
  assert.ok(state.revoked.includes(selected.uri)); assert.ok(state.revoked.includes(preview.uri));
  const requests = state.requests.length;
  await assert.rejects(web.uploadAccountImage({ kind: "profile", token: "new-account-token", image: selected }), (error: Error) => error instanceof ApiError && error.status === 0);
  assert.equal(state.requests.length, requests, "Released old account files must not be uploaded again.");
  selected.release(); preview.release(); await web.clearAccountImageResources(); assert.equal(state.revoked.length, 2);
});

test("external abort and an already-aborted signal prevent image operations from committing", async () => {
  await reset(); const selected = await choose(), controller = new AbortController(); controller.abort();
  await assert.rejects(web.uploadAccountImage({ kind: "profile", token: "synthetic", image: selected, signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(web.loadAccountImage({ kind: "profile", token: "synthetic", signal: controller.signal }), { name: "AbortError" });
  assert.equal(state.requests.length, 0);
  const nextController = new AbortController();
  state.responseFactory = (_url, init) => new Promise<Response>((_resolve, reject) => { init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }); });
  const pending = web.loadAccountImage({ kind: "profile", token: "synthetic", signal: nextController.signal }); const rejected = assert.rejects(pending, { name: "AbortError" });
  await tick(); nextController.abort(); await rejected; assert.equal(state.requests[0].init.signal?.aborted, true); selected.release();
});

test("picker activation failure and missing token remove input or stop before contacting the server", async () => {
  await reset(); state.clickError = new Error("Picker unavailable"); await assert.rejects(web.pickAccountImage(), /Picker unavailable/); assert.equal(state.children.size, 0);
  state.clickError = null; const selected = await choose();
  await assert.rejects(web.uploadAccountImage({ kind: "profile", token: "", image: selected }), (error: Error) => error instanceof ApiError && error.status === 401);
  await assert.rejects(web.loadAccountImage({ kind: "profile", token: "" }), (error: Error) => error instanceof ApiError && error.status === 401);
  assert.equal(state.requests.length, 0); selected.release();
});


test("browser-declared MIME cannot override the validated image format in preview or multipart", async () => {
  for (const declaredType of ["image/svg+xml", ""]) {
    await reset();
    const selected = await choose(new File([png], "actual.png", { type: declaredType }));
    assert.ok(selected); assert.equal(selected.mimeType, "image/png");
    assert.equal(state.objects.get(selected.uri)?.type, "image/png");
    assert.deepEqual(new Uint8Array(await state.objects.get(selected.uri)!.arrayBuffer()), png);
    await web.uploadAccountImage({ kind: "signature", token: "synthetic", image: selected });
    assert.ok(state.requests[0].init.body instanceof FormData);
    const part = state.requests[0].init.body.get("signatureImage"); assert.ok(part instanceof File);
    assert.equal(part.type, "image/png"); assert.equal(part.name, "actual.png");
    assert.deepEqual(new Uint8Array(await part.arrayBuffer()), png); selected.release();
  }
});
