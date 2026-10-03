import { ApiError, apiUrl } from "./api";
import { safeAttachmentFilename, transferProgress } from "./attachment-file";
import { chatFileDownloadInfo, chatFileFailure, chatFileJsonResponse, chatFileRequest, createChatFileApi, validateChatPickedFile, type ChatFileAdapter, type ChatFileCall, type ChatFilePickOptions } from "./chat-file-core";
export type { SelectedChatFile, ChatFileTransfer, ChatFileExportResult, ChatFilePreview, ChatFilePickOptions, ChatFileUploadOptions, ChatFileTransferOptions } from "./chat-file-core";
export { chatFileSize, isChatFileCancellation } from "./chat-file-core";

const urls = new Set<string>();
const urlTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pickers = new Set<() => void>();
function url(blob: Blob) { const value = URL.createObjectURL(blob); urls.add(value); return value; }
function revoke(value: string) { const timer = urlTimers.get(value); if (timer) { clearTimeout(timer); urlTimers.delete(value); } if (urls.delete(value)) URL.revokeObjectURL(value); }
async function decoded(response: Response, call: ChatFileCall) {
  const data: unknown = await response.json().catch(() => null); call.check();
  return chatFileJsonResponse(response.status, data);
}
async function request(path: string, init: RequestInit, parent: ChatFileCall) {
  return chatFileRequest(parent, async call => {
  call.check();
  try {
    const response = await fetch(apiUrl(path), { ...init, headers: { Authorization: `Bearer ${call.token}`, Accept: "application/json", ...init.headers }, signal: call.signal, cache: "no-store", redirect: "error" });
    call.check(); return await decoded(response, call);
  } catch (cause) { call.check(); if (cause instanceof ApiError) throw cause; throw new ApiError("파일 전송 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.", 0); }
  });
}
async function pick(options: ChatFilePickOptions, call: ChatFileCall) {
  if (typeof document === "undefined") return null;
  return new Promise<{ file: Blob; name: string; size: number; mimeType: string } | null>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file"; input.multiple = false; input.accept = options.policy.allowedExtensions.join(","); input.style.display = "none";
    let finished = false;
    let off = () => {};
    const finish = (result: { file: Blob; name: string; size: number; mimeType: string } | null, cause?: unknown) => {
      if (finished) return; finished = true;
      off(); pickers.delete(cancel); input.removeEventListener("change", changed); input.removeEventListener("cancel", cancel); input.remove();
      if (cause) reject(cause); else resolve(result);
    };
    const cancel = () => finish(null);
    const changed = () => {
      try {
        call.check(); const source = input.files?.[0];
        if (!source) return finish(null);
        const name = validateChatPickedFile(source.name, source.size, options.policy);
        const mimeType = /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(source.type) ? source.type.toLowerCase() : /\.zip$/i.test(name) ? "application/zip" : "application/octet-stream";
        // Blob slices are immutable handles. Only individual upload chunks are
        // materialized in JS; a 100MB ZIP is never read as one ArrayBuffer.
        const file = source.slice(0, source.size, mimeType);
        call.check(); finish({ file, name, size: file.size, mimeType });
      } catch (cause) { finish(null, cause); }
    };
    pickers.add(cancel); input.addEventListener("change", changed); input.addEventListener("cancel", cancel);
    document.body.appendChild(input); off = call.onCancel(cancel);
    try { call.check(); if (!finished) input.click(); } catch (cause) { finish(null, cause); }
  });
}
const adapter: ChatFileAdapter<Blob, Blob> = {
  pick,
  size: file => file.size,
  async head(file) { return new Uint8Array(await file.slice(0, 16).arrayBuffer()); },
  async part(file, offset, size, call) {
    call.check(); const chunk = file.slice(offset, offset + size);
    if (size > 4 * 1024 * 1024 || chunk.size !== size) throw new ApiError("파일 조각의 크기를 확인하지 못했습니다.", 0);
    const bytes = await chunk.arrayBuffer(); call.check();
    const hash = await crypto.subtle.digest("SHA-256", bytes); call.check();
    const digest = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    return { file: chunk, digest, release() {} };
  },
  async multipart(file, input, call) {
    call.check(); if (file.size > 4 * 1024 * 1024) throw new ApiError("일반 파일은 4MB 이하만 한 번에 전송할 수 있습니다.", 413);
    const form = new FormData(); form.append("peerId", input.peerId); form.append("body", input.body); form.append("requestId", input.requestId); form.append("file", file, input.name);
    call.onProgress(null); return request("/chat/files", { method: "POST", body: form }, call);
  },
  putPart(file, path, call) { return request(path, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: file }, call); },
  async download(path, body, expectedSize, recipient, parent) {
    return chatFileRequest(parent, async call => {
    call.check(); let response: Response;
    try { response = await fetch(apiUrl(path), { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${call.token}`, Accept: "application/octet-stream", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: call.signal, cache: "no-store", redirect: "error" }); }
    catch { call.check(); throw new ApiError("파일을 내려받지 못했습니다. 연결을 확인하세요.", 0); }
    call.check();
    if (response.status !== 200) { const value: unknown = await response.json().catch(() => null); call.check(); chatFileFailure(response.status, value); }
    const headers = Object.fromEntries(response.headers.entries());
    let info;
    try { info = chatFileDownloadInfo(headers, expectedSize, recipient); }
    catch (cause) { await response.body?.cancel().catch(() => {}); throw cause; }
    const announced = response.headers.get("Content-Length");
    const total = announced && /^\d+$/.test(announced) ? Number(announced) : -1;
    call.onProgress(null);
    let blob: Blob;
    if (response.body) {
      const reader = response.body.getReader(); let count = 0;
      const off = call.onCancel(() => { void reader.cancel().catch(() => {}); });
      try {
        const stream = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              call.check(); const chunk = await reader.read(); call.check();
              if (chunk.done) { if (count !== expectedSize) throw new ApiError("파일이 완전히 내려받아지지 않았습니다. 수신 완료를 처리하지 않았습니다.", 0); controller.close(); return; }
              count += chunk.value.byteLength;
              if (count > expectedSize) throw new ApiError("파일 크기가 일치하지 않습니다. 수신 완료를 처리하지 않았습니다.", 0);
              call.onProgress(transferProgress(count, total)); controller.enqueue(chunk.value);
            } catch (cause) { void reader.cancel().catch(() => {}); controller.error(cause); }
          },
          cancel() { return reader.cancel(); },
        });
        blob = await new Response(stream, { headers: { "Content-Type": info.mimeType } }).blob();
      } finally { off(); reader.releaseLock(); }
    } else { blob = await response.blob(); }
    call.check(); if (blob.size !== expectedSize) throw new ApiError("파일이 완전히 내려받아지지 않았습니다. 수신 완료를 처리하지 않았습니다.", 0);
    call.onProgress(1); return { file: blob, info };
    });
  },
  async export(file, info, action, call) {
    call.check(); if (typeof document === "undefined") throw new ApiError("이 환경에서는 파일 저장을 지원하지 않습니다.", 0);
    if (action === "share") throw new ApiError("웹에서는 파일을 먼저 저장한 뒤 브라우저 또는 파일 앱에서 공유하세요.", 400);
    const objectUrl = url(file), anchor = document.createElement("a"); let clicked = false;
    try { anchor.href = objectUrl; anchor.download = safeAttachmentFilename(info.name); anchor.style.display = "none"; document.body.appendChild(anchor); call.check(); anchor.click(); clicked = true; call.check(); }
    finally { anchor.remove(); /* Browsers may acquire the URL after click returns. */ if (clicked) urlTimers.set(objectUrl, setTimeout(() => revoke(objectUrl), 60_000)); else revoke(objectUrl); }
    return { kind: "handoff", message: "파일 저장을 요청했습니다. 저장한 파일을 확인한 뒤 수신 완료하세요." };
  },
  preview(file, mimeType) { const uri = url(file.slice(0, file.size, mimeType)); return { uri, release: () => revoke(uri) }; },
  release() { /* Blob handles are released when their private owner drops them. */ },
  async clear() { for (const cancel of [...pickers]) cancel(); for (const value of [...urls]) revoke(value); },
};
const api = createChatFileApi(adapter);
export const { pickChatFile, discardChatFile, uploadChatFile, createChatFileTransfer, loadChatPreview, registerChatPreviewAttachment, lookupChatPreviewAttachment, clearChatFileResources } = api;
