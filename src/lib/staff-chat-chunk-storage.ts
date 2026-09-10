import "server-only";

import { createHash } from "node:crypto";
import {
  persistAttachmentFiles, readStoredAttachmentFile, removeStoredAttachmentFiles,
  type StoredAttachmentFile, type StoredAttachmentRef,
} from "@/lib/attachment-storage";
import { attachmentStorageProviders, type AttachmentStorageProvider } from "@/lib/attachment-storage-core";
import { staffChatChunkSize, staffChatZipMaxBytes } from "@/lib/staff-chat-file-limits";

export type StaffChatStoredPart = {
  storageKey: string;
  storageProvider: AttachmentStorageProvider;
  size: number;
  digest: string;
};

type Manifest = { version: 1; size: number; parts: StaffChatStoredPart[] };
type RemovalOptions = { signal?: AbortSignal };
const manifestPrefix = "staff-chat-manifests/";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digestPattern = /^[a-f0-9]{64}$/;
const maxPartCount = Math.ceil(staffChatZipMaxBytes / staffChatChunkSize);
const maxManifestBytes = 16 * 1024;

function assertUploadId(uploadId: string): void {
  if (typeof uploadId !== "string" || !uuidPattern.test(uploadId)) throw new Error("Invalid chat upload identifier");
}

function assertProvider(provider: unknown): asserts provider is AttachmentStorageProvider {
  if (!attachmentStorageProviders.some((value) => value === provider)) throw new Error("Invalid chat upload storage provider");
}

export function getStaffChatChunkRef(uploadId: string, index: number, provider: AttachmentStorageProvider): Pick<StaffChatStoredPart, "storageKey" | "storageProvider"> {
  assertUploadId(uploadId);
  assertProvider(provider);
  if (!Number.isInteger(index) || index < 0 || index >= maxPartCount) throw new Error("Invalid chat upload part index");
  return { storageKey: `staff-chat-chunks/${uploadId}/${index}.part`, storageProvider: provider };
}

function getManifestRef(uploadId: string, provider: AttachmentStorageProvider): Required<StoredAttachmentRef> {
  assertUploadId(uploadId);
  assertProvider(provider);
  return { storageKey: `${manifestPrefix}${uploadId}.json`, storageProvider: provider };
}

function digestBytes(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

// All writes use the existing attachment writer, which applies the configured
// AES-GCM encryption before bytes leave the app. A timed-out write may already
// have succeeded, so verify its stored plaintext before treating it as failed.
async function writeVerified(ref: Required<StoredAttachmentRef>, buffer: Buffer, mimeType: string): Promise<void> {
  assertProvider(ref.storageProvider);
  try {
    await persistAttachmentFiles([{
      ...ref, storageProvider: ref.storageProvider,
      originalName: ref.storageKey.split("/").at(-1)!,
      mimeType, size: buffer.byteLength, buffer,
    }]);
  } catch (writeError) {
    try {
      const stored = await readStoredAttachmentFile(ref);
      const actual = await readBoundedBytes(stored, buffer.byteLength);
      if (actual.equals(buffer)) return;
    } catch { /* Preserve the original storage failure if recovery is impossible. */ }
    throw writeError;
  }
}

export async function writeStaffChatChunk(
  uploadId: string, index: number, provider: AttachmentStorageProvider, buffer: Buffer, digest: string,
): Promise<StaffChatStoredPart> {
  const ref = getStaffChatChunkRef(uploadId, index, provider);
  if (buffer.byteLength <= 0 || buffer.byteLength > staffChatChunkSize
    || !digestPattern.test(digest) || digestBytes(buffer) !== digest) {
    throw new Error("Invalid chat upload part contents");
  }
  await writeVerified(ref, buffer, "application/octet-stream");
  return { storageKey: ref.storageKey, storageProvider: provider, size: buffer.byteLength, digest };
}

function validateManifest(value: unknown, uploadId: string, provider: AttachmentStorageProvider): Manifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid chat file manifest");
  const data = value as Partial<Manifest>;
  if (data.version !== 1 || !Number.isSafeInteger(data.size) || !data.size || data.size < 0 || data.size > staffChatZipMaxBytes
    || !Array.isArray(data.parts) || data.parts.length !== Math.ceil(data.size / staffChatChunkSize)) {
    throw new Error("Invalid chat file manifest");
  }
  const parts = data.parts.map((part, index): StaffChatStoredPart => {
    const expected = getStaffChatChunkRef(uploadId, index, provider);
    const expectedSize = Math.min(staffChatChunkSize, data.size! - index * staffChatChunkSize);
    if (!part || typeof part !== "object" || part.storageKey !== expected.storageKey
      || part.storageProvider !== provider || part.size !== expectedSize
      || typeof part.digest !== "string" || !digestPattern.test(part.digest)) {
      throw new Error("Invalid chat file manifest part");
    }
    return { storageKey: expected.storageKey, storageProvider: provider, size: expectedSize, digest: part.digest };
  });
  return { version: 1, size: data.size, parts };
}

export async function writeStaffChatManifest(
  uploadId: string, provider: AttachmentStorageProvider, parts: StaffChatStoredPart[], totalSize: number,
): Promise<StoredAttachmentRef> {
  const ref = getManifestRef(uploadId, provider);
  const manifest = validateManifest({ version: 1, size: totalSize, parts }, uploadId, provider);
  const buffer = Buffer.from(JSON.stringify(manifest), "utf8");
  if (buffer.byteLength > maxManifestBytes) throw new Error("Chat file manifest is too large");
  await writeVerified(ref, buffer, "application/json");
  return ref;
}

function manifestUploadId(ref: string | StoredAttachmentRef): string | null {
  const key = typeof ref === "string" ? ref : ref.storageKey;
  if (!key.startsWith(manifestPrefix)) return null;
  const uploadId = key.slice(manifestPrefix.length, -5);
  if (!key.endsWith(".json")) throw new Error("Invalid chat file manifest key");
  assertUploadId(uploadId);
  return uploadId;
}

function providerFor(ref: string | StoredAttachmentRef): AttachmentStorageProvider {
  const provider = typeof ref === "string" ? "local" : ref.storageProvider ?? "local";
  assertProvider(provider);
  return provider;
}

async function readBoundedBytes(file: StoredAttachmentFile, maxBytes: number): Promise<Buffer> {
  if (file.size !== undefined && (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > maxBytes)) {
    await file.body.cancel();
    throw new Error("Chat file exceeds its expected size");
  }
  const reader = file.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Chat file exceeds its expected size");
      }
      chunks.push(Buffer.from(chunk.value));
    }
    if (file.size !== undefined && file.size !== size) throw new Error("Chat file was truncated");
    return Buffer.concat(chunks, size);
  } finally {
    reader.releaseLock();
  }
}

export async function readStaffChatStoredFile(ref: string | StoredAttachmentRef): Promise<StoredAttachmentFile> {
  const uploadId = manifestUploadId(ref);
  if (uploadId === null) return readStoredAttachmentFile(ref);
  const provider = providerFor(ref);
  const stored = await readStoredAttachmentFile(ref);
  const manifest = validateManifest(JSON.parse((await readBoundedBytes(stored, maxManifestBytes)).toString("utf8")), uploadId, provider);
  let nextPart = 0;
  let cancelled = false;
  return {
    size: manifest.size,
    mimeType: "application/zip",
    body: new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (cancelled) return;
        try {
          const part = manifest.parts[nextPart];
          const file = await readStoredAttachmentFile(part);
          const bytes = await readBoundedBytes(file, part.size);
          if (cancelled) return;
          if (bytes.byteLength !== part.size || digestBytes(bytes) !== part.digest) {
            throw new Error("Chat file part failed integrity verification");
          }
          controller.enqueue(new Uint8Array(bytes));
          nextPart++;
          if (nextPart === manifest.parts.length) controller.close();
        } catch (error) {
          if (!cancelled) controller.error(error);
        }
      },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 }),
  };
}

export async function removeStaffChatChunkUpload(
  uploadId: string, provider: AttachmentStorageProvider, options: RemovalOptions = {},
): Promise<void> {
  const manifest = getManifestRef(uploadId, provider);
  const parts = Array.from({ length: maxPartCount }, (_, index) => getStaffChatChunkRef(uploadId, index, provider));
  // Enumerating all deterministic keys also removes an upload interrupted before
  // finalization. Keep the manifest until every part deletion has succeeded.
  await removeStoredAttachmentFiles(parts, options);
  await removeStoredAttachmentFiles([manifest], options);
}

export async function removeStoredStaffChatFiles(
  refs: Array<string | StoredAttachmentRef>, options: RemovalOptions = {},
): Promise<void> {
  for (const ref of refs) {
    const uploadId = manifestUploadId(ref);
    if (uploadId === null) await removeStoredAttachmentFiles([ref], options);
    else await removeStaffChatChunkUpload(uploadId, providerFor(ref), options);
  }
}
