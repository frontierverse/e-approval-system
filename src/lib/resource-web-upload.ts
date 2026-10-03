import { hashResourceFile } from "./resource-file-hash";
import type { ResourceUploadDto, ResourceUploadGrant, ResourceUploadInput } from "./mobile-resources-core";

export type ResourceWebReply<T> = { ok: true; data: T } | { ok: false; error: string; code: string; status: number };
export class ResourceWebUploadError extends Error {
  constructor(message: string, readonly code = "UNKNOWN_RESULT", readonly status = 0) { super(message); }
}
export type ResourceWebUploadPorts = {
  start: (input: ResourceUploadInput) => Promise<ResourceWebReply<ResourceUploadGrant>>;
  status: (input: { id: string } | { requestId: string }) => Promise<ResourceWebReply<{ upload: ResourceUploadDto }>>;
  grant: (id: string) => Promise<ResourceWebReply<ResourceUploadGrant>>;
  complete: (id: string) => Promise<ResourceWebReply<{ upload: ResourceUploadDto; pending: boolean }>>;
  fetch?: typeof fetch;
};
export type ResourceWebUploadAttempt = {
  readonly file: File;
  readonly requestId: string;
  readonly targetResourceId: string | null;
  input?: ResourceUploadInput;
  uploadId?: string;
  startSent?: boolean;
  putSent?: boolean;
  grant?: ResourceUploadGrant["grant"];
};
const failure = () => new ResourceWebUploadError("첨부파일 처리 결과를 확인하지 못했습니다. 같은 파일로 다시 확인하세요.");
function unwrap<T>(reply: ResourceWebReply<T>): T {
  if (!reply || typeof reply !== "object" || typeof reply.ok !== "boolean") throw failure();
  if (!reply.ok) throw new ResourceWebUploadError(reply.error, reply.code, reply.status);
  return reply.data;
}
async function bounded<T>(work: Promise<T>, signal: AbortSignal, milliseconds = 30000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const stop = new Promise<never>((_, reject) => {
      abort = () => reject(new DOMException("파일 처리를 취소했습니다.", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => reject(failure()), milliseconds);
      if (signal.aborted) abort();
    });
    return await Promise.race([work, stop]);
  } finally { clearTimeout(timer); if (abort) signal.removeEventListener("abort", abort); }
}
function check(signal: AbortSignal) { if (signal.aborted) throw new DOMException("파일 처리를 취소했습니다.", "AbortError"); }
function canonicalDate(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function verify(attempt: ResourceWebUploadAttempt, upload: ResourceUploadDto) {
  if (!upload || !/^[A-Za-z0-9_-]{1,128}$/.test(upload.id) || attempt.uploadId && attempt.uploadId !== upload.id || upload.targetResourceId !== attempt.targetResourceId || !["uploading", "finalizing", "ready", "consumed", "deleting", "deleted", "expired"].includes(upload.state)) throw failure();
  if (["deleting", "deleted", "expired"].includes(upload.state)) throw new ResourceWebUploadError("첨부 요청이 만료되었거나 삭제되었습니다. 저장 결과를 먼저 확인해 주세요.", "UPLOAD_EXPIRED", 410);
  const expected = attempt.input, file = upload.file;
  if (!expected || !file || file.name !== expected.name || file.mimeType !== expected.mimeType || file.size !== expected.size || file.wholeSha256 !== expected.wholeSha256) throw failure();
  if (["ready", "consumed"].includes(upload.state) && (!upload.completedAt || !canonicalDate(upload.completedAt))) throw failure();
  attempt.uploadId = upload.id;
  return upload;
}
function verifyGrant(attempt: ResourceWebUploadAttempt, value: ResourceUploadGrant) {
  const upload = verify(attempt, value.upload), grant = value.grant;
  if (upload.state !== "uploading") { if (grant !== null) throw failure(); return value; }
  if (!grant || grant.method !== "PUT" || !grant.headers || Object.keys(grant.headers).length !== 1 || grant.headers["Content-Type"] !== attempt.input?.mimeType || !canonicalDate(grant.expiresAt)) throw failure();
  let url: URL;
  try { url = new URL(grant.url); } catch { throw failure(); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw failure();
  attempt.grant = grant;
  return value;
}

/** Files and logical keys are fixed before the first request. No storage key or
 * app credential is accepted from the form or sent to the signed PUT endpoint. */
export async function prepareResourceWebUpload(attempt: ResourceWebUploadAttempt, ports: ResourceWebUploadPorts, signal: AbortSignal): Promise<string> {
  check(signal);
  if (!attempt.input) {
    const wholeSha256 = await hashResourceFile(attempt.file, { signal });
    check(signal);
    attempt.input = { requestId: attempt.requestId, targetResourceId: attempt.targetResourceId, name: attempt.file.name.split("/").pop()!.replace(/[\\/]/g, "").trim().slice(0, 180) || "attachment", mimeType: attempt.file.type || "application/octet-stream", size: attempt.file.size, wholeSha256 };
  }
  let upload: ResourceUploadDto | undefined;
  if (attempt.startSent) {
    const reply = await bounded(ports.status(attempt.uploadId ? { id: attempt.uploadId } : { requestId: attempt.requestId }), signal);
    check(signal);
    if (reply.ok) upload = verify(attempt, reply.data.upload);
    else if (reply.status !== 404 || reply.code !== "NOT_FOUND") unwrap(reply);
  }
  if (!upload) {
    attempt.startSent = true;
    const reply = await bounded(ports.start(attempt.input), signal);
    check(signal);
    upload = verifyGrant(attempt, unwrap(reply)).upload;
  }
  if (upload.state === "ready" || upload.state === "consumed") return upload.id;
  if (upload.state === "uploading" && !attempt.putSent) {
    if (!attempt.grant || Date.parse(attempt.grant.expiresAt) <= Date.now() + 5000) {
      const reply = await bounded(ports.grant(upload.id), signal);
      check(signal);
      upload = verifyGrant(attempt, unwrap(reply)).upload;
    }
    if (upload.state === "uploading") {
      const grant = attempt.grant;
      if (!grant) throw failure();
      const controller = new AbortController(), abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(abort, 90000);
      try {
        check(signal);
        attempt.putSent = true;
        // An ambiguous response (including an immutable-object conflict) is
        // resolved by server byte/hash verification, never a fresh upload ID.
        await bounded((ports.fetch ?? fetch)(grant.url, { method: "PUT", headers: grant.headers, body: attempt.file, signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" }).then(async response => { await response.body?.cancel().catch(() => undefined); }), controller.signal, 90000);
      } catch { check(signal); }
      finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
      check(signal);
    }
  }
  const reply = await bounded(ports.complete(upload.id), signal, 85000);
  if (!reply.ok && reply.code === "UPLOAD_RETRY") attempt.putSent = false;
  check(signal);
  const completed = unwrap(reply);
  if (!completed || typeof completed.pending !== "boolean") throw failure();
  const actual = verify(attempt, completed.upload);
  if (completed.pending || !["ready", "consumed"].includes(actual.state)) throw new ResourceWebUploadError("파일 검증 중입니다. 같은 요청으로 다시 확인하세요.", "UPLOAD_PENDING", 409);
  return actual.id;
}
