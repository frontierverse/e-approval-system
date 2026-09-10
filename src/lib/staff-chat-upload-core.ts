import { createHash } from "node:crypto";
import { assertStaffChatSameOrigin, parseStaffChatSend, StaffChatError } from "@/lib/staff-chat-core";
import { isStaffChatZip, staffChatChunkSize, staffChatFileMaxBytes, staffChatZipMaxBytes } from "@/lib/staff-chat-file-limits";

export const staffChatUploadLifetimeMs = 24 * 60 * 60 * 1000;

export function parseStaffChatUpload(value: unknown, userId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StaffChatError("파일 전송 정보가 올바르지 않습니다.");
  const data = value as Record<string, unknown>;
  const originalName = typeof data.originalName === "string" ? data.originalName.trim() : "";
  if (!originalName || originalName.length > 180 || /[\\/\x00-\x1f\x7f]/.test(originalName) || !isStaffChatZip(originalName)) {
    throw new StaffChatError("대용량 전송은 이름이 180자 이하인 ZIP 파일만 지원합니다.");
  }
  if (typeof data.mimeType !== "string" || data.mimeType.length > 255 || /[\x00-\x1f\x7f]/.test(data.mimeType)) {
    throw new StaffChatError("파일 형식이 올바르지 않습니다.");
  }
  if (typeof data.size !== "number" || !Number.isSafeInteger(data.size) || data.size <= staffChatFileMaxBytes || data.size > staffChatZipMaxBytes) {
    throw new StaffChatError("ZIP 파일은 100MB 이하만 전송할 수 있습니다.", 413);
  }
  const count = Math.ceil(data.size / staffChatChunkSize);
  if (!Array.isArray(data.chunkDigests) || data.chunkDigests.length !== count
    || !data.chunkDigests.every((digest) => typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest))) {
    throw new StaffChatError("파일 검증 정보가 올바르지 않습니다.");
  }
  if (typeof data.body !== "string") throw new StaffChatError("메시지 정보가 올바르지 않습니다.");
  const message = parseStaffChatSend({ ...data, body: data.body.trim() || `파일: ${originalName}` }, userId);
  const chunkDigests = data.chunkDigests as string[];
  // Domain-separated fingerprint of ordered, individually verified SHA-256 chunks.
  const fileDigest = createHash("sha256").update(`staff-chat-chunks-v1:${data.size}:${chunkDigests.join(":")}`).digest("hex");
  return { ...message, originalName, mimeType: data.mimeType || "application/octet-stream", size: data.size, chunkDigests, fileDigest };
}

export function parseStaffChatUploadId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new StaffChatError("파일 전송 정보를 찾을 수 없습니다.", 404);
  }
  return value;
}

export function getStaffChatPartSize(size: number, index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= Math.ceil(size / staffChatChunkSize)) {
    throw new StaffChatError("파일 전송 순서가 올바르지 않습니다.");
  }
  return Math.min(staffChatChunkSize, size - index * staffChatChunkSize);
}

export async function readStaffChatChunk(request: Request): Promise<Buffer> {
  assertStaffChatSameOrigin(request);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/octet-stream") {
    throw new StaffChatError("파일 전송 형식이 올바르지 않습니다.", 415);
  }
  const announced = Number(request.headers.get("content-length"));
  if (Number.isFinite(announced) && announced > staffChatChunkSize) throw new StaffChatError("전송 조각이 너무 큽니다.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new StaffChatError("전송할 파일 내용이 없습니다.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > staffChatChunkSize) {
        await reader.cancel();
        throw new StaffChatError("전송 조각이 너무 큽니다.", 413);
      }
      chunks.push(chunk.value);
    }
    if (!size) throw new StaffChatError("전송할 파일 내용이 없습니다.");
    return Buffer.concat(chunks, size);
  } finally {
    reader.releaseLock();
  }
}
