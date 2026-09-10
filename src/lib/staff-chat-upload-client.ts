import { readChatResponse } from "@/hooks/use-staff-chat-data";
import { staffChatChunkSize } from "@/lib/staff-chat-file-limits";
import type { ChatMessage } from "@/lib/staff-chat-types";

export type ChatUploadProgress = {
  stage: "hashing" | "uploading" | "finishing";
  completedBytes: number;
  totalBytes: number;
};

type UploadOptions = {
  file: File;
  peerId: string;
  body: string;
  requestId: string;
  onProgress?: (progress: ChatUploadProgress) => void;
};

async function uploadRequest<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(90_000) });
  return readChatResponse<T>(response);
}

// fetch has no upload progress event. Use the browser's measured transmitted
// bytes for file requests, while keeping the same response/error handling.
function uploadWithProgress<T>(url: string, method: "POST" | "PUT", body: Blob | FormData, onProgress: (ratio: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, url);
    request.timeout = 90_000;
    if (body instanceof Blob) request.setRequestHeader("Content-Type", "application/octet-stream");
    const cleanup = () => {
      request.upload.onprogress = null;
      request.onload = request.onerror = request.ontimeout = request.onabort = null;
    };
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.max(0, Math.min(1, event.loaded / event.total)));
    };
    request.onload = () => {
      cleanup();
      if (!request.status) { reject(new TypeError("File upload failed")); return; }
      const response = new Response([204, 205, 304].includes(request.status) ? null : request.responseText, { status: request.status });
      void readChatResponse<T>(response).then(resolve, reject);
    };
    request.onerror = () => { cleanup(); reject(new TypeError("File upload failed")); };
    request.ontimeout = () => { cleanup(); reject(new DOMException("File upload timed out", "TimeoutError")); };
    request.onabort = () => { cleanup(); reject(new DOMException("File upload aborted", "AbortError")); };
    try { request.send(body); }
    catch (error) { cleanup(); reject(error); }
  });
}

export async function uploadStaffChatFile({ file, peerId, body, requestId, onProgress }: UploadOptions): Promise<{ message: ChatMessage }> {
  const form = new FormData();
  form.set("peerId", peerId);
  form.set("body", body);
  form.set("requestId", requestId);
  form.set("file", file);
  const progress = (stage: ChatUploadProgress["stage"], completedBytes: number) => onProgress?.({ stage, completedBytes, totalBytes: file.size });
  progress("uploading", 0);
  const result = await uploadWithProgress<{ message: ChatMessage }>("/api/chat/files", "POST", form, (ratio) => {
    progress("uploading", Math.min(Math.max(0, file.size - 1), Math.floor(file.size * ratio)));
  });
  progress("finishing", file.size);
  return result;
}

export async function uploadStaffChatZip({ file, peerId, body, requestId, onProgress }: UploadOptions): Promise<{ message: ChatMessage }> {
  const chunkDigests: string[] = [];
  const progress = (stage: ChatUploadProgress["stage"], completedBytes: number) => onProgress?.({ stage, completedBytes, totalBytes: file.size });
  progress("hashing", 0);
  // Read and hash one chunk at a time, so a 100 MB file never needs a matching
  // ArrayBuffer in browser memory. Digests also bind resumed parts to this file.
  for (let start = 0; start < file.size; start += staffChatChunkSize) {
    const end = Math.min(start + staffChatChunkSize, file.size);
    const digest = await crypto.subtle.digest("SHA-256", await file.slice(start, end).arrayBuffer());
    chunkDigests.push(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""));
    progress("hashing", end);
  }
  const initialized = await uploadRequest<{ uploadId: string; uploadedParts: number[]; message?: ChatMessage }>("/api/chat/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ peerId, body, requestId, originalName: file.name, mimeType: file.type, size: file.size, chunkDigests }),
  });
  if (initialized.message) return { message: initialized.message };
  const uploaded = new Set(initialized.uploadedParts);
  const partSize = (index: number) => Math.min(staffChatChunkSize, file.size - index * staffChatChunkSize);
  let completedBytes = chunkDigests.reduce((total, _, index) => total + (uploaded.has(index) ? partSize(index) : 0), 0);
  progress("uploading", completedBytes);
  for (let index = 0; index < chunkDigests.length; index++) {
    if (uploaded.has(index)) continue;
    const start = index * staffChatChunkSize;
    await uploadWithProgress<{ ok: true }>(
      `/api/chat/uploads/${encodeURIComponent(initialized.uploadId)}/parts/${index}`,
      "PUT", file.slice(start, start + staffChatChunkSize),
      (ratio) => progress("uploading", Math.min(file.size - 1, completedBytes + Math.floor(partSize(index) * ratio))),
    );
    completedBytes += partSize(index);
    progress("uploading", completedBytes);
  }
  progress("finishing", file.size);
  return uploadRequest<{ message: ChatMessage }>(`/api/chat/uploads/${encodeURIComponent(initialized.uploadId)}/complete`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
}
