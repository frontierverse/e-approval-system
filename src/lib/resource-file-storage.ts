import "server-only";
import { del, get, head, put } from "@vercel/blob";
import { mkdir, open, rm, stat } from "node:fs/promises";
import path from "node:path";
import { getAttachmentEncryptionKey } from "@/lib/attachment-encryption-core";
import { getFirstAttachmentStorageEnvValue, normalizeAttachmentStorageEnvValue } from "@/lib/attachment-storage-core";
import {
  createResourceFileStorageCore,
  ResourceFileStorageError,
  resourceSafeMimeType,
  validateResourceStorageRef,
  type ResourceFileStorageCoreOptions,
  type ResourceStorageAdapter,
  type ResourceStorageRef,
} from "@/lib/resource-file-storage-core";
export * from "@/lib/resource-file-storage-core";

type Env = Record<string, string | undefined>;
export type ResourceFileStorageOptions = Omit<ResourceFileStorageCoreOptions, "adapter" | "getEncryptionKey"> & {
  env?: Env;
  fetch?: typeof fetch;
  adapter?: ResourceStorageAdapter;
  localRoot?: string;
};
const errorByteLimit = 16 * 1024;

async function smallJson(response: Response, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (!response.body) throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
  const reader = response.body.getReader();
  const values: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const value = await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
        const abort = () => reject(new ResourceFileStorageError("STORAGE_ABORTED"));
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) { abort(); return; }
        reader.read().then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
      });
      if (value.done) break;
      size += value.value.byteLength;
      if (size > errorByteLimit) throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
      values.push(value.value);
    }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(values)));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
    return value;
  } catch { throw new ResourceFileStorageError("STORAGE_UNAVAILABLE"); }
  finally { void reader.cancel().catch(() => {}); }
}
function missing(cause: unknown) {
  return !!cause && typeof cause === "object" && "name" in cause && cause.name === "BlobNotFoundError";
}
function existing(cause: unknown) {
  return cause instanceof Error && /already exists/i.test(cause.message);
}

function providerAdapter(options: ResourceFileStorageOptions): ResourceStorageAdapter {
  const env = options.env ?? process.env;
  const fetcher = options.fetch ?? fetch;
  const localRoot = path.resolve(options.localRoot ?? path.join(process.cwd(), "uploads", "attachments"));
  function local(ref: ResourceStorageRef) {
    validateResourceStorageRef(ref);
    if (env.VERCEL) throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
    const value = path.resolve(localRoot, ref.storageKey);
    if (!value.startsWith(`${localRoot}${path.sep}`)) throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
    return value;
  }
  function supabase() {
    const source = getFirstAttachmentStorageEnvValue(env, ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
    const key = normalizeAttachmentStorageEnvValue(env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
    const bucket = normalizeAttachmentStorageEnvValue(env.SUPABASE_STORAGE_BUCKET, "SUPABASE_STORAGE_BUCKET");
    if (!source || !key || !bucket) throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
    let base: URL;
    try { base = new URL(`${source.replace(/\/+$/, "")}/storage/v1/`); }
    catch { throw new ResourceFileStorageError("STORAGE_UNAVAILABLE"); }
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
    return { base, bucket, headers: { apikey: key, Authorization: `Bearer ${key}` } };
  }
  function objectUrl(ref: ResourceStorageRef, route = "object/authenticated") {
    const config = supabase();
    const pathname = `${route}/${encodeURIComponent(config.bucket)}/${ref.storageKey.split("/").map(encodeURIComponent).join("/")}`;
    return { ...config, url: new URL(pathname, config.base).toString() };
  }
  function blobToken() {
    const value = normalizeAttachmentStorageEnvValue(env.BLOB_READ_WRITE_TOKEN, "BLOB_READ_WRITE_TOKEN");
    if (!value) throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
    return value;
  }
  async function responseFailure(response: Response, signal: AbortSignal, conflict = false): Promise<never> {
    if (conflict && response.status === 409) { void response.body?.cancel().catch(() => {}); throw new ResourceFileStorageError("UPLOAD_CONFLICT"); }
    if (conflict && response.status === 400) {
      const value = await smallJson(response, signal);
      if (value.error === "Duplicate" || value.error === "AlreadyExists" || (typeof value.message === "string" && /already exists/i.test(value.message))) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
    } else { void response.body?.cancel().catch(() => {}); }
    throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
  }
  return {
    async read(ref, signal) {
      validateResourceStorageRef(ref);
      if (ref.storageProvider === "supabase-storage") {
        const config = objectUrl(ref);
        const response = await fetcher(config.url, { headers: { ...config.headers, "Accept-Encoding": "identity" }, signal, cache: "no-store" });
        if (!response.ok || !response.body) await responseFailure(response, signal);
        return { body: response.body!, mimeType: response.headers.get("Content-Type") ?? undefined };
      }
      if (ref.storageProvider === "vercel-blob") {
        const value = await get(ref.storageKey, { access: "private", token: blobToken(), abortSignal: signal, useCache: false });
        if (!value || value.statusCode !== 200 || !value.stream) throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
        return { body: value.stream, mimeType: value.blob.contentType };
      }
      const file = await open(local(ref), "r");
      let closed = false;
      const close = async () => { if (!closed) { closed = true; await file.close(); } };
      return { body: new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            signal.throwIfAborted();
            const bytes = Buffer.alloc(64 * 1024);
            const value = await file.read(bytes, 0, bytes.byteLength, null);
            if (!value.bytesRead) { await close(); controller.close(); }
            else if (!closed) controller.enqueue(bytes.subarray(0, value.bytesRead));
          } catch { await close(); controller.error(new ResourceFileStorageError("STORAGE_UNAVAILABLE")); }
        },
        cancel: close,
      }, { highWaterMark: 0 }) };
    },
    async write(ref, body, input) {
      validateResourceStorageRef(ref);
      if (ref.storageProvider === "supabase-storage") {
        const config = objectUrl(ref, "object");
        const request: RequestInit & { duplex: "half" } = { method: "POST", headers: { ...config.headers, "Content-Type": resourceSafeMimeType(input.mimeType), "Content-Length": String(input.size), "x-upsert": "false" }, body, duplex: "half", signal: input.signal, cache: "no-store" };
        const response = await fetcher(config.url, request);
        if (!response.ok) await responseFailure(response, input.signal, true);
        void response.body?.cancel().catch(() => {});
        return;
      }
      if (ref.storageProvider === "vercel-blob") {
        try {
          await put(ref.storageKey, body, { access: "private", token: blobToken(), abortSignal: input.signal, addRandomSuffix: false, allowOverwrite: false, contentType: resourceSafeMimeType(input.mimeType) });
        } catch (cause) {
          if (existing(cause)) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
          throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
        }
        return;
      }
      const filename = local(ref);
      await mkdir(path.dirname(filename), { recursive: true });
      let file;
      try { file = await open(filename, "wx", 0o600); }
      catch (cause) { if (cause && typeof cause === "object" && "code" in cause && cause.code === "EEXIST") throw new ResourceFileStorageError("UPLOAD_CONFLICT"); throw cause; }
      const reader = body.getReader();
      let succeeded = false;
      try {
        let count = 0;
        while (true) {
          input.signal.throwIfAborted();
          const value = await reader.read();
          if (value.done) break;
          count += value.value.byteLength;
          if (count > input.size) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
          let offset = 0;
          while (offset < value.value.byteLength) { const r = await file.write(value.value, offset, value.value.byteLength - offset); if (!r.bytesWritten) throw new ResourceFileStorageError("STORAGE_UNAVAILABLE"); offset += r.bytesWritten; }
        }
        if (count !== input.size) throw new ResourceFileStorageError("UPLOAD_CONFLICT");
        await file.sync(); succeeded = true;
      } finally {
        void reader.cancel().catch(() => {});
        await file.close();
        if (!succeeded) await rm(filename, { force: true });
      }
    },
    async delete(ref, signal) {
      validateResourceStorageRef(ref);
      if (ref.storageProvider === "supabase-storage") {
        const config = supabase();
        const response = await fetcher(new URL(`object/${encodeURIComponent(config.bucket)}`, config.base), { method: "DELETE", headers: { ...config.headers, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [ref.storageKey] }), signal, cache: "no-store" });
        if (!response.ok) await responseFailure(response, signal);
        void response.body?.cancel().catch(() => {});
      } else if (ref.storageProvider === "vercel-blob") { await del(ref.storageKey, { token: blobToken(), abortSignal: signal }); }
      else { signal.throwIfAborted(); await rm(local(ref), { force: true }); }
    },
    async exists(ref, signal) {
      validateResourceStorageRef(ref);
      if (ref.storageProvider === "supabase-storage") {
        const config = objectUrl(ref);
        const response = await fetcher(config.url, { method: "HEAD", headers: config.headers, signal, cache: "no-store" });
        if (response.status === 404) return false;
        if (!response.ok) await responseFailure(response, signal);
        return true;
      }
      if (ref.storageProvider === "vercel-blob") {
        try { await head(ref.storageKey, { token: blobToken(), abortSignal: signal }); return true; }
        catch (cause) { if (missing(cause)) return false; throw cause; }
      }
      try { signal.throwIfAborted(); await stat(local(ref)); return true; }
      catch (cause) { if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT") return false; throw cause; }
    },
    async sign(ref, input) {
      validateResourceStorageRef(ref);
      if (ref.storageProvider !== "supabase-storage") throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
      const config = objectUrl(ref, "object/upload/sign");
      const response = await fetcher(config.url, { method: "POST", headers: { ...config.headers, "Content-Type": "application/json", "x-upsert": "false" }, body: "{}", signal: input.signal, cache: "no-store" });
      if (!response.ok) await responseFailure(response, input.signal);
      const value = await smallJson(response, input.signal);
      if (typeof value.url !== "string") throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
      let url: URL;
      try { url = new URL(value.url.startsWith("/") ? `${config.base.toString().replace(/\/$/, "")}${value.url}` : value.url); }
      catch { throw new ResourceFileStorageError("STORAGE_UNAVAILABLE"); }
      const expected = new URL(config.url);
      if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password || url.hash || url.searchParams.size !== 1 || url.searchParams.getAll("token").length !== 1 || !url.searchParams.get("token")) throw new ResourceFileStorageError("STORAGE_UNAVAILABLE");
      return { url: url.toString() };
    },
  };
}
export function createResourceFileStorage(options: ResourceFileStorageOptions = {}) {
  const env = options.env ?? process.env;
  return createResourceFileStorageCore({ ...options, adapter: options.adapter ?? providerAdapter(options), getEncryptionKey: () => getAttachmentEncryptionKey(env) });
}
const resourceStorage = createResourceFileStorage();
export const createResourceStagingGrant = resourceStorage.createResourceStagingGrant;
export const writeResourceStagingFile = resourceStorage.writeResourceStagingFile;
export const finalizeResourceStoredUpload = resourceStorage.finalizeResourceStoredUpload;
export const reencryptResourceStoredFile = resourceStorage.reencryptResourceStoredFile;
export const readResourceStoredFile = resourceStorage.readResourceStoredFile;
export const deleteResourceStoredFile = resourceStorage.deleteResourceStoredFile;
export const resourceStoredFileExists = resourceStorage.resourceStoredFileExists;
