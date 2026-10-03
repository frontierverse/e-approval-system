import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import ts from "typescript";
import * as core from "../mobile/src/lib/attachment-file.ts";

const content = "Synthetic original office document 원본 첨부파일";
const bytes = new TextEncoder().encode(content);
const headers = {
  "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "Content-Length": String(bytes.length),
  "Content-Disposition": "attachment; filename=fallback.xlsx; filename*=UTF-8''%EC%98%88%EC%82%B0%20%EC%82%B0%EC%B6%9C%20%EB%82%B4%EC%97%AD.xlsx",
};
class BoundaryApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
type RequestRecord = { url: string; init: RequestInit };
type Anchor = { href: string; download: string; click: () => void; remove: () => void };
const state = {
  requests: [] as RequestRecord[],
  exports: [] as { name: string; url: string; blob: Blob }[],
  objects: new Map<string, Blob>(),
  revoked: [] as string[],
  timers: [] as { callback: () => void; milliseconds: number }[],
  children: new Set<Anchor>(),
  responseFactory: (() => Promise.resolve(new Response(bytes, { headers }))) as (init: RequestInit) => Promise<Response>,
  clickError: null as Error | null,
  counter: 0,
};
const key = "__mobileAttachmentWebTransferBoundary";
const boundary = {
  ...core,
  ApiError: BoundaryApiError,
  apiUrl: (path: string) => `https://mobile.example/api/mobile${path}`,
  fetch: async (url: string, init: RequestInit) => {
    state.requests.push({ url, init });
    return state.responseFactory(init);
  },
  document: {
    createElement(tag: string) {
      assert.equal(tag, "a");
      const anchor: Anchor = {
        href: "", download: "",
        click() {
          if (state.clickError) throw state.clickError;
          const blob = state.objects.get(anchor.href);
          assert.ok(blob, "The exported file must be a received Blob.");
          state.exports.push({ name: anchor.download, url: anchor.href, blob });
        },
        remove() { state.children.delete(anchor); },
      };
      return anchor;
    },
    body: { appendChild(anchor: Anchor) { state.children.add(anchor); } },
  },
  URL: {
    createObjectURL(blob: Blob) {
      const url = `blob:synthetic-web-transfer-${++state.counter}`;
      state.objects.set(url, blob);
      return url;
    },
    revokeObjectURL(url: string) {
      state.revoked.push(url);
      state.objects.delete(url);
    },
  },
  setTimeout(callback: () => void, milliseconds: number) { state.timers.push({ callback, milliseconds }); },
};
// Inject the platform boundary lexically, so isolation=none does not replace any
// fetch/DOM/URL/timer globals used by another test file or by the native harness.
Object.assign(globalThis, { [key]: boundary });
let source = readFileSync(new URL("../mobile/src/lib/attachment-transfer.web.ts", import.meta.url), "utf8");
source = source.replace(/^import[\s\S]*?from "\.\/attachment-file";\n/,
  `const {ApiError,apiUrl,attachmentDownloadInfo,attachmentDownloadPath,isAttachmentTransferCancellation,transferProgress,fetch,document,URL,setTimeout}=globalThis.${key};\n`);
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const web = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const input = { id: "untrusted/id?#", token: "synthetic-session-only", action: "save" as const };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

async function reset() {
  await web.clearAttachmentTransferCache();
  state.requests = []; state.exports = []; state.objects.clear(); state.revoked = [];
  state.timers = []; state.children.clear(); state.clickError = null;
  state.responseFactory = () => Promise.resolve(new Response(bytes, { headers }));
}
after(async () => {
  await web.clearAttachmentTransferCache();
  Reflect.deleteProperty(globalThis, key);
});

test("web save exports exact received Blob bytes and the authoritative UTF-8 filename", async () => {
  await reset();
  const progress: (number | null)[] = [];
  const transfer = web.startAttachmentTransfer({ ...input, onProgress: (value: number | null) => progress.push(value) });
  assert.equal(await transfer.promise, "파일 저장을 시작했습니다.");
  assert.equal(state.exports.length, 1);
  const exported = state.exports[0];
  assert.equal(exported.name, "예산 산출 내역.xlsx");
  assert.equal(await exported.blob.text(), content);
  assert.equal(exported.blob.type, headers["Content-Type"]);
  assert.equal(state.children.size, 0, "Temporary DOM anchors must be removed.");
  const request = state.requests[0];
  assert.equal(request.url, "https://mobile.example/api/mobile/attachments/untrusted%2Fid%3F%23/download");
  assert.equal(request.url.includes(input.token), false);
  assert.deepEqual(request.init.headers, { Authorization: "Bearer synthetic-session-only", Accept: "application/octet-stream" });
  assert.equal(request.init.cache, "no-store");
  assert.equal(request.init.redirect, "error");
  assert.ok(request.init.signal instanceof AbortSignal);
  assert.equal(progress[0], null); assert.equal(progress.at(-1), 1);
  assert.equal(state.timers[0].milliseconds, 60_000);
  state.timers[0].callback();
  assert.equal(state.objects.size, 0);
  assert.deepEqual(state.revoked, [exported.url]);
});

test("web 401 and 403 responses remain errors and never create an export", async () => {
  for (const status of [401, 403]) {
    await reset();
    state.responseFactory = () => Promise.resolve(new Response(JSON.stringify({ error: "접근 권한을 다시 확인하세요." }), { status, headers: { "Content-Type": "application/json" } }));
    await assert.rejects(web.startAttachmentTransfer(input).promise,
      (error: Error) => error instanceof BoundaryApiError && error.status === status && error.message === "접근 권한을 다시 확인하세요.");
    assert.equal(state.exports.length, 0); assert.equal(state.objects.size, 0); assert.equal(state.children.size, 0);
  }
});

test("web download cancellation aborts a real Response stream before any file is exported", async () => {
  await reset();
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  state.responseFactory = async (init) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(bytes.subarray(0, 5));
        init.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
      },
    });
    return new Response(stream, { headers });
  };
  const progress: (number | null)[] = [];
  const transfer = web.startAttachmentTransfer({ ...input, onProgress: (value: number | null) => progress.push(value) });
  await tick();
  assert.ok(streamController); assert.equal(state.requests.length, 1);
  assert.ok(progress.some(value => typeof value === "number" && value > 0 && value < 1));
  transfer.cancel();
  assert.equal(await transfer.promise, null);
  assert.equal(state.requests[0].init.signal?.aborted, true);
  assert.equal(state.exports.length, 0); assert.equal(state.objects.size, 0); assert.equal(state.children.size, 0);
});

test("web incomplete bodies and missing attachment filenames cannot be saved", async () => {
  for (const responseHeaders of [{ ...headers, "Content-Length": String(bytes.length + 1) }, { "Content-Type": "text/html" }]) {
    await reset();
    state.responseFactory = () => Promise.resolve(new Response(bytes, { headers: responseHeaders }));
    await assert.rejects(web.startAttachmentTransfer(input).promise, (error: Error) => error instanceof BoundaryApiError);
    assert.equal(state.exports.length, 0); assert.equal(state.objects.size, 0); assert.equal(state.children.size, 0);
  }
});

test("web DOM export failure revokes the private Blob URL and removes its anchor", async () => {
  await reset(); state.clickError = new Error("Browser export refused");
  await assert.rejects(web.startAttachmentTransfer(input).promise, (error: Error) => error instanceof BoundaryApiError);
  assert.equal(state.exports.length, 0); assert.equal(state.objects.size, 0); assert.equal(state.children.size, 0);
  assert.equal(state.revoked.length, 1); assert.equal(state.timers.length, 0);
});

test("web account cleanup revokes completed Blob URLs and aborts active downloads", async () => {
  await reset();
  await web.startAttachmentTransfer(input).promise;
  const retainedUrl = state.exports[0].url;
  assert.equal(state.objects.size, 1);
  state.responseFactory = async (init) => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, 5));
      init.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
    },
  }), { headers });
  const pending = web.startAttachmentTransfer(input);
  await tick(); await web.clearAttachmentTransferCache();
  assert.equal(await pending.promise, null);
  assert.equal(state.requests.at(-1)?.init.signal?.aborted, true);
  assert.equal(state.objects.size, 0); assert.ok(state.revoked.includes(retainedUrl));
  assert.equal(state.exports.length, 1, "The cancelled download must not create a second file.");
});

test("web rejects unavailable sharing and absent authentication before contacting the server", async () => {
  await reset();
  await assert.rejects(web.startAttachmentTransfer({ ...input, action: "share" }).promise, (error: Error) => error instanceof BoundaryApiError && error.status === 0);
  await assert.rejects(web.startAttachmentTransfer({ ...input, token: "" }).promise, (error: Error) => error instanceof BoundaryApiError && error.status === 401);
  assert.equal(state.requests.length, 0); assert.equal(state.exports.length, 0);
});
