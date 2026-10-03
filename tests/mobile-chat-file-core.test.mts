import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { ApiError, attachment, filePolicy, loadChatFileCore, message, response, tick } from "./helpers/mobile-chat-file.mjs";

function harness() {
  const requests: { path: string; init: RequestInit }[] = [], removed: unknown[] = [], parts: { offset: number; size: number; released: boolean }[] = [];
  let responder: (path: string, init: RequestInit) => Promise<Response> = async () => response({ match: true, status: "downloading" });
  const { core } = loadChatFileCore({ fetch: async (url: string, init: RequestInit) => { const path = new URL(url).pathname + new URL(url).search; requests.push({ path, init }); return responder(path, init); } });
  let picked = { file: { size: 12, head: new TextEncoder().encode("%PDF-1.7\nabc") }, name: "합성.pdf", size: 12, mimeType: "application/pdf" };
  let downloadCount = 0, multipartCount = 0, putCount = 0;
  let downloadHandler = async () => ({ file: { ...picked.file }, info: { name: picked.name, size: picked.size, mimeType: picked.mimeType, receiptToken: "receipt-token-123" } });
  let multipartHandler = async () => ({ message: message({ ...attachment, originalName: picked.name, size: picked.size }) });
  let exportHandler = async () => ({ kind: "handoff", message: "합성 저장 창" });
  let digestChanged = false;
  const adapter = {
    pick: async () => picked,
    size: (file: { size: number }) => file.size,
    head: async (file: { head: Uint8Array }) => file.head,
    async part(_file: unknown, offset: number, size: number) { const part = { offset, size, released: false }; parts.push(part); return { file: part, digest: createHash("sha256").update(`${offset}:${size}:${digestChanged}`).digest("hex"), release() { part.released = true; } }; },
    multipart: async () => { multipartCount++; return multipartHandler(); },
    putPart: async () => { putCount++; return { ok: true }; },
    download: async () => { downloadCount++; return downloadHandler(); },
    export: async () => exportHandler(),
    preview: () => ({ uri: "file://synthetic-private-preview", release() {} }),
    release: (file: unknown) => removed.push(file), clear: async () => {},
  };
  const api = core.createChatFileApi(adapter);
  const transfer = (extra = {}) => api.createChatFileTransfer({ attachment, token: "synthetic-session", actorId: "recipient", peerId: "sender", messageId: "message-1", requestId: "request-original", isSender: false, ...extra });
  const choose = () => api.pickChatFile({ policy: filePolicy, token: "synthetic-session" });
  return { api, core, adapter, requests, removed, parts, transfer, choose, setResponder(fn: typeof responder) { responder = fn; }, setPicked(value: typeof picked) { picked = value; }, setDownload(fn: typeof downloadHandler) { downloadHandler = fn; }, setMultipart(fn: typeof multipartHandler) { multipartHandler = fn; }, setExport(fn: typeof exportHandler) { exportHandler = fn; }, changeDigest() { digestChanged = true; }, counts: () => ({ downloadCount, multipartCount, putCount }) };
}
const upload = (file: unknown, extra = {}) => ({ file, actorId: "sender", peerId: "recipient", body: "", requestId: "original-upload", token: "synthetic-session", ...extra });

test("chat file selection is opaque, policy bounded, and account scoped", async () => {
  const h = harness(), file = await h.choose(); assert.deepEqual(Object.keys(file).sort(), ["name","release","size"]); assert.equal(Object.isFrozen(file), true);
  await h.api.clearChatFileResources(); await assert.rejects(h.api.uploadChatFile(upload(file)), { status: 0 });
  assert.equal(h.counts().multipartCount, 0); assert.equal(h.removed.length, 1);
  assert.throws(() => h.core.validateChatPickedFile("fake.exe", 4, filePolicy), { status: 415 });
  assert.throws(() => h.core.validateChatPickedFile("large.pdf", 4194305, filePolicy), { status: 413 });
  assert.equal(h.core.validateChatPickedFile("../안전.zip", 104857600, filePolicy), "_안전.zip");
});

test("small upload ambiguous replay preserves original key, body, snapshot and blocks different requests", async () => {
  const h = harness(), file = await h.choose(); h.setMultipart(async () => { throw new ApiError("response lost", 0); });
  await assert.rejects(h.api.uploadChatFile(upload(file)), { status: 0 }); file.release(); assert.equal(h.removed.length, 0);
  await assert.rejects(h.api.uploadChatFile(upload(file, { requestId: "different-key" })), { status: 409 });
  await assert.rejects(h.api.uploadChatFile(upload(file, { body: "changed" })), { status: 409 }); assert.equal(h.counts().multipartCount, 1);
  h.setMultipart(async () => ({ message: message() })); const saved = await h.api.uploadChatFile(upload(file)); assert.equal(saved.message.id, "message-1"); assert.equal(h.removed.length, 1);
});

test("definitive validation rejection unlocks selected file for corrected new-key retry", async () => {
  const h = harness(), file = await h.choose(); h.setMultipart(async () => { throw new ApiError("invalid", 413); });
  await assert.rejects(h.api.uploadChatFile(upload(file)), { status: 413 });
  h.setMultipart(async () => ({ message: message(attachment, { body: "수정" }) }));
  assert.equal((await h.api.uploadChatFile(upload(file, { body: "수정", requestId: "new-valid-key" }))).message.body, "수정"); file.release();
});

test("ZIP metadata uses ordered chunk digests and pure recovery resumes only missing parts", async () => {
  const h = harness(), size = 4194304 + 17; h.setPicked({ file: { size, head: new Uint8Array() }, name: "합성.zip", size, mimeType: "application/zip" });
  const file = await h.choose(); let lost = true; const id = "12345678-1234-1234-1234-123456789abc";
  h.setResponder(async (path, init) => {
    if (path.endsWith("/uploads") && init.method === "POST") { if (lost) { lost = false; throw new Error("start response lost"); } throw new Error("start must not be retried once status exists"); }
    if (path.includes("?requestId=")) return response({ uploadId: id, uploadedParts: [0] });
    if (path.endsWith("/complete")) return response({ message: message({ ...attachment, originalName: "합성.zip", size }) });
    throw new Error(path);
  });
  await assert.rejects(h.api.uploadChatFile(upload(file)), { status: 0 });
  const start = JSON.parse(h.requests[0].init.body as string); assert.equal(start.chunkDigests.length, 2); assert.ok(start.chunkDigests.every((d: string) => /^[a-f0-9]{64}$/.test(d))); assert.equal(start.size, size);
  await h.api.uploadChatFile(upload(file)); assert.equal(h.counts().putCount, 1); assert.deepEqual(h.parts.map(p => [p.offset,p.size,p.released]), [[0,4194304,true],[4194304,17,true],[4194304,17,true]]);
  assert.equal(h.requests[1].init.method, "GET"); assert.match(h.requests[1].path, /requestId=original-upload/); file.release();
});

test("ZIP changed snapshot and truthy part acknowledgments cannot publish", async () => {
  for (const changed of [true, false]) {
    const h = harness(), size = 4194305; h.setPicked({ file: { size, head: new Uint8Array() }, name: "a.zip", size, mimeType: "application/zip" }); const file = await h.choose();
    h.setResponder(async path => { assert.ok(!path.endsWith("/complete")); if (changed) h.changeDigest(); return response({ uploadId: "12345678-1234-1234-1234-123456789abc", uploadedParts: [] }); });
    if (!changed) h.adapter.putPart = async () => ({ ok: "true" });
    await assert.rejects(h.api.uploadChatFile(upload(file)), { status: changed ? 409 : 200 }); assert.equal(h.requests.length, 1); await h.api.clearChatFileResources();
  }
});

test("full bytes alone and share void do not complete; explicit saved confirmation binds both receipt fields", async () => {
  const h = harness(), operation = h.transfer(); assert.equal(await operation.download(), true);
  await assert.rejects(operation.complete({ confirmedSaved: true }), { status: 400 }); assert.equal(h.requests.length, 0);
  const result = await operation.share(); assert.equal(result.requiresConfirmation, true); await assert.rejects(operation.complete(), { status: 400 }); assert.equal(h.requests.length, 0);
  h.setResponder(async path => path.endsWith("/status") ? response({ match: true, status: "downloading" }) : response({ message: message({ ...attachment, status: "deleted" }) }));
  await operation.complete({ confirmedSaved: true });
  assert.deepEqual(JSON.parse(h.requests[0].init.body as string), { requestId: "request-original", token: "receipt-token-123" }); assert.deepEqual(JSON.parse(h.requests[1].init.body as string), { token: "receipt-token-123" }); assert.equal(operation.getState().completed, true);
  await h.api.clearChatFileResources();
});

test("SAF verified external save may complete, picker cancellation and sender never do", async () => {
  const h = harness(); h.setExport(async () => ({ kind: "saved", message: "saved" })); const op = h.transfer(); await op.download(); assert.equal((await op.save()).requiresConfirmation, false);
  h.setResponder(async path => path.endsWith("/status") ? response({ match: true, status: "downloading" }) : response({ message: message({ ...attachment, status: "deleted" }) })); await op.complete(); op.release(); assert.equal(h.removed.length, 1);
  const other = harness(), sender = other.transfer({ isSender: true, actorId: "sender", peerId: "recipient" }); await sender.download(); await sender.save(); await assert.rejects(sender.complete({ confirmedSaved: true }), { status: 400 }); assert.equal(other.requests.length, 0); await other.api.clearChatFileResources();
});

test("pure status mismatch stops receipt mutation and leaves full private bytes available", async () => {
  const h = harness(), op = h.transfer(); await op.download(); await op.share(); h.setResponder(async () => response({ match: false, status: "downloading" }));
  await assert.rejects(op.complete({ confirmedSaved: true }), { status: 409 }); assert.equal(h.requests.length, 1); assert.match(h.requests[0].path, /status$/); assert.equal(h.removed.length, 0); await h.api.clearChatFileResources();
});

test("deleting and lost completion retain same bytes/token and rebind same opaque operation", async () => {
  const h = harness(), op = h.transfer(); await op.download(); await op.share();
  h.setResponder(async path => path.endsWith("/status") ? response({ match: true, status: "deleting" }) : response({ message: message({ ...attachment, status: "deleting" }) }));
  await assert.rejects(op.complete({ confirmedSaved: true }), { status: 200 }); assert.equal(op.getState().completionPending, true); assert.equal(op.isReady(), false); op.release(); assert.equal(h.removed.length, 0);
  const rebound = h.transfer({ requestId: "new-key-ignored" }); assert.equal(rebound, op); await assert.rejects(rebound.share(), { status: 409 });
  h.setResponder(async path => path.endsWith("/status") ? response({ match: true, status: "deleted" }) : response({ message: message({ ...attachment, status: "deleted" }) }));
  await rebound.complete(); assert.equal(h.counts().downloadCount, 1); assert.equal(JSON.parse(h.requests[2].init.body as string).requestId, "request-original"); assert.equal(JSON.parse(h.requests[3].init.body as string).token, "receipt-token-123"); await h.api.clearChatFileResources();
});

test("unknown complete never restarts download/export and invalid identity cannot become terminal", async () => {
  const h = harness(), op = h.transfer(); await op.download(); await op.share(); h.setResponder(async path => path.endsWith("/status") ? response({ match: true, status: "downloading" }) : response({ message: message({ ...attachment, status: "deleted" }, { id: "foreign-message" }) }));
  await assert.rejects(op.complete({ confirmedSaved: true }), { status: 200 }); assert.equal(op.getState().completionPending, true); await assert.rejects(op.save(), { status: 409 }); await op.download(); assert.equal(h.counts().downloadCount, 1); await h.api.clearChatFileResources();
});

test("account cleanup is synchronous before await, drops pending credentials and ignores late bytes", async () => {
  const h = harness(); let resolve!: (value: unknown) => void; h.setDownload(() => new Promise(r => { resolve = r; })); const op = h.transfer(); const pending = op.download(); await tick();
  const clearing = h.api.clearChatFileResources(); assert.equal(op.isReady(), false);
  resolve({ file: { size: 12 }, info: { name: attachment.originalName, size: 12, mimeType: "application/pdf", receiptToken: "old-receipt-token" } }); assert.equal(await pending, false); await clearing; assert.equal(h.removed.length, 1); assert.equal(h.requests.length, 0);
});

test("preview is non-consuming, verifies actual MIME magic, and registry cannot cross account", async () => {
  const h = harness(); h.setDownload(async () => ({ file: { size: 12, head: new TextEncoder().encode("%PDF-1.7\nabc") }, info: { name: attachment.originalName, size: 12, mimeType: "application/pdf", receiptToken: null } }));
  h.api.registerChatPreviewAttachment({ attachment, token: "synthetic-session", peerId: "sender" }); assert.equal(h.api.lookupChatPreviewAttachment({ attachmentId: attachment.id, peerId: "sender", token: "other-account" }), null);
  const preview = await h.api.loadChatPreview({ attachment, token: "synthetic-session" }); assert.equal(preview.kind, "pdf"); assert.equal(h.requests.length, 0); preview.release(); await h.api.clearChatFileResources(); assert.equal(h.api.lookupChatPreviewAttachment({ attachmentId: attachment.id, peerId: "sender", token: "synthetic-session" }), null);
  assert.throws(() => h.core.chatPreviewMime(new TextEncoder().encode("<svg"), "image/png"), { status: 415 });
});

test("recipient download checks optional length and header token without exposing credentials", () => {
  const { core } = loadChatFileCore(); const headers = { "cOnTeNt-Disposition": "attachment; filename*=UTF-8''%ED%95%A9%EC%84%B1.pdf", "X-Chat-Download-Token": "receipt-token-123" };
  assert.equal(core.chatFileDownloadInfo(headers, 12, true).size, 12);
  for (const length of ["11","NaN","90071992547409930"]) assert.throws(() => core.chatFileDownloadInfo({ ...headers, "content-length": length }, 12, true), { status: 0 });
  assert.throws(() => core.chatFileDownloadInfo({ "content-disposition": "attachment; filename=a.pdf" }, 12, true), { status: 0 });
});

test("network/body deadlines cancel hanging work and classify result as uncertain", async () => {
  const { core } = loadChatFileCore(); const controller = new AbortController(); let aborted = false;
  const parent = { token: "synthetic", signal: controller.signal, check() {}, onProgress() {}, onCancel() { return () => {}; } };
  await assert.rejects(core.chatFileRequest(parent, (call: { signal: AbortSignal }) => { call.signal.addEventListener("abort", () => { aborted = true; }); return new Promise(() => {}); }, 2), { status: 0 }); assert.equal(aborted, true);
});


test("cancelled/lost download reopens same original request and duplicate actions stay locked", async () => {
  const h = harness(); let finish!: (value: unknown) => void;
  h.setDownload(() => new Promise(resolve => { finish = resolve; }));
  const original = h.transfer(), pending = original.download(); await tick();
  await assert.rejects(original.save(), { status: 409 });
  original.cancel(); original.release(); finish({ file: { size: 12 }, info: { name: attachment.originalName, size: 12, mimeType: "application/pdf", receiptToken: "receipt-token-123" } });
  assert.equal(await pending, false);
  const reopened = h.transfer({ requestId: "different-new-key" }); assert.equal(reopened, original);
  h.setDownload(async () => ({ file: { size: 12, head: new Uint8Array() }, info: { name: attachment.originalName, size: 12, mimeType: "application/pdf", receiptToken: "receipt-token-123" } }));
  assert.equal(await reopened.download(), true); await reopened.share();
  h.setResponder(async path => path.endsWith("/status") ? response({ match: true, status: "downloading" }) : response({ message: message({ ...attachment, status: "deleted" }) }));
  await reopened.complete({ confirmedSaved: true }); assert.equal(JSON.parse(h.requests[0].init.body as string).requestId, "request-original"); await h.api.clearChatFileResources();
});


test("explicit current-account discard abandons uncertain local upload only; ordinary release retains it", async () => {
  const h = harness(), file = await h.choose(); h.setMultipart(async () => { throw new ApiError("unknown", 0); });
  await assert.rejects(h.api.uploadChatFile(upload(file)), { status: 0 }); file.release(); assert.equal(h.removed.length, 0);
  assert.throws(() => h.api.discardChatFile(file, { token: "synthetic-session", isCurrent: () => false }), { name: "AbortError" }); assert.equal(h.removed.length, 0);
  h.api.discardChatFile(file, { token: "synthetic-session", isCurrent: () => true }); assert.equal(h.removed.length, 1); assert.equal(h.requests.length, 0);
  await assert.rejects(h.api.uploadChatFile(upload(file)), { status: 0 }); assert.equal(h.counts().multipartCount, 1);
  await h.api.clearChatFileResources(); const newer = await h.choose();
  assert.throws(() => h.api.discardChatFile(newer, { token: "old-session", isCurrent: () => true }), { name: "AbortError" }); assert.equal(h.removed.length, 1);
  h.api.discardChatFile(newer, { token: "synthetic-session" }); assert.equal(h.removed.length, 2);
});

test("discard cannot interrupt a busy upload or trigger server cleanup", async () => {
  const h = harness(), file = await h.choose(); let finish!: (value: unknown) => void;
  h.setMultipart(() => new Promise(resolve => { finish = resolve; })); const pending = h.api.uploadChatFile(upload(file)); await tick();
  assert.throws(() => h.api.discardChatFile(file, { token: "synthetic-session" }), { status: 409 }); assert.equal(h.removed.length, 0);
  finish({ message: message() }); await pending; h.api.discardChatFile(file, { token: "synthetic-session" }); assert.equal(h.removed.length, 1); assert.equal(h.requests.length, 0);
});
