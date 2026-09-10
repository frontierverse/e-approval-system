import { assertStaffChatSameOrigin, StaffChatError } from "@/lib/staff-chat-core";
import { staffChatFileMaxBytes } from "@/lib/staff-chat-file-limits";

export { staffChatFileMaxBytes } from "@/lib/staff-chat-file-limits";
export const staffChatFileRequestMaxBytes = staffChatFileMaxBytes + 64 * 1024;
export const staffChatFileLeaseMs = 10 * 60 * 1000;

// Bound the incoming stream before invoking the multipart parser. A forged or
// missing Content-Length cannot make formData allocate an unbounded upload.
export async function readStaffChatFileForm(request: Request): Promise<FormData> {
  assertStaffChatSameOrigin(request);
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.split(";")[0].trim().toLowerCase() !== "multipart/form-data") {
    throw new StaffChatError("파일 전송 형식이 올바르지 않습니다.", 415);
  }
  const announcedLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(announcedLength) && announcedLength > staffChatFileRequestMaxBytes) {
    throw new StaffChatError("파일은 4MB 이하만 전송할 수 있습니다.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new StaffChatError("전송할 파일을 선택해 주세요.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > staffChatFileRequestMaxBytes) {
        await reader.cancel();
        throw new StaffChatError("파일은 4MB 이하만 전송할 수 있습니다.", 413);
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return await new Response(bytes, { headers: { "Content-Type": contentType } }).formData();
  } catch (error) {
    if (error instanceof StaffChatError) throw error;
    throw new StaffChatError("파일 전송 정보를 읽을 수 없습니다. 다시 시도해 주세요.");
  } finally {
    reader.releaseLock();
  }
}
