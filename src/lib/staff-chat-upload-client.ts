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
    await uploadRequest<{ ok: true }>(`/api/chat/uploads/${encodeURIComponent(initialized.uploadId)}/parts/${index}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: file.slice(start, start + staffChatChunkSize),
    });
    completedBytes += partSize(index);
    progress("uploading", completedBytes);
  }
  progress("finishing", file.size);
  return uploadRequest<{ message: ChatMessage }>(`/api/chat/uploads/${encodeURIComponent(initialized.uploadId)}/complete`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
}
