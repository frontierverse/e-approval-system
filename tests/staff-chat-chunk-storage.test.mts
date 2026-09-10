import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";
import {
  decryptAttachmentBuffer, encryptAttachmentBuffer, isEncryptedAttachmentBuffer,
} from "../src/lib/attachment-encryption-core.ts";
import { staffChatChunkSize, staffChatZipMaxBytes } from "../src/lib/staff-chat-file-limits.ts";
import type { PreparedAttachmentFile, StoredAttachmentFile, StoredAttachmentRef } from "../src/lib/attachment-storage.ts";
import type { StaffChatStoredPart } from "../src/lib/staff-chat-chunk-storage.ts";

const uploadId = "dc812bde-7440-431d-95b0-f68bfdc58ef1";
const otherUploadId = "594458ca-5808-4f5d-98fe-4e8f60a2d6be";
const provider = "supabase-storage";
const encryptionEnv = { ATTACHMENT_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString("base64") };
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const keyOf = (ref: string | StoredAttachmentRef) => typeof ref === "string" ? ref : ref.storageKey;

const harness = {
  objects: new Map<string, Buffer>(),
  generated: new Map<string, () => StoredAttachmentFile>(),
  writes: [] as string[], reads: [] as string[], deletes: [] as string[],
  ambiguousWrite: false, failWrite: false, failRead: false,
  failDeleteKey: "",
  async persistAttachmentFiles(files: PreparedAttachmentFile[]) {
    for (const file of files) {
      harness.writes.push(file.storageKey);
      if (harness.failWrite) throw new Error("storage write failed");
      if (harness.objects.has(file.storageKey)) throw new Error("object already exists");
      harness.objects.set(file.storageKey, encryptAttachmentBuffer(file.buffer, encryptionEnv));
      if (harness.ambiguousWrite) throw new Error("storage write response lost");
    }
  },
  async readStoredAttachmentFile(ref: string | StoredAttachmentRef): Promise<StoredAttachmentFile> {
    const key = keyOf(ref);
    harness.reads.push(key);
    if (harness.failRead) throw new Error("storage read failed");
    const generated = harness.generated.get(key);
    if (generated) return generated();
    const encrypted = harness.objects.get(key);
    if (!encrypted) throw new Error("object missing");
    const bytes = decryptAttachmentBuffer(encrypted, encryptionEnv);
    return { body: new Response(new Uint8Array(bytes)).body!, size: bytes.length, mimeType: "application/octet-stream" };
  },
  async removeStoredAttachmentFiles(refs: Array<string | StoredAttachmentRef>, options: { signal?: AbortSignal } = {}) {
    options.signal?.throwIfAborted();
    for (const ref of refs) {
      const key = keyOf(ref);
      if (key === harness.failDeleteKey) throw new Error("storage delete failed");
      harness.deletes.push(key);
      harness.objects.delete(key);
    }
  },
};

const stateKey = Symbol.for("staff-chat-chunk-storage-test-state");
Reflect.set(globalThis, stateKey, harness);
after(() => Reflect.deleteProperty(globalThis, stateKey));
const moduleUrl = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const mocks = moduleUrl(`
  const state = globalThis[Symbol.for("staff-chat-chunk-storage-test-state")];
  export const persistAttachmentFiles = (...args) => state.persistAttachmentFiles(...args);
  export const readStoredAttachmentFile = (...args) => state.readStoredAttachmentFile(...args);
  export const removeStoredAttachmentFiles = (...args) => state.removeStoredAttachmentFiles(...args);
`);
const source = readFileSync(new URL("../src/lib/staff-chat-chunk-storage.ts", import.meta.url), "utf8")
  .replaceAll('"@/lib/attachment-storage"', JSON.stringify(mocks));
const service: typeof import("../src/lib/staff-chat-chunk-storage.ts") = await import(moduleUrl(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText));

beforeEach(() => {
  harness.objects.clear(); harness.generated.clear();
  harness.writes.length = 0; harness.reads.length = 0; harness.deletes.length = 0;
  harness.ambiguousWrite = false; harness.failWrite = false; harness.failRead = false; harness.failDeleteKey = "";
});

async function storedFile(bytes = Buffer.from("ZIP contents")) {
  const part = await service.writeStaffChatChunk(uploadId, 0, provider, bytes, digest(bytes));
  const ref = await service.writeStaffChatManifest(uploadId, provider, [part], bytes.length);
  return { bytes, part, ref };
}

describe("staff chat encrypted chunk storage", () => {
  test("uses the encrypted attachment writer for both parts and manifests and preserves legacy reads", async () => {
    const { bytes, part, ref } = await storedFile();
    assert.equal(isEncryptedAttachmentBuffer(harness.objects.get(part.storageKey)!), true);
    assert.equal(isEncryptedAttachmentBuffer(harness.objects.get(ref.storageKey)!), true);
    const file = await service.readStaffChatStoredFile(ref);
    assert.equal(file.size, bytes.length);
    assert.equal(file.mimeType, "application/zip");
    assert.deepEqual(Buffer.from(await new Response(file.body).arrayBuffer()), bytes);
    const legacy = { storageKey: "staff-chat/old-file.txt", storageProvider: "local" };
    harness.objects.set(legacy.storageKey, bytes);
    const oldFile = await service.readStaffChatStoredFile(legacy);
    assert.deepEqual(Buffer.from(await new Response(oldFile.body).arrayBuffer()), bytes);
    await service.removeStoredStaffChatFiles([legacy]);
    assert.deepEqual(harness.deletes, [legacy.storageKey]);
  });

  test("recovers duplicate and ambiguous writes only when the existing plaintext matches exactly", async () => {
    const bytes = Buffer.from("same bytes");
    harness.ambiguousWrite = true;
    const first = await service.writeStaffChatChunk(uploadId, 0, provider, bytes, digest(bytes));
    harness.ambiguousWrite = false;
    assert.deepEqual(await service.writeStaffChatChunk(uploadId, 0, provider, bytes, digest(bytes)), first);
    const changed = Buffer.from("new bytes!");
    await assert.rejects(service.writeStaffChatChunk(uploadId, 0, provider, changed, digest(changed)), /already exists/);
    harness.ambiguousWrite = true;
    const manifest = await service.writeStaffChatManifest(uploadId, provider, [first], bytes.length);
    harness.ambiguousWrite = false;
    assert.deepEqual(await service.writeStaffChatManifest(uploadId, provider, [first], bytes.length), manifest);
    harness.failRead = true;
    await assert.rejects(service.writeStaffChatChunk(uploadId, 0, provider, bytes, digest(bytes)), /already exists/);
  });

  test("rejects corrupted digests, oversized chunks, traversal, invalid providers and out-of-range indices before writing", async () => {
    const bytes = Buffer.from("contents");
    await assert.rejects(service.writeStaffChatChunk(uploadId, 0, provider, bytes, "0".repeat(64)), /contents/);
    await assert.rejects(service.writeStaffChatChunk(uploadId, 0, provider, Buffer.alloc(0), digest(Buffer.alloc(0))), /contents/);
    const oversized = Buffer.alloc(staffChatChunkSize + 1);
    await assert.rejects(service.writeStaffChatChunk(uploadId, 0, provider, oversized, digest(oversized)), /contents/);
    for (const id of ["../outside", `${uploadId}/../other`, "not-a-uuid"]) {
      assert.throws(() => service.getStaffChatChunkRef(id, 0, provider), /identifier/);
    }
    for (const index of [-1, 25, 0.5, Number.NaN]) assert.throws(() => service.getStaffChatChunkRef(uploadId, index, provider), /index/);
    assert.throws(() => service.getStaffChatChunkRef(uploadId, 0, "unknown" as typeof provider), /provider/);
    assert.deepEqual(harness.writes, []);
  });

  test("streams the full 100 MiB boundary lazily, reading and verifying only one chunk at a time", async () => {
    const bytes = Buffer.alloc(staffChatChunkSize, 43);
    const expectedDigest = digest(bytes);
    const parts: StaffChatStoredPart[] = [];
    for (let index = 0; index < 25; index++) {
      const ref = service.getStaffChatChunkRef(uploadId, index, provider);
      parts.push({ storageKey: ref.storageKey, storageProvider: provider, size: bytes.length, digest: expectedDigest });
      harness.generated.set(ref.storageKey, () => ({
        body: new Response(new Uint8Array(bytes)).body!, size: bytes.length,
      }));
    }
    const manifest = await service.writeStaffChatManifest(uploadId, provider, parts, staffChatZipMaxBytes);
    const file = await service.readStaffChatStoredFile(manifest);
    assert.equal(file.size, staffChatZipMaxBytes);
    assert.deepEqual(harness.reads, [manifest.storageKey], "reading a manifest must not preload file chunks");
    const reader = file.body.getReader();
    let total = 0;
    for (let index = 0; index < parts.length; index++) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      assert.equal(chunk.value!.byteLength, staffChatChunkSize);
      assert.equal(digest(Buffer.from(chunk.value!)), expectedDigest);
      total += chunk.value!.byteLength;
      assert.equal(harness.reads.length, index + 2, "only the requested chunk should be read");
    }
    assert.equal((await reader.read()).done, true);
    assert.equal(total, staffChatZipMaxBytes);
    reader.releaseLock();
    await assert.rejects(service.writeStaffChatManifest(uploadId, provider, parts, staffChatZipMaxBytes + 1), /manifest/);
  });

  test("stops fetching chunks when a consumer cancels a download", async () => {
    const firstBytes = Buffer.alloc(staffChatChunkSize, 1);
    const first = await service.writeStaffChatChunk(uploadId, 0, provider, firstBytes, digest(firstBytes));
    const lastBytes = Buffer.from("last part");
    const last = await service.writeStaffChatChunk(uploadId, 1, provider, lastBytes, digest(lastBytes));
    const ref = await service.writeStaffChatManifest(uploadId, provider, [first, last], firstBytes.length + lastBytes.length);
    const file = await service.readStaffChatStoredFile(ref);
    const reader = file.body.getReader();
    await reader.read();
    await reader.cancel();
    assert.deepEqual(harness.reads, [ref.storageKey, first.storageKey]);
  });

  test("rejects missing, truncated or tampered stored chunks without releasing unverified bytes", async () => {
    for (const failure of ["missing", "truncated", "tampered", "lying-size"]) {
      harness.objects.clear(); harness.generated.clear();
      const { bytes, part, ref } = await storedFile();
      if (failure === "missing") harness.objects.delete(part.storageKey);
      else if (failure === "lying-size") harness.generated.set(part.storageKey, () => ({
        body: new Response(new Uint8Array(Buffer.concat([bytes, Buffer.from("extra")]))).body!, size: bytes.length,
      }));
      else harness.objects.set(part.storageKey, encryptAttachmentBuffer(
        failure === "truncated" ? bytes.subarray(1) : Buffer.alloc(bytes.length, 8), encryptionEnv,
      ));
      const file = await service.readStaffChatStoredFile(ref);
      await assert.rejects(file.body.getReader().read(), /missing|integrity|expected size/);
    }
  });

  test("validates manifest shape and forbids references to other uploads or providers", async () => {
    const { part, ref, bytes } = await storedFile();
    const badManifests = [
      { version: 2, size: bytes.length, parts: [part] },
      { version: 1, size: staffChatZipMaxBytes + 1, parts: [part] },
      { version: 1, size: bytes.length, parts: [] },
      { version: 1, size: bytes.length, parts: [{ ...part, storageKey: `staff-chat-chunks/${otherUploadId}/0.part` }] },
      { version: 1, size: bytes.length, parts: [{ ...part, storageProvider: "local" }] },
      { version: 1, size: bytes.length, parts: [{ ...part, size: bytes.length + 1 }] },
      { version: 1, size: bytes.length, parts: [{ ...part, digest: "invalid" }] },
      { version: 1, size: bytes.length, parts: [{ ...part, storageKey: ref.storageKey }] },
    ];
    for (const value of badManifests) {
      harness.objects.set(ref.storageKey, Buffer.from(JSON.stringify(value)));
      await assert.rejects(service.readStaffChatStoredFile(ref), /manifest/);
    }
    harness.objects.set(ref.storageKey, Buffer.alloc(16 * 1024 + 1));
    await assert.rejects(service.readStaffChatStoredFile(ref), /expected size/);
    await assert.rejects(service.readStaffChatStoredFile({ ...ref, storageKey: "staff-chat-manifests/../../outside.json" }), /identifier/);
    await assert.rejects(service.removeStoredStaffChatFiles([{ ...ref, storageKey: "staff-chat-manifests/invalid.txt" }]), /manifest key/);
  });

  test("retains the manifest after a partial delete, and cleanup can safely repeat after all objects are gone", async () => {
    const { part, ref } = await storedFile();
    const failedKey = service.getStaffChatChunkRef(uploadId, 4, provider).storageKey;
    harness.failDeleteKey = failedKey;
    await assert.rejects(service.removeStoredStaffChatFiles([ref]), /delete failed/);
    assert.equal(harness.objects.has(part.storageKey), false);
    assert.equal(harness.objects.has(ref.storageKey), true);
    assert.equal(harness.deletes.includes(ref.storageKey), false);
    harness.failDeleteKey = "";
    await service.removeStoredStaffChatFiles([ref]);
    assert.equal(harness.deletes.at(-1), ref.storageKey);
    assert.equal(harness.objects.size, 0);
    harness.reads.length = 0;
    await service.removeStoredStaffChatFiles([ref]);
    assert.deepEqual(harness.reads, [], "cleanup cannot depend on an already deleted manifest");
    assert.equal(harness.deletes.at(-1), ref.storageKey);
  });

  test("cleans abandoned uploads without a manifest and respects aborted cleanup", async () => {
    const bytes = Buffer.from("partial upload");
    const part = await service.writeStaffChatChunk(uploadId, 7, provider, bytes, digest(bytes));
    await assert.rejects(service.removeStaffChatChunkUpload(uploadId, provider, { signal: AbortSignal.abort() }), { name: "AbortError" });
    assert.equal(harness.objects.has(part.storageKey), true);
    await service.removeStaffChatChunkUpload(uploadId, provider);
    assert.equal(harness.objects.size, 0);
    assert.equal(harness.deletes.length, 26);
    assert.equal(harness.deletes.at(-1), `staff-chat-manifests/${uploadId}.json`);
  });
});
