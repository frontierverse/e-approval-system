import { ApiError, apiUrl } from "./api";
import { attachmentDownloadInfo, attachmentFileSize, isAttachmentTransferCancellation, safeAttachmentFilename } from "./attachment-file";
import { isChatAttachment, isChatFilePolicy, isChatId, isChatMessage, isChatReceiptStatus, isChatUploadStatus } from "./chat";
import type { ChatAttachment, ChatFilePolicy, ChatMessage, ChatReceiptStatus, ChatUploadStatus } from "./types";

export const CHAT_CHUNK_BYTES = 4 * 1024 * 1024;
export const CHAT_ZIP_BYTES = 100 * 1024 * 1024;
export const chatFileSize = attachmentFileSize;
export type SelectedChatFile = Readonly<{ name: string; size: number; release(): void }>;
export type ChatFileScope = { token: string; isCurrent?: () => boolean; signal?: AbortSignal; onProgress?: (fraction: number | null) => void };
export type ChatFilePickOptions = ChatFileScope & { policy: ChatFilePolicy };
export type ChatFileUploadOptions = ChatFileScope & { file: SelectedChatFile; actorId: string; peerId: string; body: string; requestId: string };
export type ChatFileTransferOptions = ChatFileScope & { attachment: ChatAttachment; actorId: string; peerId: string; messageId: string; requestId: string; isSender: boolean };
export type ChatFileExportResult = { kind: "saved" | "handoff"; requiresConfirmation: boolean; message: string };
export type ChatFilePreview = { uri: string; mimeType: string; kind: "pdf" | "image"; release(): void };
export type ChatFileTransfer = {
  download(): Promise<boolean>;
  save(): Promise<ChatFileExportResult | null>;
  share(): Promise<ChatFileExportResult | null>;
  status(): Promise<ChatReceiptStatus>;
  complete(options?: { confirmedSaved?: true }): Promise<{ message: ChatMessage }>;
  isReady(): boolean;
  getState(): { ready: boolean; exported: boolean; requiresConfirmation: boolean; completionPending: boolean; completed: boolean };
  cancel(): void;
  release(): void;
};
export type ChatFileInfo = { name: string; mimeType: string; size: number; receiptToken: string | null };
export type ChatFileCall = {
  token: string;
  signal: AbortSignal;
  check(): void;
  onProgress(fraction: number | null): void;
  onCancel(cancel: () => void): () => void;
};
export type ChatFileAdapter<F, P> = {
  pick(options: ChatFilePickOptions, call: ChatFileCall): Promise<{ file: F; name: string; size: number; mimeType: string } | null>;
  size(file: F): number;
  head(file: F): Promise<Uint8Array>;
  part(file: F, offset: number, size: number, call: ChatFileCall): Promise<{ file: P; digest: string; release(): void }>;
  multipart(file: F, input: { peerId: string; body: string; requestId: string; name: string; mimeType: string }, call: ChatFileCall): Promise<unknown>;
  putPart(file: P, path: string, call: ChatFileCall): Promise<unknown>;
  download(path: string, body: { requestId: string } | null, expectedSize: number, recipient: boolean, call: ChatFileCall): Promise<{ file: F; info: ChatFileInfo }>;
  export(file: F, info: ChatFileInfo, action: "save" | "share", call: ChatFileCall): Promise<{ kind: "saved" | "handoff"; message: string } | null>;
  preview(file: F, mimeType: string): { uri: string; release(): void };
  release(file: F): void;
  // Capture only directories/resources that exist at invocation. A late cleanup
  // must never remove files created after a new account has become active.
  clear(): Promise<void>;
};

export function chatFileAbortError() { const error = new Error("파일 작업을 취소했습니다."); error.name = "AbortError"; return error; }
export const isChatFileCancellation = isAttachmentTransferCancellation;
export function chatFileFailure(status: number, data?: unknown): never {
  const value = data && typeof data === "object" ? data as Record<string, unknown> : null;
  throw new ApiError(typeof value?.error === "string" ? value.error : status === 401 ? "로그인이 만료되었습니다. 다시 로그인하세요." : "파일 요청을 처리하지 못했습니다. 다시 확인하세요.", status, undefined, typeof value?.code === "string" ? value.code : undefined);
}
export function chatFileJsonResponse(status: number, data: unknown) {
  if (status < 200 || status >= 300) chatFileFailure(status, data);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ApiError("파일 요청 결과를 확인하지 못했습니다. 같은 요청의 결과를 다시 확인하세요.", status);
  return data;
}
// Bound network and response-body work, but never put an OS chooser on a
// timer. Timeouts are uncertain outcomes and keep the original request/lease.
export async function chatFileRequest<T>(parent: ChatFileCall, work: (call: ChatFileCall) => Promise<T>, timeoutMs = 120_000): Promise<T> {
  parent.check();
  const controller = new AbortController(); let deadline = false;
  let rejectStopped!: (cause: Error) => void;
  const stopped = new Promise<never>((_resolve, reject) => { rejectStopped = reject; });
  const timeout = setTimeout(() => { deadline = true; controller.abort(); rejectStopped(new ApiError("파일 요청 시간이 초과되었습니다. 같은 요청의 결과를 다시 확인하세요.", 0)); }, timeoutMs);
  const off = parent.onCancel(() => { clearTimeout(timeout); controller.abort(); rejectStopped(chatFileAbortError()); });
  const call: ChatFileCall = { ...parent, signal: controller.signal, check() { parent.check(); if (deadline) throw new ApiError("파일 요청 시간이 초과되었습니다. 같은 요청의 결과를 다시 확인하세요.", 0); if (controller.signal.aborted) throw chatFileAbortError(); }, onCancel(cancel) { controller.signal.addEventListener("abort", cancel, { once: true }); if (controller.signal.aborted) cancel(); return () => controller.signal.removeEventListener("abort", cancel); } };
  try { return await Promise.race([work(call), stopped]); }
  finally { clearTimeout(timeout); off(); call.token = ""; }
}

export function chatFileHeader(headers: Record<string, unknown>, key: string) {
  const value = Object.entries(headers).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
  return typeof value === "string" ? value : "";
}
const requestKey = (key: string) => /^[A-Za-z0-9_-]{8,128}$/.test(key);
export function chatFileDownloadInfo(headers: Record<string, unknown>, expectedSize: number, recipient: boolean): ChatFileInfo {
  const info = attachmentDownloadInfo(headers, "chat-file");
  const length = chatFileHeader(headers, "content-length");
  if (length && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) !== expectedSize)) throw new ApiError("파일 크기가 일치하지 않습니다. 수신 완료를 처리하지 않았습니다.", 0);
  const token = chatFileHeader(headers, "x-chat-download-token");
  if (recipient && !requestKey(token) || !recipient && !!token) throw new ApiError("파일 수신 정보를 확인하지 못했습니다. 수신 완료를 처리하지 않았습니다.", 0);
  return { ...info, size: expectedSize, receiptToken: recipient ? token : null };
}
export function validateChatPickedFile(name: string, size: number, policy: ChatFilePolicy) {
  if (!isChatFilePolicy(policy)) throw new ApiError("파일 정책을 다시 확인하세요.", 0);
  const safe = safeAttachmentFilename(name);
  const extension = safe.slice(safe.lastIndexOf(".")).toLowerCase();
  if (!safe.includes(".") || !policy.allowedExtensions.includes(extension)) throw new ApiError("허용되지 않는 파일 형식입니다.", 415);
  const limit = extension === ".zip" ? policy.zipMaxFileSize : policy.maxFileSize;
  if (!Number.isSafeInteger(size) || size <= 0 || size > limit) throw new ApiError("허용된 파일 크기를 확인하세요. 일반 파일은 최대 4MB, ZIP은 최대 100MB입니다.", 413);
  return safe;
}
export function chatPreviewMime(bytes: Uint8Array, mimeType: string): "pdf" | "image" {
  const ascii = (offset: number, text: string) => [...text].every((letter, index) => bytes[offset + index] === letter.charCodeAt(0));
  const valid = mimeType === "application/pdf" ? ascii(0, "%PDF-") : mimeType === "image/png" ? [137,80,78,71,13,10,26,10].every((byte,index) => bytes[index] === byte) : mimeType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : mimeType === "image/gif" ? ascii(0,"GIF87a") || ascii(0,"GIF89a") : mimeType === "image/webp" ? ascii(0,"RIFF") && ascii(8,"WEBP") : false;
  if (!valid) throw new ApiError("이 파일은 안전한 미리보기를 지원하지 않습니다. 파일 저장을 이용하세요.", 415);
  return mimeType === "application/pdf" ? "pdf" : "image";
}

export function createChatFileApi<F, P>(adapter: ChatFileAdapter<F, P>) {
  let generation = 0;
  const active = new Set<() => void>();
  const owned = new Set<F>();
  const previews = new Set<() => void>();
  const selections = new WeakMap<SelectedChatFile, Selection>();
  const selectedEntries = new Set<Selection>();
  const transfers = new Set<() => void>();
  const shareTimers = new Set<ReturnType<typeof setTimeout>>();
  const transferRegistry = new Map<string, { token: string; handle: ChatFileTransfer; update: (options: ChatFileTransferOptions) => void }>();
  const previewRegistry = new Map<string, { token: string; peerId: string; attachment: ChatAttachment }>();
  type Attempt = { actorId: string; peerId: string; body: string; requestId: string; uncertain: boolean; digests?: string[]; uploadId?: string };
  type Selection = { file: F; name: string; size: number; mimeType: string; token: string; generation: number; busy: boolean; released: boolean; attempt?: Attempt };
  function remove(file: F) { owned.delete(file); adapter.release(file); }
  function own(file: F) { owned.add(file); return file; }
  function operation(options: ChatFileScope) {
    const epoch = generation, controller = new AbortController(), cancellers = new Set<() => void>();
    const cancel = () => { controller.abort(); for (const callback of [...cancellers]) callback(); };
    active.add(cancel);
    const externalAbort = () => cancel();
    options.signal?.addEventListener("abort", externalAbort, { once: true });
    if (options.signal?.aborted) cancel();
    const check = () => { if (controller.signal.aborted || epoch !== generation || options.isCurrent && !options.isCurrent()) throw chatFileAbortError(); if (!options.token) throw new ApiError("로그인이 필요합니다.", 401); };
    const call: ChatFileCall = { token: options.token, signal: controller.signal, check, onProgress(fraction) { check(); options.onProgress?.(fraction); }, onCancel(callback) { cancellers.add(callback); if (controller.signal.aborted) callback(); return () => { cancellers.delete(callback); }; } };
    return { call, cancel, finish() { active.delete(cancel); cancellers.clear(); options.signal?.removeEventListener("abort", externalAbort); call.token = ""; } };
  }
  async function json(path: string, method: "GET" | "POST", body: unknown, parent: ChatFileCall) {
    return chatFileRequest(parent, async call => {
    call.check();
    let response: Response;
    try { response = await fetch(apiUrl(path), { method, headers: { Authorization: `Bearer ${call.token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: call.signal, cache: "no-store", redirect: "error" }); }
    catch (cause) { call.check(); if (isChatFileCancellation(cause)) throw chatFileAbortError(); throw new ApiError("파일 요청 결과를 확인하지 못했습니다. 연결을 확인하고 다시 확인하세요.", 0); }
    call.check();
    const value: unknown = await response.json().catch(() => null);
    call.check();
    return chatFileJsonResponse(response.status, value);
    }, 30_000);
  }
  function validatedMessage(value: unknown, actorId: string, peerId: string, expected: { name: string; size: number; body?: string; messageId?: string; sender?: boolean }): { message: ChatMessage } {
    const data = value as { message?: unknown };
    if (!data || Object.keys(data).length !== 1 || !isChatMessage(data.message, actorId, peerId) || !data.message.attachment || data.message.attachment.size !== expected.size || safeAttachmentFilename(data.message.attachment.originalName) !== expected.name || expected.messageId && data.message.id !== expected.messageId || expected.sender && data.message.senderId !== actorId || expected.body !== undefined && data.message.body !== expected.body) throw new ApiError("파일 요청 결과가 일치하지 않습니다. 같은 요청의 결과를 다시 확인하세요.", 200);
    return { message: data.message };
  }
  async function pickChatFile(options: ChatFilePickOptions): Promise<SelectedChatFile | null> {
    const op = operation(options); let local: F | undefined;
    try {
      op.call.check();
      const result = await adapter.pick(options, op.call);
      if (result) local = own(result.file);
      op.call.check();
      if (!result) return null;
      const name = validateChatPickedFile(result.name, result.size, options.policy);
      if (adapter.size(result.file) !== result.size) throw new ApiError("선택한 파일 크기가 변경되었습니다. 다시 선택하세요.", 0);
      const entry: Selection = { ...result, name, token: options.token, generation, busy: false, released: false };
      const selected: SelectedChatFile = Object.freeze({ name, size: result.size, release() {
        entry.released = true;
        if (entry.busy || entry.attempt?.uncertain) return;
        selections.delete(selected); selectedEntries.delete(entry); entry.token = ""; remove(entry.file);
      } });
      selections.set(selected, entry); selectedEntries.add(entry); local = undefined;
      return selected;
    } catch (cause) { if (isChatFileCancellation(cause)) return null; throw cause; }
    finally { if (local !== undefined) remove(local); op.finish(); }
  }
  function discardChatFile(file: SelectedChatFile, options: Pick<ChatFileScope, "token" | "isCurrent">): void {
    const entry = selections.get(file);
    if (!entry || entry.generation !== generation || entry.token !== options.token || !options.token || options.isCurrent && !options.isCurrent()) throw chatFileAbortError();
    if (entry.busy) throw new ApiError("파일 전송을 처리하고 있습니다. 결과를 확인한 뒤 폐기하세요.", 409);
    selections.delete(file); selectedEntries.delete(entry);
    entry.released = true; entry.token = ""; entry.attempt = undefined;
    remove(entry.file);
  }
  async function uploadChatFile(options: ChatFileUploadOptions): Promise<{ message: ChatMessage }> {
    const entry = selections.get(options.file);
    if (!entry || entry.generation !== generation || entry.token !== options.token || entry.released && !entry.attempt?.uncertain) throw new ApiError("파일을 다시 선택하세요.", 0);
    if (entry.busy) throw new ApiError("파일 전송을 처리하고 있습니다.", 409);
    if (!isChatId(options.actorId) || !isChatId(options.peerId) || options.actorId === options.peerId || !requestKey(options.requestId) || typeof options.body !== "string" || options.body.trim().length > 2000) throw new ApiError("파일 전송 정보를 확인하세요.", 400);
    const body = options.body.trim();
    if (entry.attempt && [entry.attempt.actorId !== options.actorId, entry.attempt.peerId !== options.peerId, entry.attempt.body !== body, entry.attempt.requestId !== options.requestId].some(Boolean)) throw new ApiError("이전 파일 전송의 결과를 먼저 확인하세요. 같은 파일과 요청으로 다시 확인할 수 있습니다.", 409);
    const attempt = entry.attempt ?? { actorId: options.actorId, peerId: options.peerId, body, requestId: options.requestId, uncertain: false };
    entry.attempt = attempt; entry.busy = true;
    const op = operation(options);
    const matches = (value: unknown) => validatedMessage(value, attempt.actorId, attempt.peerId, { name: entry.name, size: entry.size, body: body || `파일: ${entry.name}`, sender: true });
    try {
      op.call.check();
      if (adapter.size(entry.file) !== entry.size) throw new ApiError("선택한 파일 크기가 변경되었습니다. 다시 선택하세요.", 409);
      if (entry.size <= CHAT_CHUNK_BYTES) {
        attempt.uncertain = true;
        const result = await adapter.multipart(entry.file, { peerId: attempt.peerId, body: attempt.body, requestId: attempt.requestId, name: entry.name, mimeType: entry.mimeType }, op.call);
        op.call.check(); const saved = matches(result); attempt.uncertain = false; entry.attempt = undefined; return saved;
      }
      if (!/\.zip$/i.test(entry.name)) throw new ApiError("대용량 전송은 ZIP 파일만 지원합니다.", 415);
      if (!attempt.digests) {
        const digests: string[] = [];
        for (let offset = 0; offset < entry.size; offset += CHAT_CHUNK_BYTES) {
          const part = await adapter.part(entry.file, offset, Math.min(CHAT_CHUNK_BYTES, entry.size - offset), op.call);
          try { op.call.check(); if (!/^[a-f0-9]{64}$/.test(part.digest)) throw new ApiError("파일 검증 정보를 확인하지 못했습니다.", 0); digests.push(part.digest); }
          finally { part.release(); }
        }
        attempt.digests = digests;
      }
      let status: ChatUploadStatus | undefined;
      if (attempt.uncertain) {
        try { const result = await json(`/chat/uploads?requestId=${encodeURIComponent(attempt.requestId)}`, "GET", undefined, op.call); if (!isChatUploadStatus(result)) throw new ApiError("파일 전송 결과를 확인하지 못했습니다.", 200); status = result; }
        catch (cause) { if (!(cause instanceof ApiError) || cause.status !== 404) throw cause; }
      }
      if (!status) {
        attempt.uncertain = true;
        const value = await json("/chat/uploads", "POST", { peerId: attempt.peerId, body: attempt.body, requestId: attempt.requestId, originalName: entry.name, mimeType: entry.mimeType, size: entry.size, chunkDigests: attempt.digests }, op.call);
        if (!isChatUploadStatus(value)) throw new ApiError("파일 전송 결과를 확인하지 못했습니다.", 200);
        status = value;
      }
      if (status.uploadedParts.some(index => index >= attempt.digests!.length) || attempt.uploadId && status.uploadId !== attempt.uploadId) throw new ApiError("이전 파일 전송 정보와 일치하지 않습니다.", 200);
      attempt.uploadId = status.uploadId;
      if (status.message) { const saved = matches({ message: status.message }); attempt.uncertain = false; entry.attempt = undefined; return saved; }
      const present = new Set(status.uploadedParts);
      for (let index = 0; index < attempt.digests.length; index++) {
        op.call.check(); if (present.has(index)) continue;
        const part = await adapter.part(entry.file, index * CHAT_CHUNK_BYTES, Math.min(CHAT_CHUNK_BYTES, entry.size - index * CHAT_CHUNK_BYTES), op.call);
        try {
          op.call.check(); if (part.digest !== attempt.digests[index]) throw new ApiError("선택한 파일 내용이 변경되었습니다. 이전 전송 결과를 확인하세요.", 409);
          const result = await adapter.putPart(part.file, `/chat/uploads/${encodeURIComponent(status.uploadId)}/parts/${index}`, op.call);
          op.call.check(); if (!result || typeof result !== "object" || Object.keys(result).length !== 1 || (result as { ok?: unknown }).ok !== true) throw new ApiError("파일 조각의 전송 결과를 확인하지 못했습니다.", 200);
          op.call.onProgress((index + 1) / attempt.digests.length);
        } finally { part.release(); }
      }
      const saved = matches(await json(`/chat/uploads/${encodeURIComponent(status.uploadId)}/complete`, "POST", {}, op.call));
      attempt.uncertain = false; entry.attempt = undefined; return saved;
    } catch (cause) {
      if (cause instanceof ApiError && [400, 413, 415].includes(cause.status)) { attempt.uncertain = false; entry.attempt = undefined; }
      throw cause;
    } finally {
      entry.busy = false; op.finish();
      if (entry.released && !entry.attempt?.uncertain) { entry.token = ""; selectedEntries.delete(entry); selections.delete(options.file); remove(entry.file); }
    }
  }
  function createChatFileTransfer(options: ChatFileTransferOptions): ChatFileTransfer {
    if (!isChatAttachment(options.attachment) || !isChatId(options.actorId) || !isChatId(options.peerId) || !isChatId(options.messageId) || !requestKey(options.requestId)) throw new ApiError("파일 수신 정보를 확인하세요.", 400);
    const registryKey = `${options.actorId}:${options.peerId}:${options.messageId}:${options.attachment.id}`;
    const registered = transferRegistry.get(registryKey);
    if (registered && registered.token === options.token) { registered.update(options); return registered.handle; }
    const epoch = generation, expected = { ...options.attachment };
    let token = options.token, receiptToken = "", local: F | undefined, info: ChatFileInfo | undefined;
    let busy = false, cancelled = false, disposed = false, externalSaved = false, handedOff = false, completionPending = false, terminal = false, leaseAttempted = false;
    let current: ReturnType<typeof operation> | undefined;
    let releaseRequested = false, shareTimer: ReturnType<typeof setTimeout> | undefined;
    function check() { if (disposed || epoch !== generation || !token || options.isCurrent && !options.isCurrent()) throw chatFileAbortError(); }
    function forceRelease() {
      disposed = true; current?.cancel(); receiptToken = ""; token = ""; options = { ...options, token: "" };
      if (shareTimer) { clearTimeout(shareTimer); shareTimers.delete(shareTimer); shareTimer = undefined; }
      if (local !== undefined) { remove(local); local = undefined; }
      if (transferRegistry.get(registryKey)?.handle === transfer) transferRegistry.delete(registryKey);
      transfers.delete(forceRelease);
    }
    function releasedCleanup() {
      if (busy || !releaseRequested || completionPending || !options.isSender && leaseAttempted && !terminal) return;
      if (!handedOff) { forceRelease(); return; }
      if (!shareTimer) { shareTimer = setTimeout(() => { if (shareTimer) shareTimers.delete(shareTimer); shareTimer = undefined; forceRelease(); }, 10 * 60_000); shareTimers.add(shareTimer); }
    }
    transfers.add(forceRelease);
    async function run<T>(action: (call: ChatFileCall) => Promise<T>): Promise<T> {
      check(); if (busy) throw new ApiError("파일 작업을 처리하고 있습니다.", 409);
      busy = true; cancelled = false; current = operation({ ...options, token });
      try { current.call.check(); const result = await action(current.call); current.call.check(); check(); return result; }
      finally { current.finish(); current = undefined; busy = false; releasedCleanup(); }
    }
    async function statusWith(call: ChatFileCall): Promise<ChatReceiptStatus> {
      if (options.isSender || !receiptToken || local === undefined) throw new ApiError("완전히 내려받은 수신 파일만 확인할 수 있습니다.", 400);
      const value = await json(`/chat/files/${encodeURIComponent(expected.id)}/status`, "POST", { requestId: options.requestId, token: receiptToken }, call);
      if (!isChatReceiptStatus(value)) throw new ApiError("파일 수신 상태를 확인하지 못했습니다.", 200);
      return value;
    }
    async function exportFile(action: "save" | "share") {
      try { return await run(async call => {
        if (local === undefined || !info || terminal) throw new ApiError("파일을 먼저 완전히 내려받으세요.", 400);
        if (completionPending) throw new ApiError("수신 완료 결과를 먼저 확인하세요. 파일을 다시 내려받거나 내보내지 않습니다.", 409);
        const exported = await adapter.export(local, info, action, call);
        call.check(); if (!exported) return null;
        externalSaved ||= exported.kind === "saved";
        handedOff ||= exported.kind === "handoff";
        return { ...exported, requiresConfirmation: !options.isSender && exported.kind !== "saved" };
      }); } catch (cause) { if (cancelled || isChatFileCancellation(cause)) return null; throw cause; }
    }
    const transfer: ChatFileTransfer = {
      async download() {
        try { return await run(async call => {
          if (terminal) throw new ApiError("수신 완료된 파일은 다시 내려받을 수 없습니다.", 410);
          if (local !== undefined) return true;
          if (completionPending) throw new ApiError("수신 완료 결과를 먼저 확인하세요.", 409);
          if (expected.status === "deleted" || expected.status === "deleting") throw new ApiError("이 파일은 수신 완료 처리 중이거나 삭제되었습니다.", 410);
          leaseAttempted = !options.isSender;
          const downloaded = await adapter.download(`/chat/files/${encodeURIComponent(expected.id)}/download`, { requestId: options.requestId }, expected.size, !options.isSender, call);
          own(downloaded.file);
          try {
            call.check(); if (adapter.size(downloaded.file) !== expected.size || downloaded.info.name !== safeAttachmentFilename(expected.originalName)) throw new ApiError("파일 정보 또는 전체 크기가 일치하지 않습니다. 수신 완료를 처리하지 않았습니다.", 0);
            if (!options.isSender && !downloaded.info.receiptToken) throw new ApiError("파일 수신 정보를 확인하지 못했습니다.", 0);
            local = downloaded.file; info = downloaded.info; receiptToken = downloaded.info.receiptToken ?? ""; return true;
          } catch (cause) { remove(downloaded.file); throw cause; }
        }); } catch (cause) { if (cancelled || isChatFileCancellation(cause)) return false; throw cause; }
      },
      save: () => exportFile("save"), share: () => exportFile("share"),
      status: () => run(statusWith),
      async complete(confirmation = {}) {
        return run(async call => {
          if (options.isSender || local === undefined || !receiptToken || !info) throw new ApiError("완전히 저장한 수신 파일만 수신 완료할 수 있습니다.", 400);
          if (!externalSaved && !(handedOff && confirmation.confirmedSaved === true)) throw new ApiError("파일 저장을 확인한 뒤 수신 완료하세요.", 400);
          if (handedOff && confirmation.confirmedSaved === true) externalSaved = true;
          const state = await statusWith(call);
          if (!state.match) throw new ApiError("이 파일의 수신 정보가 변경되었습니다. 수신 완료를 처리하지 않았습니다.", 409);
          completionPending = true;
          const value = await json(`/chat/files/${encodeURIComponent(expected.id)}/complete`, "POST", { token: receiptToken }, call);
          const saved = validatedMessage(value, options.actorId, options.peerId, { name: safeAttachmentFilename(expected.originalName), size: expected.size, messageId: options.messageId });
          if (saved.message.recipientId !== options.actorId || saved.message.attachment?.id !== expected.id || !["deleted", "deleting"].includes(saved.message.attachment.status)) throw new ApiError("수신 완료 결과를 확인하지 못했습니다. 같은 수신 정보로 다시 확인하세요.", 200);
          if (saved.message.attachment.status === "deleting") throw new ApiError("수신 완료 처리 중입니다. 같은 수신 정보로 결과를 다시 확인하세요.", 200);
          terminal = true; completionPending = false; receiptToken = "";
          // A share target can still read the private URI after its promise resolves.
          // Retain those bytes until explicit release/account cleanup.
          return saved;
        });
      },
      isReady() { return !disposed && epoch === generation && local !== undefined && !terminal && !completionPending && !(options.isCurrent && !options.isCurrent()); },
      getState() { return { ready: transfer.isReady(), exported: externalSaved || handedOff, requiresConfirmation: !options.isSender && handedOff && !externalSaved, completionPending, completed: terminal }; },
      cancel() { cancelled = true; current?.cancel(); },
      release() { releaseRequested = true; releasedCleanup(); },
    };
    transferRegistry.set(registryKey, { token, handle: transfer, update(next) {
      if (next.isSender !== options.isSender || next.attachment.size !== expected.size || next.attachment.originalName !== expected.originalName) throw new ApiError("기존 수신 파일 정보와 일치하지 않습니다.", 409);
      options = { ...next, requestId: options.requestId }; releaseRequested = false;
      if (shareTimer) { clearTimeout(shareTimer); shareTimers.delete(shareTimer); shareTimer = undefined; }
    } });
    return transfer;
  }
  function registerChatPreviewAttachment(options: { attachment: ChatAttachment; token: string; peerId: string }) {
    if (!options.token || !isChatId(options.peerId) || !isChatAttachment(options.attachment)) throw new ApiError("미리보기 정보를 확인하세요.", 400);
    previewRegistry.set(`${options.peerId}:${options.attachment.id}`, { ...options, attachment: { ...options.attachment } });
  }
  function lookupChatPreviewAttachment(options: { attachmentId: string; token: string; peerId: string }): ChatAttachment | null {
    const value = previewRegistry.get(`${options.peerId}:${options.attachmentId}`);
    return value && value.token === options.token ? { ...value.attachment } : null;
  }
  async function loadChatPreview(options: ChatFileScope & { attachment: ChatAttachment }): Promise<ChatFilePreview> {
    if (!isChatAttachment(options.attachment) || options.attachment.size > CHAT_CHUNK_BYTES) throw new ApiError("이 파일은 미리보기를 지원하지 않습니다.", 415);
    const op = operation(options); let file: F | undefined;
    try {
      op.call.check();
      const downloaded = await adapter.download(`/chat/files/${encodeURIComponent(options.attachment.id)}/preview`, null, options.attachment.size, false, op.call);
      file = own(downloaded.file); op.call.check();
      if (adapter.size(file) !== options.attachment.size) throw new ApiError("미리보기 파일 크기가 일치하지 않습니다.", 0);
      const kind = chatPreviewMime(await adapter.head(file), downloaded.info.mimeType); op.call.check();
      const preview = adapter.preview(file, downloaded.info.mimeType), privateFile = file;
      const release = () => { previews.delete(release); preview.release(); remove(privateFile); };
      previews.add(release); file = undefined;
      return { uri: preview.uri, mimeType: downloaded.info.mimeType, kind, release };
    } finally { if (file !== undefined) remove(file); op.finish(); }
  }
  async function clearChatFileResources(): Promise<void> {
    generation += 1;
    for (const cancel of [...active]) cancel();
    previewRegistry.clear();
    for (const timer of shareTimers) clearTimeout(timer); shareTimers.clear();
    transferRegistry.clear();
    for (const clear of [...transfers]) clear();
    for (const entry of selectedEntries) { entry.token = ""; entry.generation = -1; entry.attempt = undefined; entry.released = true; }
    selectedEntries.clear();
    for (const release of [...previews]) release();
    for (const file of [...owned]) remove(file);
    // All credentials and previous generation callbacks have already been
    // invalidated before this first await. Adapters capture old paths only.
    await adapter.clear();
  }
  return { pickChatFile, discardChatFile, uploadChatFile, createChatFileTransfer, loadChatPreview, registerChatPreviewAttachment, lookupChatPreviewAttachment, clearChatFileResources };
}
