import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { prepareResourceWebUpload, ResourceWebUploadError, type ResourceWebUploadAttempt, type ResourceWebUploadPorts, type ResourceWebReply } from "../src/lib/resource-web-upload";
import type { ResourceUploadDto, ResourceUploadGrant, ResourceUploadInput } from "../src/lib/mobile-resources-core";
const bytes = Buffer.from("%PDF-1.7\nsynthetic immutable snapshot\n"), digest = createHash("sha256").update(bytes).digest("hex");
const ok = <T>(data: T): ResourceWebReply<T> => ({ ok: true, data });
const rejected = (code = "STORAGE_UNAVAILABLE", status = 503): ResourceWebReply<never> => ({ ok: false, code, status, error: "synthetic private-safe error" });
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
  const file = new File([bytes], "자료.pdf", { type: "application/pdf" }); const attempt: ResourceWebUploadAttempt = { file, requestId: "fixed-request-key", targetResourceId: null };
  const input = (): ResourceUploadInput => ({ requestId: attempt.requestId, targetResourceId: attempt.targetResourceId, name: file.name, mimeType: file.type, size: file.size, wholeSha256: digest });
  const upload = (state: ResourceUploadDto["state"] = "uploading", patch: Partial<ResourceUploadDto> = {}): ResourceUploadDto => ({ id: "fixed-upload", targetResourceId: null, file: { name: file.name, mimeType: file.type, size: file.size, wholeSha256: digest }, state, expiresAt: new Date(Date.now() + 7200000).toISOString(), completedAt: ["ready", "consumed"].includes(state) ? new Date().toISOString() : null, consumedResourceId: state === "consumed" ? "created-post" : null, cleanupPending: false, ...patch });
  const grant = (patch: Partial<NonNullable<ResourceUploadGrant["grant"]>> = {}): ResourceUploadGrant => ({ upload: upload(), grant: { method: "PUT", url: "https://synthetic.invalid/object/upload/sign/private/resources/staging/fixed?token=synthetic", headers: { "Content-Type": file.type }, expiresAt: new Date(Date.now() + 7200000).toISOString(), ...patch } });
  const calls: { operation: string; value?: unknown }[] = [];
  const ports: ResourceWebUploadPorts = {
    async start(value) { calls.push({ operation: "start", value }); return ok(grant()); },
    async status(value) { calls.push({ operation: "status", value }); return ok({ upload: upload() }); },
    async grant(value) { calls.push({ operation: "grant", value }); return ok(grant()); },
    async complete(value) { calls.push({ operation: "complete", value }); return ok({ upload: upload("ready"), pending: false }); },
    async fetch(value, options) { calls.push({ operation: "put", value: { url: value, options } }); return new Response(null, { status: 200 }); },
  };
  return { file, attempt, input, upload, grant, calls, ports, signal: new AbortController().signal };
}
const isUnknown = (error: unknown) => error instanceof ResourceWebUploadError && error.code === "UNKNOWN_RESULT";

test("web resource actual hash binds a fixed File and sends only signed PUT headers/body", async () => {
  const c = fixture(); let slices = 0; const original = c.file.slice.bind(c.file); c.file.slice = (...args) => { slices++; return original(...args); };
  assert.equal(await prepareResourceWebUpload(c.attempt, c.ports, c.signal), "fixed-upload"); assert.ok(slices > 0); assert.deepEqual(c.attempt.input, c.input()); assert.deepEqual(c.calls.map(call => call.operation), ["start", "put", "complete"]);
  const put = c.calls.find(call => call.operation === "put")!.value as { options: RequestInit };
  assert.equal(put.options.body, c.file); assert.equal(put.options.method, "PUT"); assert.equal(put.options.credentials, "omit"); assert.equal(put.options.referrerPolicy, "no-referrer"); assert.equal(put.options.redirect, "error"); assert.deepEqual(put.options.headers, { "Content-Type": "application/pdf" }); assert.ok(put.options.signal instanceof AbortSignal);
});
test("web resource start response loss recovers same logical key via status404 and same start input", async () => {
  const c = fixture(); let calls = 0, firstInput: unknown; c.ports.start = async value => { c.calls.push({ operation: "start", value }); if (++calls === 1) { firstInput = value; throw Error("lost transport"); } assert.equal(value, firstInput); return ok(c.grant()); }; c.ports.status = async value => { c.calls.push({ operation: "status", value }); return rejected("NOT_FOUND", 404); };
  await assert.rejects(prepareResourceWebUpload(c.attempt, c.ports, c.signal)); const frozen = c.attempt.input; assert.equal(c.attempt.startSent, true); assert.equal(c.attempt.uploadId, undefined); assert.equal(await prepareResourceWebUpload(c.attempt, c.ports, c.signal), "fixed-upload"); assert.equal(c.attempt.input, frozen); assert.deepEqual(c.calls.find(call => call.operation === "status")!.value, { requestId: "fixed-request-key" }); assert.equal(c.calls.filter(call => call.operation === "put").length, 1);
});
test("web resource ready and consumed replay do not grant, PUT or complete", async () => {
  for (const state of ["ready", "consumed"] as const) { const c = fixture(); c.attempt.startSent = true; c.attempt.uploadId = "fixed-upload"; c.ports.status = async value => { c.calls.push({ operation: "status", value }); return ok({ upload: c.upload(state) }); }; assert.equal(await prepareResourceWebUpload(c.attempt, c.ports, c.signal), "fixed-upload"); assert.deepEqual(c.calls.map(call => call.operation), ["status"]); }
});
test("web resource start replay already-ready requires null grant and no binary dispatch", async () => {
  const c = fixture(); c.ports.start = async value => { c.calls.push({ operation: "start", value }); return ok({ upload: c.upload("ready"), grant: null }); }; assert.equal(await prepareResourceWebUpload(c.attempt, c.ports, c.signal), "fixed-upload"); assert.deepEqual(c.calls.map(call => call.operation), ["start"]);
});
test("web resource ambiguous PUT then unknown complete retries status and same complete only", async () => {
  const c = fixture(); let complete = 0; c.ports.fetch = async () => { c.calls.push({ operation: "put" }); throw Error("PUT acknowledgement lost"); }; c.ports.complete = async value => { c.calls.push({ operation: "complete", value }); return ++complete === 1 ? rejected() : ok({ upload: c.upload("ready"), pending: false }); };
  await assert.rejects(prepareResourceWebUpload(c.attempt, c.ports, c.signal), { code: "STORAGE_UNAVAILABLE" }); assert.equal(c.attempt.putSent, true); const input = c.attempt.input; assert.equal(await prepareResourceWebUpload(c.attempt, c.ports, c.signal), "fixed-upload"); assert.equal(c.attempt.input, input); assert.deepEqual(c.calls.map(call => call.operation), ["start", "put", "complete", "status", "complete"]);
});
test("web resource PUT403/conflict body is cancelled then same server complete validates bytes", async () => {
  const c = fixture(); let cancelled = 0; c.ports.fetch = async () => { c.calls.push({ operation: "put" }); return new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 403 }); }; assert.equal(await prepareResourceWebUpload(c.attempt, c.ports, c.signal), "fixed-upload"); assert.equal(cancelled, 1); assert.equal(c.calls.filter(call => call.operation === "complete").length, 1);
});
test("web resource pending finalization preserves receipt and subsequent GET+complete only", async () => {
  const c = fixture(); let completed = 0; c.ports.complete = async value => { c.calls.push({ operation: "complete", value }); return ok({ upload: c.upload(++completed === 1 ? "finalizing" : "ready"), pending: completed === 1 }); }; await assert.rejects(prepareResourceWebUpload(c.attempt, c.ports, c.signal), { code: "UPLOAD_PENDING" }); assert.equal(c.attempt.uploadId, "fixed-upload"); assert.equal(await prepareResourceWebUpload(c.attempt, c.ports, c.signal), "fixed-upload"); assert.equal(c.calls.filter(call => call.operation === "put").length, 1);
});
test("web resource hash/name/target/id disagreement never adopts a different upload", async () => {
  for (const patch of [{ targetResourceId: "other-post" }, { id: "not a safe id" }, { file: { name: "資料.pdf", mimeType: "application/pdf", size: bytes.length, wholeSha256: digest } }, { file: { name: "자료.pdf", mimeType: "application/pdf", size: bytes.length, wholeSha256: "0".repeat(64) } }]) { const c = fixture(); c.ports.start = async () => ok({ upload: c.upload("uploading", patch), grant: c.grant().grant }); await assert.rejects(prepareResourceWebUpload(c.attempt, c.ports, c.signal), isUnknown); assert.equal(c.calls.filter(call => call.operation === "put").length, 0); }
  const c = fixture(); c.attempt.startSent = true; c.attempt.uploadId = "original-id"; await assert.rejects(prepareResourceWebUpload(c.attempt, c.ports, c.signal), isUnknown); assert.equal(c.attempt.uploadId, "original-id");
});
test("web resource rejects non-HTTPS credentialed fragmented grant and extra auth headers before PUT", async () => {
  for (const patch of [{ url: "http://synthetic.invalid/file" }, { url: "https://user:password@synthetic.invalid/file" }, { url: "https://synthetic.invalid/file#fragment" }, { method: "POST" }, { headers: { "Content-Type": "application/pdf", Authorization: "Bearer synthetic-app-token" } }, { headers: { "Content-Type": "text/html" } }]) { const c = fixture(); c.ports.start = async () => ok(c.grant(patch as never)); await assert.rejects(prepareResourceWebUpload(c.attempt, c.ports, c.signal), isUnknown); assert.equal(c.calls.filter(call => call.operation === "put").length, 0); assert.equal(c.calls.filter(call => call.operation === "complete").length, 0); }
});
test("web resource expired grant renews same upload and immutable input", async () => {
  const c = fixture(); c.ports.start = async value => { c.calls.push({ operation: "start", value }); return ok(c.grant({ expiresAt: new Date(Date.now() - 1000).toISOString() })); }; assert.equal(await prepareResourceWebUpload(c.attempt, c.ports, c.signal), "fixed-upload"); assert.deepEqual(c.calls.map(call => call.operation), ["start", "grant", "put", "complete"]); assert.equal(c.calls.find(call => call.operation === "grant")!.value, "fixed-upload");
});
test("web resource terminal file-null receipt is not resent or adopted", async () => {
  for (const state of ["deleting", "deleted", "expired"] as const) { const c = fixture(); c.attempt.startSent = true; c.ports.status = async () => ok({ upload: c.upload(state, { file: null }) }); await assert.rejects(prepareResourceWebUpload(c.attempt, c.ports, c.signal), { code: "UPLOAD_EXPIRED" }); assert.deepEqual(c.calls, []); }
});
test("web resource caller account abort races held start and ignores late old-account reply", async () => {
  const c = fixture(), controller = new AbortController(); c.attempt.input = c.input(); let release!: (value: ResourceWebReply<ResourceUploadGrant>) => void; c.ports.start = async value => { c.calls.push({ operation: "start", value }); return new Promise(resolve => { release = resolve; }); };
  const pending = prepareResourceWebUpload(c.attempt, c.ports, controller.signal); controller.abort(); await assert.rejects(pending, { name: "AbortError" }); release(ok(c.grant())); await turn(); assert.deepEqual(c.calls.map(call => call.operation), ["start"]); assert.equal(c.attempt.uploadId, undefined);
});
test("web resource abort before hashing never dispatches server or provider work", async () => {
  const c = fixture(), controller = new AbortController(); controller.abort(); await assert.rejects(prepareResourceWebUpload(c.attempt, c.ports, controller.signal), { name: "AbortError" }); assert.deepEqual(c.calls, []); assert.equal(c.attempt.input, undefined);
});
test("web resource account abort held PUT cancels late response body and dispatches no complete", async () => {
  const c = fixture(), controller = new AbortController(); let release!: (value: Response) => void, entered!: () => void, cancelled = 0; const reached = new Promise<void>(resolve => { entered = resolve; }); c.ports.fetch = async () => { c.calls.push({ operation: "put" }); entered(); return new Promise(resolve => { release = resolve; }); };
  const pending = prepareResourceWebUpload(c.attempt, c.ports, controller.signal); await reached; controller.abort(); await assert.rejects(pending, { name: "AbortError" }); release(new Response(new ReadableStream({ cancel() { cancelled++; } }))); await turn(); assert.equal(cancelled, 1); assert.equal(c.calls.filter(call => call.operation === "complete").length, 0); assert.equal(c.attempt.putSent, true);
});
test("web resource held port deadline preserves unknown logical attempt", async t => {
  const c = fixture(); c.attempt.input = c.input(); const originalInput = c.attempt.input; c.ports.start = async value => { c.calls.push({ operation: "start", value }); return new Promise(() => {}); }; t.mock.timers.enable({ apis: ["setTimeout"] });
  try { const pending = prepareResourceWebUpload(c.attempt, c.ports, c.signal); const result = pending.then(() => null, error => error); t.mock.timers.tick(30000); assert.ok(isUnknown(await result)); assert.equal(c.attempt.startSent, true); assert.equal(c.attempt.input, originalInput); assert.equal(c.calls.filter(call => call.operation === "put").length, 0); }
  finally { t.mock.timers.reset(); }
});
test("web resource held PUT deadline recovers through same complete and cancels late body", async t => {
  const c = fixture(); c.attempt.input = c.input(); let release!: (value: Response) => void, cancelled = 0; c.ports.fetch = async () => { c.calls.push({ operation: "put" }); return new Promise(resolve => { release = resolve; }); }; t.mock.timers.enable({ apis: ["setTimeout"] });
  try { const pending = prepareResourceWebUpload(c.attempt, c.ports, c.signal); await turn(); assert.equal(c.attempt.putSent, true); t.mock.timers.tick(90000); assert.equal(await pending, "fixed-upload"); release(new Response(new ReadableStream({ cancel() { cancelled++; } }))); await turn(); assert.equal(cancelled, 1); assert.equal(c.calls.filter(call => call.operation === "put").length, 1); assert.equal(c.calls.filter(call => call.operation === "complete").length, 1); }
  finally { t.mock.timers.reset(); }
});
test("web resource only explicit server UPLOAD_RETRY permits next same-key PUT", async () => {
  const c = fixture(); let completed = 0; c.ports.complete = async value => { c.calls.push({ operation: "complete", value }); return ++completed === 1 ? rejected("UPLOAD_RETRY") : ok({ upload: c.upload("ready"), pending: false }); }; await assert.rejects(prepareResourceWebUpload(c.attempt, c.ports, c.signal), { code: "UPLOAD_RETRY" }); assert.equal(c.attempt.putSent, false); assert.equal(await prepareResourceWebUpload(c.attempt, c.ports, c.signal), "fixed-upload"); assert.equal(c.calls.filter(call => call.operation === "start").length, 1); assert.equal(c.calls.filter(call => call.operation === "put").length, 2); assert.equal(c.attempt.requestId, "fixed-request-key");
});
test("web resource malformed complete pending preserves unknown fixed attempt", async () => {
  for (const pending of [undefined, null, "false", 1]) {
    const c = fixture(); c.ports.complete = async () => ok({ upload: c.upload("ready"), pending } as never);
    await assert.rejects(prepareResourceWebUpload(c.attempt, c.ports, c.signal), isUnknown);
    assert.equal(c.attempt.uploadId, "fixed-upload"); assert.equal(c.attempt.putSent, true); assert.equal(c.attempt.requestId, "fixed-request-key"); assert.deepEqual(c.attempt.input, c.input());
  }
});
test("web resource noncanonical completion and grant timestamps never prove a usable upload", async () => {
  const c = fixture(); c.ports.start = async () => ok({ upload: c.upload("ready", { completedAt: "2026-10-03" }), grant: null });
  await assert.rejects(prepareResourceWebUpload(c.attempt, c.ports, c.signal), isUnknown); assert.equal(c.calls.filter(call => call.operation === "put").length, 0);
  const other = fixture(); other.ports.start = async () => ok(other.grant({ expiresAt: "2030-01-01" }));
  await assert.rejects(prepareResourceWebUpload(other.attempt, other.ports, other.signal), isUnknown); assert.equal(other.calls.filter(call => call.operation === "put").length, 0); assert.equal(other.calls.filter(call => call.operation === "complete").length, 0);
});
