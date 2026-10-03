import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

export const resourceFileMaximumBytes = 300 * 1024 * 1024;
export const resourceFileChunkBytes = 64 * 1024;
export const resourceSignedUploadSeconds = 7200;
const headerSize = 32;
const magic = Buffer.from("ENC1");
const shaPattern = /^[a-f0-9]{64}$/;

export type ResourceStorageRef = { storageProvider: string; storageKey: string };
export type ResourceWriteEvidence = "none" | "unknown";
export type ResourceFileStorageErrorCode = "STORAGE_UNAVAILABLE" | "STORAGE_BUSY" | "STORAGE_TIMEOUT" | "STORAGE_ABORTED" | "UPLOAD_CONFLICT";
const messages: Record<ResourceFileStorageErrorCode, string> = {
  STORAGE_UNAVAILABLE: "파일 저장소를 확인하지 못했습니다. 다시 확인하세요.",
  STORAGE_BUSY: "다른 파일을 처리하는 중입니다. 잠시 후 다시 확인하세요.",
  STORAGE_TIMEOUT: "파일 처리 시간이 초과되었습니다. 같은 파일의 상태를 다시 확인하세요.",
  STORAGE_ABORTED: "파일 처리가 중단되었습니다. 같은 파일의 상태를 다시 확인하세요.",
  UPLOAD_CONFLICT: "파일의 실제 내용이 요청과 일치하지 않습니다. 원래 파일의 상태를 확인하세요.",
};
export class ResourceFileStorageError extends Error {
  readonly code: ResourceFileStorageErrorCode;
  readonly writeEvidence: ResourceWriteEvidence;
  constructor(code: ResourceFileStorageErrorCode, writeEvidence: ResourceWriteEvidence = "none") {
    super(messages[code]);
    this.name = "ResourceFileStorageError";
    this.code = code;
    this.writeEvidence = writeEvidence;
  }
}
export type ResourceRawFile = { body: ReadableStream<Uint8Array>; mimeType?: string };
export type ResourceStorageAdapter = {
  read: (ref: ResourceStorageRef, signal: AbortSignal) => Promise<ResourceRawFile>;
  write: (ref: ResourceStorageRef, body: ReadableStream<Uint8Array>, options: { size: number; mimeType: string; signal: AbortSignal }) => Promise<void>;
  delete: (ref: ResourceStorageRef, signal: AbortSignal) => Promise<void>;
  exists: (ref: ResourceStorageRef, signal: AbortSignal) => Promise<boolean>;
  sign: (ref: ResourceStorageRef, options: { mimeType: string; signal: AbortSignal }) => Promise<{ url: string }>;
};
type SpoolIo = Pick<typeof fs, "mkdtemp" | "open" | "chmod" | "rm" | "unlink" | "statfs" | "readdir" | "lstat">;
export type ResourceFileStorageCoreOptions = {
  adapter: ResourceStorageAdapter;
  getEncryptionKey: () => Buffer | null;
  temporaryRoot?: string;
  timeoutMs?: number;
  diskMarginBytes?: number;
  fileSystem?: Partial<SpoolIo>;
  now?: () => number;
};
export type ResourceVerifiedWrite = {
  size: number;
  wholeSha256: string;
  storedSize: number;
  storedSha256: string;
  reused: boolean;
  writeEvidence: "confirmed";
};
export type ResourceFinalizedWrite = ResourceVerifiedWrite & { encryptionIvBase64: string | null };
type CommonOptions = { signal?: AbortSignal; timeoutMs?: number };
type Spool = { file: FileHandle; size: number; key: Buffer; iv: Buffer; dispose: () => Promise<void> };
type VerifiedSpool = { spool: Spool; size: number; hash: string; storedSize: number; storedHash: string; encrypted: boolean; prefix: Buffer };

// All instances share one process admission, including injected test instances.
let admitted = false;
const activeDirectories = new Set<string>();
export function validateResourceStorageRef(ref: ResourceStorageRef) {
  if (!ref || !["local", "supabase-storage", "vercel-blob"].includes(ref.storageProvider) || typeof ref.storageKey !== "string" || !ref.storageKey || ref.storageKey.length > 2048 || /[\x00-\x1f\x7f\\]/.test(ref.storageKey) || ref.storageKey.startsWith("/") || ref.storageKey.split("/").some(part => !part || part === "." || part === "..") || ref.storageKey.includes("://"))
    throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
}
function sniffPreview(prefix: Buffer) {
  if (prefix.subarray(0, 5).toString("ascii") === "%PDF-") return { mimeType: "application/pdf", previewKind: "pdf" as const };
  if (prefix.length >= 8 && prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mimeType: "image/png", previewKind: "image" as const };
  if (prefix.length >= 3 && prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255) return { mimeType: "image/jpeg", previewKind: "image" as const };
  if (["GIF87a", "GIF89a"].includes(prefix.subarray(0, 6).toString("ascii"))) return { mimeType: "image/gif", previewKind: "image" as const };
  if (prefix.length >= 12 && prefix.subarray(0, 4).toString("ascii") === "RIFF" && prefix.subarray(8, 12).toString("ascii") === "WEBP") return { mimeType: "image/webp", previewKind: "image" as const };
  return { mimeType: "application/octet-stream", previewKind: null };
}
export function resourceSafeMimeType(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(value) ? value : "application/octet-stream";
}
function sizeInput(size: number, allowEmpty = false) {
  if (!Number.isSafeInteger(size) || size < (allowEmpty ? 0 : 1) || size > resourceFileMaximumBytes)
    throw new ResourceFileStorageError("UPLOAD_CONFLICT");
}
function hashInput(hash: string | undefined) {
  if (hash !== undefined && (typeof hash !== "string" || !shaPattern.test(hash))) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
}
function safeError(cause: unknown, evidence: ResourceWriteEvidence = "none") {
  return new ResourceFileStorageError(cause instanceof ResourceFileStorageError ? cause.code : "STORAGE_UNAVAILABLE", evidence === "unknown" ? "unknown" : cause instanceof ResourceFileStorageError ? cause.writeEvidence : "none");
}

export function createResourceFileStorageCore(options: ResourceFileStorageCoreOptions) {
  const io = { ...fs, ...options.fileSystem };
  const root = options.temporaryRoot ?? tmpdir();
  const margin = options.diskMarginBytes ?? 32 * 1024 * 1024;
  const now = options.now ?? Date.now;
  const prefix = `bajaul-resource-spool-${process.pid}-`;

  function operation(input: CommonOptions = {}, admission = true) {
    if (admission && admitted) throw new ResourceFileStorageError("STORAGE_BUSY");
    if (input.signal?.aborted) throw new ResourceFileStorageError("STORAGE_ABORTED");
    if (admission) admitted = true;
    const controller = new AbortController();
    let expired = false, disposed = false;
    const timeout = input.timeoutMs ?? options.timeoutMs ?? 75_000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 800_000) {
      if (admission) admitted = false;
      throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
    }
    const timer = setTimeout(() => { expired = true; controller.abort(); }, timeout);
    const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
    const spools = new Set<Spool>();
    const keys = new Set<Buffer>();
    const abortError = () => new ResourceFileStorageError(expired ? "STORAGE_TIMEOUT" : "STORAGE_ABORTED");
    const check = () => { if (signal.aborted) throw abortError(); };
    async function wait<T>(promise: Promise<T>, late?: (value: T) => void): Promise<T> {
      check();
      return new Promise<T>((resolve, reject) => {
        let settled = false;
        const stop = () => { if (!settled) { settled = true; reject(abortError()); } };
        signal.addEventListener("abort", stop, { once: true });
        promise.then(value => {
          signal.removeEventListener("abort", stop);
          if (settled) { late?.(value); return; }
          settled = true;
          resolve(value);
        }, cause => {
          signal.removeEventListener("abort", stop);
          if (!settled) { settled = true; reject(signal.aborted ? abortError() : cause); }
        });
      });
    }
    function ownedKey(value: Buffer) { const key = Buffer.from(value); keys.add(key); return key; }
    function encryptionKey() {
      try { const value = options.getEncryptionKey(); return value ? ownedKey(value) : null; }
      catch { throw new ResourceFileStorageError("STORAGE_UNAVAILABLE"); }
    }
    async function cleanup() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      controller.abort();
      await Promise.allSettled([...spools].map(spool => spool.dispose()));
      for (const key of keys) key.fill(0);
      if (admission) admitted = false;
    }
    async function sweep() {
      // Open-unlink means ciphertext never survives process termination. This only
      // removes old, closed directory artifacts from this process's namespace.
      const names = await wait(io.readdir(root));
      for (const name of names) {
        if (!name.startsWith(prefix)) continue;
        const candidate = path.join(root, name);
        if (activeDirectories.has(candidate)) continue;
        const stat = await wait(io.lstat(candidate));
        if (!stat.isDirectory() || stat.isSymbolicLink() || now() - stat.mtimeMs < 10 * 60_000) continue;
        await wait(io.rm(candidate, { recursive: true, force: true }));
      }
    }
    async function createSpool(expectedSize: number, key: Buffer, iv: Buffer) {
      check();
      await sweep();
      const disk = await wait(io.statfs(root, { bigint: true }));
      if (disk.bavail * disk.bsize < BigInt(expectedSize + headerSize + margin)) throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
      const directory = await wait(io.mkdtemp(path.join(root, prefix)), late => { void io.rm(late, { recursive: true, force: true }).catch(() => {}); });
      activeDirectories.add(directory);
      let file: FileHandle | undefined;
      try {
        await wait(io.chmod(directory, 0o700));
        const filename = path.join(directory, "cipher");
        file = await wait(io.open(filename, "wx+", 0o600), late => { void late.close().catch(() => {}); });
        // Pin the inode and remove its name before writing any plaintext-derived
        // bytes. Other requests/processes cannot replace it between decrypt passes.
        await wait(io.unlink(filename));
        await wait(io.rm(directory, { recursive: true, force: true }));
        activeDirectories.delete(directory);
        const handle = file;
        let closed = false;
        const spool: Spool = { file: handle, size: 0, key, iv, dispose: async () => {
          if (closed) return;
          closed = true;
          spools.delete(spool);
          await handle.close();
        } };
        spools.add(spool);
        return spool;
      } catch (cause) {
        await file?.close().catch(() => {});
        await io.rm(directory, { recursive: true, force: true }).catch(() => {});
        activeDirectories.delete(directory);
        throw cause;
      }
    }
    async function writeAll(spool: Spool, bytes: Uint8Array, position: number) {
      let offset = 0;
      while (offset < bytes.byteLength) {
        check();
        const result = await wait(spool.file.write(bytes, offset, bytes.byteLength - offset, position + offset));
        if (result.bytesWritten <= 0) throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
        offset += result.bytesWritten;
      }
      spool.size = Math.max(spool.size, position + bytes.byteLength);
    }
    async function* chunks(body: ReadableStream<Uint8Array>) {
      const reader = body.getReader();
      try {
        while (true) {
          const item = await wait(reader.read());
          if (item.done) return;
          if (!(item.value instanceof Uint8Array)) throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
          for (let offset = 0; offset < item.value.byteLength; offset += resourceFileChunkBytes) {
            check();
            yield item.value.subarray(offset, offset + resourceFileChunkBytes);
          }
        }
      } finally {
        void reader.cancel().catch(() => {});
      }
    }
    async function remote(ref: ResourceStorageRef) {
      validateResourceStorageRef(ref);
      return wait(options.adapter.read(ref, signal), late => { void late.body.cancel().catch(() => {}); });
    }
    async function plainSpool(source: AsyncIterable<Uint8Array>, size: number, expectedHash: string | undefined, key: Buffer, iv: Buffer) {
      const spool = await createSpool(size, key, iv);
      const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
      const hash = createHash("sha256");
      let count = 0, position = headerSize;
      await writeAll(spool, Buffer.alloc(headerSize), 0);
      for await (const bytes of source) {
        if (count + bytes.byteLength > size) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
        count += bytes.byteLength;
        hash.update(bytes);
        const encrypted = cipher.update(bytes);
        await writeAll(spool, encrypted, position);
        position += encrypted.byteLength;
      }
      const actualHash = hash.digest("hex");
      if (count !== size || (expectedHash !== undefined && actualHash !== expectedHash)) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
      const tail = cipher.final();
      await writeAll(spool, tail, position);
      const header = Buffer.concat([magic, iv, cipher.getAuthTag()]);
      await writeAll(spool, header, 0);
      await wait(spool.file.sync());
      if ((await wait(spool.file.stat())).size !== size + headerSize) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
      return { spool, size: count, hash: actualHash };
    }
    async function verify(spool: Spool, size: number, expectedHash?: string) {
      const header = Buffer.alloc(headerSize);
      const hr = await wait(spool.file.read(header, 0, headerSize, 0));
      if (hr.bytesRead !== headerSize || !header.subarray(0, 4).equals(magic)) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
      const decipher = createDecipheriv("aes-256-gcm", spool.key, header.subarray(4, 16), { authTagLength: 16 });
      decipher.setAuthTag(header.subarray(16, 32));
      const hash = createHash("sha256"), bytes = Buffer.alloc(resourceFileChunkBytes), prefix = Buffer.alloc(1024);
      let prefixSize = 0;
      let position = headerSize, count = 0;
      while (position < spool.size) {
        const r = await wait(spool.file.read(bytes, 0, Math.min(bytes.byteLength, spool.size - position), position));
        if (!r.bytesRead) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
        const plaintext = decipher.update(bytes.subarray(0, r.bytesRead));
        count += plaintext.byteLength;
        if (count > size) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
        hash.update(plaintext);
        const n = Math.min(plaintext.byteLength, prefix.byteLength - prefixSize);
        prefix.set(plaintext.subarray(0, n), prefixSize); prefixSize += n;
        position += r.bytesRead;
      }
      const tail = decipher.final(); count += tail.byteLength; hash.update(tail);
      const actualHash = hash.digest("hex");
      if (count !== size || (expectedHash !== undefined && actualHash !== expectedHash)) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
      return { hash: actualHash, prefix: Buffer.from(prefix.subarray(0, prefixSize)) };
    }
    async function storedSpool(ref: ResourceStorageRef, size: number, expectedHash?: string, rawPlaintext = false): Promise<VerifiedSpool> {
      const value = await remote(ref);
      const iterator = chunks(value.body)[Symbol.asyncIterator]();
      const first = Buffer.alloc(headerSize);
      let length = 0, remainder: Uint8Array | undefined;
      while (length < headerSize) {
        const next = await iterator.next();
        if (next.done) break;
        const n = Math.min(headerSize - length, next.value.byteLength);
        first.set(next.value.subarray(0, n), length);
        length += n;
        if (n < next.value.byteLength) remainder = next.value.subarray(n);
      }
      const rest = async function* () {
        if (remainder) yield remainder;
        while (true) { const next = await iterator.next(); if (next.done) return; yield next.value; }
      };
      const rawHash = createHash("sha256");
      let rawSize = 0;
      const all = async function* () {
        const prefix = first.subarray(0, length);
        rawHash.update(prefix); rawSize += prefix.byteLength; yield prefix;
        for await (const bytes of rest()) { rawHash.update(bytes); rawSize += bytes.byteLength; yield bytes; }
      };
      try {
        // Preserve existing ENC1 collision semantics: at least 32B+magic is
        // encrypted; a shorter legacy plaintext prefix remains plaintext.
        const encrypted = !rawPlaintext && length === headerSize && first.subarray(0, 4).equals(magic);
        let spool: Spool;
        let verified: Awaited<ReturnType<typeof verify>>;
        if (encrypted) {
          const key = encryptionKey();
          if (!key) throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
          spool = await createSpool(size, key, Buffer.from(first.subarray(4, 16)));
          let position = 0;
          for await (const bytes of all()) {
            if (position + bytes.byteLength > size + headerSize) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
            await writeAll(spool, bytes, position); position += bytes.byteLength;
          }
          if (position !== size + headerSize) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
          verified = await verify(spool, size, expectedHash);
        } else {
          const key = ownedKey(randomBytes(32));
          const result = await plainSpool(all(), size, expectedHash, key, randomBytes(12));
          spool = result.spool;
          verified = await verify(spool, size, expectedHash);
        }
        return { spool, size, hash: verified.hash, storedSize: rawSize, storedHash: rawHash.digest("hex"), encrypted, prefix: verified.prefix };
      } finally {
        void iterator.return?.().catch(() => {});
      }
    }
    function bodyFromSpool(spool: Spool, plain: boolean, expectedSize: number, expectedHash?: string, finish: () => Promise<void> = async () => {}) {
      let position = plain ? headerSize : 0, ended = false;
      const hash = createHash("sha256");
      let count = 0;
      const decipher = plain ? createDecipheriv("aes-256-gcm", spool.key, spool.iv, { authTagLength: 16 }) : null;
      let initialized = false;
      let streamController: ReadableStreamDefaultController<Uint8Array>;
      const complete = async () => { if (ended) return; ended = true; signal.removeEventListener("abort", stop); await finish(); };
      const stop = () => { if (!ended) { streamController.error(abortError()); void complete(); } };
      return new ReadableStream<Uint8Array>({
        start(controller) { streamController = controller; signal.addEventListener("abort", stop, { once: true }); if (signal.aborted) stop(); },
        async pull(controller) {
          if (ended) return;
          try {
            check();
            if (decipher && !initialized) {
              const header = Buffer.alloc(headerSize);
              const h = await wait(spool.file.read(header, 0, headerSize, 0));
              if (h.bytesRead !== headerSize) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
              decipher.setAuthTag(header.subarray(16, 32)); initialized = true;
            }
            if (position < spool.size) {
              const bytes = Buffer.alloc(Math.min(resourceFileChunkBytes, spool.size - position));
              const r = await wait(spool.file.read(bytes, 0, bytes.byteLength, position));
              if (!r.bytesRead) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
              position += r.bytesRead;
              const value = decipher ? decipher.update(bytes.subarray(0, r.bytesRead)) : bytes.subarray(0, r.bytesRead);
              count += value.byteLength; hash.update(value);
              if (count > expectedSize) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
              if (value.byteLength && !ended) controller.enqueue(value);
            } else {
              const tail = decipher?.final() ?? Buffer.alloc(0);
              count += tail.byteLength; hash.update(tail);
              if (count !== expectedSize || (expectedHash !== undefined && hash.digest("hex") !== expectedHash)) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
              if (tail.byteLength) controller.enqueue(tail);
              await complete(); controller.close();
            }
          } catch (cause) {
            if (!ended) controller.error(safeError(cause));
            await complete();
          }
        },
        async cancel() { await complete(); },
      }, { highWaterMark: 0 });
    }
    return { signal, wait, check, encryptionKey, ownedKey, cleanup, plainSpool, storedSpool, verify, chunks, remote, bodyFromSpool };
  }

  async function createResourceStagingGrant(ref: ResourceStorageRef, input: { mimeType: string } & CommonOptions) {
    validateResourceStorageRef(ref);
    const op = operation(input, false);
    try {
      if (ref.storageProvider !== "supabase-storage") throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
      const mimeType = resourceSafeMimeType(input.mimeType);
      const signed = await op.wait(options.adapter.sign(ref, { mimeType, signal: op.signal }));
      return { method: "PUT" as const, url: signed.url, headers: { "Content-Type": mimeType }, expiresAt: new Date(now() + resourceSignedUploadSeconds * 1000).toISOString() };
    } catch (cause) { throw safeError(cause); }
    finally { await op.cleanup(); }
  }

  async function writeResourceStagingFile(ref: ResourceStorageRef, input: { body: ReadableStream<Uint8Array>; size: number; mimeType: string; wholeSha256?: string } & CommonOptions): Promise<ResourceVerifiedWrite> {
    validateResourceStorageRef(ref); sizeInput(input.size); hashInput(input.wholeSha256);
    const op = operation(input);
    let attempted = false;
    try {
      const temp = await op.plainSpool(op.chunks(input.body), input.size, input.wholeSha256, op.ownedKey(randomBytes(32)), randomBytes(12));
      let reused = false;
      const body = op.bodyFromSpool(temp.spool, true, input.size, temp.hash);
      try { attempted = true; await op.wait(options.adapter.write(ref, body, { size: input.size, mimeType: resourceSafeMimeType(input.mimeType), signal: op.signal })); }
      catch (cause) { if (!(cause instanceof ResourceFileStorageError && cause.code === "UPLOAD_CONFLICT")) throw cause; reused = true; }
      finally { void body.cancel().catch(() => {}); }
      await temp.spool.dispose();
      const actual = await op.storedSpool(ref, input.size, temp.hash, true);
      return { size: input.size, wholeSha256: actual.hash, storedSize: actual.storedSize, storedSha256: actual.storedHash, reused, writeEvidence: "confirmed" };
    } catch (cause) { throw safeError(cause, attempted ? "unknown" : "none"); }
    finally { await op.cleanup(); }
  }

  async function finalizeResourceStoredUpload(input: { staging: ResourceStorageRef; final: ResourceStorageRef; size: number; wholeSha256: string; ivBase64?: string | null } & CommonOptions): Promise<ResourceFinalizedWrite> {
    validateResourceStorageRef(input.staging); validateResourceStorageRef(input.final); sizeInput(input.size); hashInput(input.wholeSha256);
    if (typeof input.wholeSha256 !== "string") throw new ResourceFileStorageError("UPLOAD_CONFLICT");
    if (input.staging.storageProvider === input.final.storageProvider && input.staging.storageKey === input.final.storageKey) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
    const op = operation(input);
    let attempted = false;
    try {
      const configuredKey = op.encryptionKey();
      const key = configuredKey ?? op.ownedKey(randomBytes(32));
      if (input.ivBase64 !== undefined && input.ivBase64 !== null && typeof input.ivBase64 !== "string") throw new ResourceFileStorageError("UPLOAD_CONFLICT");
      const iv = input.ivBase64 ? Buffer.from(input.ivBase64, "base64") : randomBytes(12);
      if (iv.byteLength !== 12 || (input.ivBase64 && iv.toString("base64") !== input.ivBase64)) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
      const source = await op.remote(input.staging);
      const temp = await op.plainSpool(op.chunks(source.body), input.size, input.wholeSha256, key, iv);
      let reused = false;
      const storedSize = input.size + (configuredKey ? headerSize : 0);
      const body = op.bodyFromSpool(temp.spool, !configuredKey, storedSize, configuredKey ? undefined : input.wholeSha256);
      try { attempted = true; await op.wait(options.adapter.write(input.final, body, { size: storedSize, mimeType: resourceSafeMimeType(source.mimeType), signal: op.signal })); }
      catch (cause) { if (!(cause instanceof ResourceFileStorageError && cause.code === "UPLOAD_CONFLICT")) throw cause; reused = true; }
      finally { void body.cancel().catch(() => {}); }
      await temp.spool.dispose();
      // PUT2xx/HEAD/client progress are insufficient. Re-read the exact final
      // object after closing the first spool so disk peak is still one file.
      const actual = await op.storedSpool(input.final, input.size, input.wholeSha256, !configuredKey);
      if (!!configuredKey !== actual.encrypted || (configuredKey && !actual.spool.iv.equals(iv))) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
      return { size: input.size, wholeSha256: actual.hash, storedSize: actual.storedSize, storedSha256: actual.storedHash, encryptionIvBase64: configuredKey ? actual.spool.iv.toString("base64") : null, reused, writeEvidence: "confirmed" };
    } catch (cause) { throw safeError(cause, attempted ? "unknown" : "none"); }
    finally { await op.cleanup(); }
  }

  async function readResourceStoredFile(ref: ResourceStorageRef, input: { expectedSize: number; expectedSha256?: string; beforeExpose: () => Promise<void> | void } & CommonOptions) {
    validateResourceStorageRef(ref); sizeInput(input.expectedSize, true); hashInput(input.expectedSha256);
    const op = operation(input);
    let authorizationFailed = false, authorizedError: unknown;
    try {
      const actual = await op.storedSpool(ref, input.expectedSize, input.expectedSha256);
      try { await op.wait(Promise.resolve().then(input.beforeExpose)); }
      catch (cause) { authorizationFailed = true; authorizedError = cause; throw cause; }
      op.check();
      const body = op.bodyFromSpool(actual.spool, true, input.expectedSize, actual.hash, () => op.cleanup());
      return { body, size: input.expectedSize, verifiedSha256: actual.hash, ...sniffPreview(actual.prefix) };
    } catch (cause) {
      await op.cleanup();
      if (authorizationFailed && cause === authorizedError) throw cause;
      throw safeError(cause);
    }
  }
  async function deleteResourceStoredFile(ref: ResourceStorageRef, input: CommonOptions = {}) {
    validateResourceStorageRef(ref); const op = operation(input, false);
    try { await op.wait(options.adapter.delete(ref, op.signal)); }
    catch (cause) { throw safeError(cause); }
    finally { await op.cleanup(); }
  }
  async function resourceStoredFileExists(ref: ResourceStorageRef, input: CommonOptions = {}) {
    validateResourceStorageRef(ref); const op = operation(input, false);
    try { return await op.wait(options.adapter.exists(ref, op.signal)); }
    catch (cause) { throw safeError(cause); }
    finally { await op.cleanup(); }
  }
  return { createResourceStagingGrant, writeResourceStagingFile, finalizeResourceStoredUpload, readResourceStoredFile, deleteResourceStoredFile, resourceStoredFileExists };
}
