import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, createCipheriv } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import { createResourceFileStorageCore, ResourceFileStorageError, resourceFileMaximumBytes, type ResourceStorageAdapter, type ResourceStorageRef } from "../src/lib/resource-file-storage-core";
import { createResourceFileStorage } from "../src/lib/resource-file-storage";
import { decryptAttachmentBuffer, encryptAttachmentBuffer } from "../src/lib/attachment-encryption-core";

const key = Buffer.alloc(32, 71), iv = Buffer.alloc(12, 29);
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const ref = (name: string, provider = "supabase-storage"): ResourceStorageRef => ({ storageProvider: provider, storageKey: `resources/${name}` });
const id = (value: ResourceStorageRef) => `${value.storageProvider}:${value.storageKey}`;
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function stream(bytes: Uint8Array, piece = 37) {
  let offset = 0;
  return new ReadableStream<Uint8Array>({ pull(controller) { if (offset === bytes.byteLength) { controller.close(); return; } const next = bytes.slice(offset, offset + piece); offset += next.byteLength; controller.enqueue(next); } }, { highWaterMark: 0 });
}
async function collect(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader(), chunks: Uint8Array[] = [];
  try { while (true) { const value = await reader.read(); if (value.done) break; chunks.push(value.value); } return Buffer.concat(chunks); }
  finally { reader.releaseLock(); }
}
function enc(bytes: Buffer, encryptionKey = key, nonce = iv) {
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce); const payload = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from("ENC1"), nonce, cipher.getAuthTag(), payload]);
}
function memory() {
  const files = new Map<string, Buffer>(); const calls = { read: 0, write: 0, chunks: [] as number[] };
  const adapter: ResourceStorageAdapter = {
    async read(value) { calls.read++; const bytes = files.get(id(value)); if (!bytes) throw Error("synthetic missing"); return { body: stream(bytes), mimeType: "application/pdf" }; },
    async write(value, body, input) { calls.write++; if (files.has(id(value))) throw new ResourceFileStorageError("UPLOAD_CONFLICT"); const reader = body.getReader(), chunks: Uint8Array[] = []; try { while (true) { input.signal.throwIfAborted(); const item = await reader.read(); if (item.done) break; calls.chunks.push(item.value.byteLength); chunks.push(item.value); } files.set(id(value), Buffer.concat(chunks)); } finally { reader.releaseLock(); } },
    async delete(value) { files.delete(id(value)); }, async exists(value) { return files.has(id(value)); }, async sign() { return { url: "https://synthetic.invalid/signed?token=synthetic" }; },
  };
  return { files, calls, adapter };
}
async function context(t: Parameters<Parameters<typeof test>[1]>[0], overrides: Record<string, unknown> = {}) {
  const root = await fs.mkdtemp("/private/tmp/bajaul-resource-test-"); const m = memory();
  const counts = { opens: 0, closes: 0, maxOpen: 0, writes: [] as { length: number; prefix: string }[] };
  const fileSystem = {
    async open(...args: Parameters<typeof fs.open>) {
      const handle = await fs.open(...args); counts.opens++; counts.maxOpen = Math.max(counts.maxOpen, counts.opens - counts.closes);
      let closed = false;
      return new Proxy(handle, { get(target, property) {
        if (property === "close") return async () => { if (!closed) { closed = true; counts.closes++; } return target.close(); };
        if (property === "write") return async (bytes: Uint8Array, offset: number, length: number, position: number) => { counts.writes.push({ length, prefix: Buffer.from(bytes.subarray(offset, offset + Math.min(length, 8))).toString("hex") }); return target.write(bytes, offset, length, position); };
        const value = Reflect.get(target, property, target); return typeof value === "function" ? value.bind(target) : value;
      } });
    },
  };
  const core = createResourceFileStorageCore({ adapter: m.adapter, getEncryptionKey: () => key, temporaryRoot: root, timeoutMs: 1000, fileSystem, ...overrides });
  t.after(async () => { assert.equal(counts.opens, counts.closes, "every owned ciphertext handle closed once"); assert.deepEqual(await fs.readdir(root), [], "no named spool artifact survives"); await fs.rm(root, { recursive: true, force: true }); });
  return { core, root, ...m, counts };
}
function error(code: string, evidence = "none") { return (value: unknown) => value instanceof ResourceFileStorageError && value.code === code && value.writeEvidence === evidence && !value.message.includes("synthetic secret"); }

// Each case uses actual filesystem/crypto/helper code; adapters replace remote I/O only.
test("resource finalize ENC1 is compatible and confirms only after final object reread", async t => {
  const c = await context(t), bytes = Buffer.from("%PDF-1.7\nsynthetic\n".repeat(200)); c.files.set(id(ref("staging/a")), bytes);
  const result = await c.core.finalizeResourceStoredUpload({ staging: ref("staging/a"), final: ref("final/a"), size: bytes.length, wholeSha256: hash(bytes), ivBase64: iv.toString("base64") });
  const stored = c.files.get(id(ref("final/a")))!;
  assert.deepEqual(decryptAttachmentBuffer(stored, { ATTACHMENT_ENCRYPTION_KEY: key.toString("base64") }), bytes);
  assert.equal(result.storedSize, bytes.length + 32); assert.equal(result.storedSha256, hash(stored)); assert.equal(result.writeEvidence, "confirmed"); assert.equal(c.calls.read, 2); assert.equal(c.counts.maxOpen, 1);
  const read = await c.core.readResourceStoredFile(ref("final/a"), { expectedSize: bytes.length, expectedSha256: hash(bytes), beforeExpose() {} });
  assert.equal(read.mimeType, "application/pdf"); assert.equal(read.previewKind, "pdf"); assert.deepEqual(await collect(read.body), bytes);
});
test("resource encryption core legacy outputs decode through bounded helper", async t => {
  const c = await context(t), bytes = Buffer.from("legacy compatible bytes"); c.files.set(id(ref("final/legacy")), encryptAttachmentBuffer(bytes, { ATTACHMENT_ENCRYPTION_KEY: key.toString("hex") }));
  const read = await c.core.readResourceStoredFile(ref("final/legacy"), { expectedSize: bytes.length, expectedSha256: hash(bytes), beforeExpose() {} }); assert.deepEqual(await collect(read.body), bytes);
});
test("resource immutable conflict reuses verified equal bytes without overwriting", async t => {
  const c = await context(t), bytes = Buffer.from("original immutable"); c.files.set(id(ref("staging/a")), bytes); c.files.set(id(ref("final/a")), enc(bytes));
  const before = c.files.get(id(ref("final/a")))!; const result = await c.core.finalizeResourceStoredUpload({ staging: ref("staging/a"), final: ref("final/a"), size: bytes.length, wholeSha256: hash(bytes), ivBase64: iv.toString("base64") });
  assert.equal(result.reused, true); assert.equal(c.files.get(id(ref("final/a"))), before); assert.equal(result.storedSha256, hash(before));
});
test("resource immutable different content cannot become ready on conflict", async t => {
  const c = await context(t), bytes = Buffer.from("same exact size!!"), other = Buffer.from("different bytes!!"); c.files.set(id(ref("staging/a")), bytes); c.files.set(id(ref("final/a")), enc(other));
  await assert.rejects(c.core.finalizeResourceStoredUpload({ staging: ref("staging/a"), final: ref("final/a"), size: bytes.length, wholeSha256: hash(bytes), ivBase64: iv.toString("base64") }), error("UPLOAD_CONFLICT", "unknown")); assert.deepEqual(c.files.get(id(ref("final/a"))), enc(other));
});
test("resource successful PUT followed by corrupt provider bytes is unknown, never confirmed", async t => {
  const c = await context(t), bytes = Buffer.from("actual provider proof"); c.files.set(id(ref("staging/a")), bytes);
  const write = c.adapter.write; c.adapter.write = async (...args) => { await write(...args); const value = c.files.get(id(args[0]))!; value[value.length - 1] ^= 1; };
  await assert.rejects(c.core.finalizeResourceStoredUpload({ staging: ref("staging/a"), final: ref("final/a"), size: bytes.length, wholeSha256: hash(bytes) }), error("STORAGE_UNAVAILABLE", "unknown"));
});
test("resource source size/hash failures perform no external write", async t => {
  const c = await context(t), bytes = Buffer.from("source content"); c.files.set(id(ref("staging/a")), bytes);
  for (const input of [{ size: bytes.length - 1, wholeSha256: hash(bytes) }, { size: bytes.length + 1, wholeSha256: hash(bytes) }, { size: bytes.length, wholeSha256: "0".repeat(64) }]) await assert.rejects(c.core.finalizeResourceStoredUpload({ staging: ref("staging/a"), final: ref("final/a"), ...input }), error("UPLOAD_CONFLICT"));
  assert.equal(c.calls.write, 0);
});
test("resource invalid key/ref/size/IV are safe failures before storage exposure", async t => {
  const c = await context(t); for (const value of [ref("../escape"), ref("x", "unknown"), ref("x\\y"), { ...ref("x"), storageKey: "https://secret.invalid/object" }]) await assert.rejects(c.core.resourceStoredFileExists(value), error("STORAGE_UNAVAILABLE"));
  for (const size of [0, resourceFileMaximumBytes + 1, 1.1]) await assert.rejects(c.core.finalizeResourceStoredUpload({ staging: ref("staging/a"), final: ref("final/a"), size, wholeSha256: "0".repeat(64) }), error("UPLOAD_CONFLICT"));
  await assert.rejects(c.core.finalizeResourceStoredUpload({ staging: ref("staging/a"), final: ref("final/a"), size: 1, wholeSha256: "0".repeat(64), ivBase64: "invalid" }), error("UPLOAD_CONFLICT")); assert.equal(c.calls.read, 0);
});
test("resource full GCM tag and SHA verification happen before fresh authorization callback", async t => {
  const c = await context(t), bytes = Buffer.from("private body"); let exposed = 0;
  const stored = enc(bytes); stored[stored.length - 1] ^= 1; c.files.set(id(ref("final/a")), stored);
  await assert.rejects(c.core.readResourceStoredFile(ref("final/a"), { expectedSize: bytes.length, beforeExpose() { exposed++; } }), error("STORAGE_UNAVAILABLE"));
  c.files.set(id(ref("final/a")), enc(bytes)); await assert.rejects(c.core.readResourceStoredFile(ref("final/a"), { expectedSize: bytes.length, expectedSha256: "0".repeat(64), beforeExpose() { exposed++; } }), error("UPLOAD_CONFLICT")); assert.equal(exposed, 0);
});
test("resource late permission failure preserves auth error and releases spool before any body", async t => {
  const c = await context(t), bytes = Buffer.from("private content"); c.files.set(id(ref("final/a")), enc(bytes)); const authError = Object.assign(new Error("auth denied"), { status: 401 });
  await assert.rejects(c.core.readResourceStoredFile(ref("final/a"), { expectedSize: bytes.length, beforeExpose() { throw authError; } }), value => value === authError); assert.equal(c.counts.opens, c.counts.closes);
});
test("resource response cancellation closes exactly once and frees process admission", async t => {
  const c = await context(t), bytes = Buffer.alloc(120000, 13); c.files.set(id(ref("final/a")), enc(bytes));
  const read = await c.core.readResourceStoredFile(ref("final/a"), { expectedSize: bytes.length, beforeExpose() {} });
  await assert.rejects(c.core.readResourceStoredFile(ref("final/a"), { expectedSize: bytes.length, beforeExpose() {} }), error("STORAGE_BUSY"));
  const reader = read.body.getReader(); await reader.read(); await reader.cancel(); reader.releaseLock();
  const again = await c.core.readResourceStoredFile(ref("final/a"), { expectedSize: bytes.length, beforeExpose() {} }); await again.body.cancel(); assert.equal(c.counts.opens, c.counts.closes);
});
test("resource stalled source and response stream are bounded and cancel their owned reads", async t => {
  const c = await context(t, { timeoutMs: 25 }); let cancelled = 0;
  c.adapter.read = async () => ({ body: new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled++; } }) });
  await assert.rejects(c.core.readResourceStoredFile(ref("final/a"), { expectedSize: 12, beforeExpose() {} }), error("STORAGE_TIMEOUT")); await delay(0); assert.equal(cancelled, 1);
  c.adapter.read = async () => ({ body: stream(enc(Buffer.from("private body"))) });
  const response = await c.core.readResourceStoredFile(ref("final/a"), { expectedSize: 12, beforeExpose() {} }); await delay(35); await assert.rejects(collect(response.body), error("STORAGE_TIMEOUT")); assert.equal(c.counts.opens, c.counts.closes);
});
test("resource aborted download cancels source and never calls beforeExpose", async t => {
  const c = await context(t), controller = new AbortController(); let cancelled = 0, exposed = 0;
  c.adapter.read = async () => ({ body: new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled++; } }) });
  const promise = c.core.readResourceStoredFile(ref("final/a"), { expectedSize: 12, signal: controller.signal, beforeExpose() { exposed++; } }); controller.abort(); await assert.rejects(promise, error("STORAGE_ABORTED")); await delay(0); assert.equal(cancelled, 1); assert.equal(exposed, 0);
});
test("resource late immutable write after timeout remains unknown even after delete", async t => {
  const c = await context(t), bytes = Buffer.from("late provider bytes"); c.files.set(id(ref("staging/a")), bytes); let commit!: () => void;
  c.adapter.write = async (value, body) => { const written = await collect(body); await new Promise<void>(resolve => { commit = () => { c.files.set(id(value), written); resolve(); }; }); };
  await assert.rejects(c.core.finalizeResourceStoredUpload({ staging: ref("staging/a"), final: ref("final/a"), size: bytes.length, wholeSha256: hash(bytes), timeoutMs: 25 }), error("STORAGE_TIMEOUT", "unknown"));
  await c.core.deleteResourceStoredFile(ref("final/a")); assert.equal(await c.core.resourceStoredFileExists(ref("final/a")), false); commit(); await delay(0); assert.equal(await c.core.resourceStoredFileExists(ref("final/a")), true);
});
test("resource low free-space and ENOSPC fail without provider write or leaked spool", async t => {
  const m = memory(), root = await fs.mkdtemp("/private/tmp/bajaul-resource-enospc-"); t.after(() => fs.rm(root, { recursive: true, force: true })); const bytes = Buffer.from("input"); m.files.set(id(ref("staging/a")), bytes);
  const low = createResourceFileStorageCore({ adapter: m.adapter, getEncryptionKey: () => key, temporaryRoot: root, fileSystem: { statfs: async () => ({ bavail: 1n, bsize: 1n }) as Awaited<ReturnType<typeof fs.statfs>> } });
  await assert.rejects(low.finalizeResourceStoredUpload({ staging: ref("staging/a"), final: ref("final/a"), size: bytes.length, wholeSha256: hash(bytes) }), error("STORAGE_UNAVAILABLE")); assert.deepEqual(await fs.readdir(root), []);
  let closed = 0; const noSpace = createResourceFileStorageCore({ adapter: m.adapter, getEncryptionKey: () => key, temporaryRoot: root, fileSystem: { async open(...args) { const file = await fs.open(...args); return new Proxy(file, { get(target, prop) { if (prop === "write") return async () => { throw Object.assign(new Error("synthetic secret ENOSPC"), { code: "ENOSPC" }); }; if (prop === "close") return async () => { closed++; await target.close(); }; const value = Reflect.get(target, prop, target); return typeof value === "function" ? value.bind(target) : value; } }); } } });
  await assert.rejects(noSpace.finalizeResourceStoredUpload({ staging: ref("staging/a"), final: ref("final/a"), size: bytes.length, wholeSha256: hash(bytes) }), error("STORAGE_UNAVAILABLE")); assert.equal(closed, 1); assert.equal(m.calls.write, 0); assert.deepEqual(await fs.readdir(root), []);
});
test("resource partial writes are completed and every spool write stays <=64KiB", async t => {
  const m = memory(), root = await fs.mkdtemp("/private/tmp/bajaul-resource-partial-"); t.after(() => fs.rm(root, { recursive: true, force: true })); const bytes = Buffer.alloc(150000, 11); m.files.set(id(ref("staging/a")), bytes); let max = 0;
  const core = createResourceFileStorageCore({ adapter: m.adapter, getEncryptionKey: () => key, temporaryRoot: root, fileSystem: { async open(...args) { const file = await fs.open(...args); return new Proxy(file, { get(target, prop) { if (prop === "write") return async (b: Uint8Array, off: number, len: number, pos: number) => { max = Math.max(max, len); return target.write(b, off, Math.min(997, len), pos); }; const value = Reflect.get(target, prop, target); return typeof value === "function" ? value.bind(target) : value; } }); } } });
  await core.finalizeResourceStoredUpload({ staging: ref("staging/a"), final: ref("final/a"), size: bytes.length, wholeSha256: hash(bytes) }); assert.ok(max <= 65536); assert.deepEqual(decryptAttachmentBuffer(m.files.get(id(ref("final/a")))!, { ATTACHMENT_ENCRYPTION_KEY: key.toString("base64") }), bytes);
});
test("resource disabled encryption keeps final legacy plaintext but temporary writes encrypted", async t => {
  const c = await context(t, { getEncryptionKey: () => null }), bytes = Buffer.from("PLAINTEXT never in temporary file"); c.files.set(id(ref("staging/a")), bytes);
  const result = await c.core.finalizeResourceStoredUpload({ staging: ref("staging/a"), final: ref("final/a"), size: bytes.length, wholeSha256: hash(bytes) }); assert.deepEqual(c.files.get(id(ref("final/a"))), bytes); assert.equal(result.storedSha256, hash(bytes)); assert.equal(result.encryptionIvBase64, null);
  assert.ok(c.counts.writes.every(w => w.prefix !== bytes.subarray(0, 8).toString("hex"))); const response = await c.core.readResourceStoredFile(ref("final/a"), { expectedSize: bytes.length, beforeExpose() {} }); assert.deepEqual(await collect(response.body), bytes);
});
test("resource ENC1 magic collision exactly preserves existing legacy detection", async t => {
  const c = await context(t); const short = Buffer.from("ENC1short"); c.files.set(id(ref("final/a")), short); const a = await c.core.readResourceStoredFile(ref("final/a"), { expectedSize: short.length, beforeExpose() {} }); assert.deepEqual(await collect(a.body), short);
  const long = Buffer.from("ENC1" + "legacy plaintext".repeat(5)); c.files.set(id(ref("final/a")), long); await assert.rejects(c.core.readResourceStoredFile(ref("final/a"), { expectedSize: long.length, beforeExpose() {} }), error("UPLOAD_CONFLICT"));
});
test("resource staging retry accepts only actual equal immutable source and rereads it", async t => {
  const c = await context(t), bytes = Buffer.from("trusted server File.stream");
  const first = await c.core.writeResourceStagingFile(ref("staging/a"), { body: stream(bytes), size: bytes.length, wholeSha256: hash(bytes), mimeType: "text/plain" }); assert.equal(first.storedSha256, hash(bytes)); assert.equal(first.reused, false);
  const replay = await c.core.writeResourceStagingFile(ref("staging/a"), { body: stream(bytes), size: bytes.length, mimeType: "text/plain" }); assert.equal(replay.reused, true);
  await assert.rejects(c.core.writeResourceStagingFile(ref("staging/a"), { body: stream(Buffer.alloc(bytes.length, 2)), size: bytes.length, mimeType: "text/plain" }), error("UPLOAD_CONFLICT", "unknown")); assert.deepEqual(c.files.get(id(ref("staging/a"))), bytes);
});
test("resource binary preview is detected from authenticated bytes, never provider MIME", async t => {
  const c = await context(t); const cases: [Buffer, string, "image" | "pdf" | null][] = [
    [Buffer.from("%PDF-1.7\n"), "application/pdf", "pdf"], [Buffer.from([137,80,78,71,13,10,26,10,0]), "image/png", "image"], [Buffer.from([255,216,255,224]), "image/jpeg", "image"], [Buffer.from("GIF89a\0"), "image/gif", "image"], [Buffer.from("RIFF0000WEBPfake"), "image/webp", "image"], [Buffer.from("<svg xmlns='synthetic'/>"), "application/octet-stream", null], [Buffer.from("<!doctype html><html>secret</html>"), "application/octet-stream", null],
  ];
  for (const [bytes, mimeType, previewKind] of cases) { c.files.set(id(ref("final/a")), enc(bytes)); const value = await c.core.readResourceStoredFile(ref("final/a"), { expectedSize: bytes.length, beforeExpose() {} }); assert.equal(value.mimeType, mimeType); assert.equal(value.previewKind, previewKind); await value.body.cancel(); }
});
test("resource owned orphan directory sweep excludes unrelated and live namespaces", async t => {
  const c = await context(t); const stale = path.join(c.root, `bajaul-resource-spool-${process.pid}-old`), unrelated = path.join(c.root, "other-owner"); await fs.mkdir(stale); await fs.utimes(stale, 1, 1); await fs.mkdir(unrelated); const bytes = Buffer.from("sweep"); c.files.set(id(ref("final/a")), enc(bytes));
  const value = await c.core.readResourceStoredFile(ref("final/a"), { expectedSize: bytes.length, beforeExpose() {} }); await value.body.cancel(); assert.deepEqual(await fs.readdir(c.root), ["other-owner"]); await fs.rm(unrelated, { recursive: true });
});

const syntheticEnv = { SUPABASE_URL: "https://synthetic.invalid", SUPABASE_STORAGE_BUCKET: "private-fixtures", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role" };
test("resource Supabase signed grant uses POST sign, raw PUT grant, conservative 7200s", async t => {
  const root = await fs.mkdtemp("/private/tmp/bajaul-resource-rest-"); t.after(() => fs.rm(root, { recursive: true, force: true })); let request!: RequestInit; let requested = ""; const now = 1_700_000_000_000;
  const storage = createResourceFileStorage({ env: syntheticEnv, temporaryRoot: root, now: () => now, fetch: async (url, init) => { requested = String(url); request = init!; return Response.json({ url: "/object/upload/sign/private-fixtures/resources/staging/a?token=synthetic" }); } });
  const grant = await storage.createResourceStagingGrant(ref("staging/a"), { mimeType: "application/pdf" }); assert.ok(requested.endsWith("/object/upload/sign/private-fixtures/resources/staging/a")); assert.equal(request.method, "POST"); assert.equal(request.body, "{}"); assert.equal(grant.method, "PUT"); assert.equal(grant.expiresAt, new Date(now + 7200000).toISOString()); assert.equal(grant.headers["Content-Type"], "application/pdf");
});
test("resource Supabase refuses untrusted signed URLs and oversized or stalled sign JSON", async t => {
  const root = await fs.mkdtemp("/private/tmp/bajaul-resource-rest-bad-"); t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const url of ["https://evil.invalid/object/upload/sign/private-fixtures/resources/staging/a?token=x", "/object/upload/sign/private-fixtures/resources/final/a?token=x", "/object/upload/sign/private-fixtures/resources/staging/a?token=x&extra=y", "/object/upload/sign/private-fixtures/resources/staging/a?token="]) {
    const core = createResourceFileStorage({ env: syntheticEnv, temporaryRoot: root, fetch: async () => Response.json({ url }) }); await assert.rejects(core.createResourceStagingGrant(ref("staging/a"), { mimeType: "application/pdf" }), error("STORAGE_UNAVAILABLE"));
  }
  let cancelled = 0; const stalled = createResourceFileStorage({ env: syntheticEnv, temporaryRoot: root, timeoutMs: 20, fetch: async () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled++; } })) }); await assert.rejects(stalled.createResourceStagingGrant(ref("staging/a"), { mimeType: "x/y" }), error("STORAGE_TIMEOUT")); await delay(0); assert.equal(cancelled, 1);
  const large = createResourceFileStorage({ env: syntheticEnv, temporaryRoot: root, fetch: async () => new Response(stream(Buffer.alloc(17000, 32))) }); await assert.rejects(large.createResourceStagingGrant(ref("staging/a"), { mimeType: "x/y" }), error("STORAGE_UNAVAILABLE"));
});
test("resource Supabase actual adapter sends streamed POST create-only, then authenticated reread", async t => {
  const root = await fs.mkdtemp("/private/tmp/bajaul-resource-rest-stream-"); t.after(() => fs.rm(root, { recursive: true, force: true })); const bytes = Buffer.from("web FormData File stream"), calls: RequestInit[] = []; let stored = Buffer.alloc(0);
  const storage = createResourceFileStorage({ env: syntheticEnv, temporaryRoot: root, fetch: async (_url, init) => { calls.push(init!); if (init?.method === "POST") { assert.ok(init.body instanceof ReadableStream); assert.equal((init as RequestInit & { duplex: string }).duplex, "half"); assert.equal(new Headers(init.headers).get("x-upsert"), "false"); assert.equal(new Headers(init.headers).get("Content-Length"), String(bytes.length)); stored = await collect(init.body as ReadableStream<Uint8Array>); return new Response(null, { status: 200 }); } return new Response(stream(stored), { headers: { "Content-Type": "text/html" } }); } });
  const value = await storage.writeResourceStagingFile(ref("staging/a"), { body: stream(bytes), size: bytes.length, mimeType: "text/plain" }); assert.equal(value.storedSha256, hash(bytes)); assert.equal(calls.length, 2); assert.equal(calls[1].cache, "no-store"); assert.equal(new Headers(calls[1].headers).get("Accept-Encoding"), "identity");
});
test("resource real local adapter creates immutable final, streams verification and deletes", async t => {
  const root = await fs.mkdtemp("/private/tmp/bajaul-resource-local-"); t.after(() => fs.rm(root, { recursive: true, force: true })); const bytes = Buffer.from("local private fixture"), storage = createResourceFileStorage({ env: { ATTACHMENT_ENCRYPTION_KEY: key.toString("hex") }, localRoot: root, temporaryRoot: root });
  await storage.writeResourceStagingFile(ref("staging/a", "local"), { body: stream(bytes), size: bytes.length, mimeType: "text/plain" }); const first = await storage.finalizeResourceStoredUpload({ staging: ref("staging/a", "local"), final: ref("final/a", "local"), size: bytes.length, wholeSha256: hash(bytes), ivBase64: iv.toString("base64") });
  const second = await storage.finalizeResourceStoredUpload({ staging: ref("staging/a", "local"), final: ref("final/a", "local"), size: bytes.length, wholeSha256: hash(bytes), ivBase64: iv.toString("base64") }); assert.equal(second.reused, true); assert.equal(first.storedSha256, second.storedSha256);
  const value = await storage.readResourceStoredFile(ref("final/a", "local"), { expectedSize: bytes.length, beforeExpose() {} }); assert.deepEqual(await collect(value.body), bytes); await storage.deleteResourceStoredFile(ref("final/a", "local")); assert.equal(await storage.resourceStoredFileExists(ref("final/a", "local")), false); await assert.rejects(storage.createResourceStagingGrant(ref("staging/a", "local"), { mimeType: "text/plain" }), error("STORAGE_UNAVAILABLE"));
});
test("resource wrong or missing encryption key cannot expose authenticated plaintext", async t => {
  const c = await context(t, { getEncryptionKey: () => Buffer.alloc(32, 17) }), bytes = Buffer.from("wrong key private content"); c.files.set(id(ref("final/a")), enc(bytes)); let exposed = 0;
  await assert.rejects(c.core.readResourceStoredFile(ref("final/a"), { expectedSize: bytes.length, beforeExpose() { exposed++; } }), error("STORAGE_UNAVAILABLE"));
  const missing = createResourceFileStorageCore({ adapter: c.adapter, getEncryptionKey: () => null, temporaryRoot: c.root }); await assert.rejects(missing.readResourceStoredFile(ref("final/a"), { expectedSize: bytes.length, beforeExpose() { exposed++; } }), error("STORAGE_UNAVAILABLE")); assert.equal(exposed, 0);
});
test("resource conflicting immutable IV is not accepted even with equal plaintext", async t => {
  const c = await context(t), bytes = Buffer.from("equal body different encryption nonce"); c.files.set(id(ref("staging/a")), bytes); const stored = enc(bytes, key, Buffer.alloc(12, 99)); c.files.set(id(ref("final/a")), stored);
  await assert.rejects(c.core.finalizeResourceStoredUpload({ staging: ref("staging/a"), final: ref("final/a"), size: bytes.length, wholeSha256: hash(bytes), ivBase64: iv.toString("base64") }), error("UPLOAD_CONFLICT", "unknown")); assert.equal(c.files.get(id(ref("final/a"))), stored);
});
test("resource fresh authorization deadline releases spool and returns no response", async t => {
  const c = await context(t), bytes = Buffer.from("private body"); c.files.set(id(ref("final/a")), enc(bytes));
  await assert.rejects(c.core.readResourceStoredFile(ref("final/a"), { expectedSize: bytes.length, timeoutMs: 20, beforeExpose() { return new Promise(() => {}); } }), error("STORAGE_TIMEOUT")); assert.equal(c.counts.opens, c.counts.closes);
});
test("resource timed-out late response headers cancel the body without allocating a spool", async t => {
  const c = await context(t); let resolve!: (value: { body: ReadableStream<Uint8Array> }) => void, cancelled = 0;
  c.adapter.read = async () => new Promise(done => { resolve = done; });
  await assert.rejects(c.core.readResourceStoredFile(ref("final/a"), { expectedSize: 3, timeoutMs: 15, beforeExpose() {} }), error("STORAGE_TIMEOUT")); resolve({ body: new ReadableStream({ cancel() { cancelled++; } }) }); await delay(0); assert.equal(cancelled, 1); assert.equal(c.counts.opens, 0);
});

test("resource provider undefined rejection remains a safe storage error", async t => {
  const c = await context(t); c.adapter.read = async () => { throw undefined; };
  await assert.rejects(c.core.readResourceStoredFile(ref("final/a"), { expectedSize: 3, beforeExpose() {} }), error("STORAGE_UNAVAILABLE"));
});
