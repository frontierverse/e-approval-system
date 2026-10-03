import { parseStaffChatId, StaffChatError } from "@/lib/staff-chat-core";
import { staffChatFileRequestMaxBytes } from "@/lib/staff-chat-file-core";
import { staffChatChunkSize } from "@/lib/staff-chat-file-limits";

export const mobileChatJsonMaxBytes = 16 * 1024;
export const mobileChatUploadJsonMaxBytes = 32 * 1024;
const invalid = () => new StaffChatError("채팅 요청 정보가 올바르지 않습니다.");
export function parseMobileChatQuery(params: URLSearchParams, required: readonly string[] = [], optional: readonly string[] = []) {
  const allowed = [...required, ...optional], result: Record<string, string> = {};
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1 || !params.get(key)) throw invalid();
    result[key] = parseStaffChatId(params.get(key));
  }
  if (required.some(key => !(key in result))) throw invalid();
  return result;
}
export function parseMobileChatObject(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key)) || Object.keys(record).some(key => !keys.includes(key))) throw invalid();
  return record;
}
export function parseMobileChatOperationId(value: unknown) {
  const id = parseStaffChatId(value);
  if (id.length < 8) throw invalid();
  return id;
}
export function parseMobileChatPartIndex(value: unknown) {
  if (typeof value !== "string" || !/^(?:[0-9]|1[0-9]|2[0-4])$/.test(value)) throw invalid();
  return Number(value);
}
async function boundedBytes(request: Request, maxBytes: number): Promise<Buffer> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw invalid();
  const tooLarge = () => new StaffChatError("채팅 요청이 너무 큽니다.", 413);
  if (declared !== null && Number(declared) > maxBytes) throw tooLarge();
  if (!request.body) throw invalid();
  const reader = request.body.getReader(), chunks: Uint8Array[] = [], deadline = Date.now() + 10000;
  let size = 0;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
        reject(new StaffChatError("요청 시간이 초과되었습니다. 다시 시도해 주세요.", 408)); void reader.cancel().catch(() => undefined);
      }, Math.max(1, deadline - Date.now())); });
      const next = await Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) { void reader.cancel().catch(() => undefined); throw tooLarge(); }
      chunks.push(next.value);
    }
  } catch (error) { if (error instanceof StaffChatError) throw error; throw invalid(); }
  finally { reader.releaseLock(); }
  if (declared !== null && Number(declared) !== size) throw invalid();
  return Buffer.concat(chunks, size);
}
function contentType(request: Request, required: string) {
  const raw = request.headers.get("content-type") ?? "";
  if (raw.split(";")[0].trim().toLowerCase() !== required) throw new StaffChatError("요청 형식이 올바르지 않습니다.", 415);
  return raw;
}
export async function readMobileChatJson(request: Request, keys: readonly string[], maxBytes = mobileChatJsonMaxBytes) {
  contentType(request, "application/json");
  const bytes = await boundedBytes(request, maxBytes);
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw invalid(); }
  return parseMobileChatObject(value, keys);
}
export async function readMobileChatFileForm(request: Request): Promise<FormData> {
  const type = contentType(request, "multipart/form-data"), bytes = await boundedBytes(request, staffChatFileRequestMaxBytes);
  let form: FormData;
  try { form = await new Response(new Uint8Array(bytes), { headers: { "Content-Type": type } }).formData(); } catch { throw invalid(); }
  for (const key of form.keys()) if (!["peerId", "body", "requestId", "file"].includes(key) || form.getAll(key).length !== 1) throw invalid();
  for (const key of ["peerId", "body", "requestId"]) if (form.getAll(key).length !== 1 || typeof form.get(key) !== "string") throw invalid();
  if (form.getAll("file").length !== 1 || typeof form.get("file") === "string" || !form.get("file")) throw invalid();
  return form;
}
export async function readMobileChatChunk(request: Request): Promise<Buffer> {
  contentType(request, "application/octet-stream");
  const bytes = await boundedBytes(request, staffChatChunkSize);
  if (!bytes.byteLength) throw invalid();
  return bytes;
}
