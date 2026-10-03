import { isResourceCategory, isResourceEducationLevel, type ResourceCategory, type ResourceEducationLevel } from "@/lib/resource-library-core";
import { validateResourceFormValues } from "@/lib/resource-form-state";

export type ResourceLevelFilter = "all" | ResourceEducationLevel;
export type ResourceUser = { id: string; name: string; departmentName: string; positionName: string };
export type ResourceFile = { id: string; name: string; mimeType: string; size: number; previewKind: "image" | "pdf" | "unsupported" };
export type MobileResource = { id: string; title: string; summary: string; category: ResourceCategory; educationLevel: ResourceEducationLevel | null; pinned: boolean; createdAt: string; updatedAt: string; uniqueViewerCount: number; author: ResourceUser; canManage: boolean; attachments: ResourceFile[] };
export type ResourceViewer = { user: ResourceUser; firstViewedAt: string; lastViewedAt: string; visitCount: number };
export type ResourceMutationResult = { ok: true; message: string; replayed: boolean; operation: "create" | "update" | "delete"; outcome: "present" | "deleted"; resourceId: string; committedUpdatedAt: string | null; resource: MobileResource | null; cleanupPending: boolean };
export type ResourceUploadState = "uploading" | "finalizing" | "ready" | "consumed" | "deleting" | "deleted" | "expired";
export type ResourceUploadDto = { id: string; targetResourceId: string | null; file: { name: string; mimeType: string; size: number; wholeSha256: string } | null; state: ResourceUploadState; expiresAt: string; completedAt: string | null; consumedResourceId: string | null; cleanupPending: boolean };
export type ResourceUploadGrant = { upload: ResourceUploadDto; grant: { method: "PUT"; url: string; headers: { "Content-Type": string }; expiresAt: string } | null };
export type ResourceCreateInput = { requestId: string; title: string; summary: string; category: ResourceCategory; educationLevel: ResourceEducationLevel | null; uploadIds: string[] };
export type ResourceUpdateInput = ResourceCreateInput & { expectedUpdatedAt: string; removeAttachmentIds: string[] };
export type ResourceDeleteInput = { requestId: string; expectedUpdatedAt: string };
export type ResourceUploadInput = { requestId: string; targetResourceId: string | null; name: string; mimeType: string; size: number; wholeSha256: string };
export type ResourcePageQuery = { category: ResourceCategory; level: ResourceLevelFilter; q: string; page: number };
export class ResourceError extends Error {
  constructor(message = "자료실 요청 정보를 확인해 주세요.", readonly code = "INVALID_REQUEST", readonly status = 400, readonly fields?: Record<string, string>) { super(message); }
}
export function resourceId(value: unknown, request = false): string {
  if (typeof value !== "string" || !(request ? /^[A-Za-z0-9_-]{8,128}$/ : /^[A-Za-z0-9_-]{1,128}$/).test(value)) throw new ResourceError();
  return value;
}
export function resourceTimestamp(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(new Date(value).getTime()) || new Date(value).toISOString() !== value) throw new ResourceError("최신 자료 정보를 다시 확인해 주세요.");
  return value;
}
export function resourceInputObject(value: unknown, required: readonly string[], optional: readonly string[] = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ResourceError();
  const object = value as Record<string, unknown>, allowed = [...required, ...optional];
  if (required.some(key => !Object.hasOwn(object, key)) || Object.keys(object).some(key => !allowed.includes(key))) throw new ResourceError();
  return object;
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value)) throw new ResourceError();
  const result = value.map(id => resourceId(id));
  if (new Set(result).size !== result.length) throw new ResourceError("첨부파일 정보를 확인해 주세요.", "INVALID_REQUEST", 400, { attachments: "같은 첨부파일이 중복되었습니다." });
  return result.sort();
}
function form(raw: Record<string, unknown>): ResourceCreateInput {
  if (typeof raw.title !== "string" || typeof raw.summary !== "string") throw new ResourceError();
  const category = raw.category === undefined ? "bajaul" : raw.category;
  if (typeof category !== "string" || !isResourceCategory(category)) throw new ResourceError("자료실을 선택하세요.", "VALIDATION_ERROR", 400, { category: "자료실을 선택하세요." });
  let educationLevel: ResourceEducationLevel | null = null;
  if (category === "education") {
    if (typeof raw.educationLevel !== "string" || !isResourceEducationLevel(raw.educationLevel)) throw new ResourceError("교육 대상을 선택하세요.", "VALIDATION_ERROR", 400, { educationLevel: "교육 대상을 선택하세요." });
    educationLevel = raw.educationLevel;
  } else if (raw.educationLevel !== undefined && raw.educationLevel !== null) throw new ResourceError();
  const title = raw.title.trim(), summary = raw.summary.trim();
  const errors = validateResourceFormValues({ title, summary, category, educationLevel: educationLevel ?? "" });
  if (Object.keys(errors).length) throw new ResourceError("입력 내용을 확인해 주세요.", "VALIDATION_ERROR", 400, errors as Record<string, string>);
  return { requestId: resourceId(raw.requestId, true), title, summary, category, educationLevel, uploadIds: ids(raw.uploadIds) };
}
export function parseResourceCreate(value: unknown): ResourceCreateInput { return form(resourceInputObject(value, ["requestId", "title", "summary", "uploadIds"], ["category", "educationLevel"])); }
export function parseResourceUpdate(value: unknown): ResourceUpdateInput {
  const raw = resourceInputObject(value, ["requestId", "title", "summary", "uploadIds", "expectedUpdatedAt", "removeAttachmentIds"], ["category", "educationLevel"]);
  return { ...form(raw), expectedUpdatedAt: resourceTimestamp(raw.expectedUpdatedAt), removeAttachmentIds: ids(raw.removeAttachmentIds) };
}
export function parseResourceDelete(value: unknown): ResourceDeleteInput { const raw = resourceInputObject(value, ["requestId", "expectedUpdatedAt"]); return { requestId: resourceId(raw.requestId, true), expectedUpdatedAt: resourceTimestamp(raw.expectedUpdatedAt) }; }
export function parseResourceUpload(value: unknown): ResourceUploadInput {
  const raw = resourceInputObject(value, ["requestId", "targetResourceId", "name", "mimeType", "size", "wholeSha256"]);
  if (typeof raw.name !== "string" || !raw.name.trim() || typeof raw.mimeType !== "string" || (raw.mimeType !== "" && !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(raw.mimeType)) || typeof raw.size !== "number" || !Number.isSafeInteger(raw.size) || raw.size <= 0 || typeof raw.wholeSha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.wholeSha256)) throw new ResourceError("첨부파일 정보를 확인해 주세요.", "INVALID_REQUEST", 400, { attachments: "파일 크기와 형식을 확인해 주세요." });
  // Match the existing web filename sanitizer without trusting a path/key.
  const name = raw.name.split("/").pop()!.replace(/[\\/]/g, "").trim().slice(0, 180) || "attachment";
  return { requestId: resourceId(raw.requestId, true), targetResourceId: raw.targetResourceId === null ? null : resourceId(raw.targetResourceId), name, mimeType: raw.mimeType || "application/octet-stream", size: raw.size, wholeSha256: raw.wholeSha256 };
}
export function parseResourceQuery(url: URL, allowed: readonly string[] = []): Record<string, string> {
  if (new TextEncoder().encode(url.search).byteLength > 8192) throw new ResourceError("조회 조건이 너무 큽니다.", "PAYLOAD_TOO_LARGE", 413);
  const result: Record<string, string> = {};
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) throw new ResourceError();
    result[key] = url.searchParams.get(key)!;
  }
  return result;
}
export function resourcePage(value: string | undefined) {
  if (value === undefined) return 1;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new ResourceError();
  return Number(value);
}
export function parseResourcePageQuery(url: URL): ResourcePageQuery {
  const query = parseResourceQuery(url, ["category", "level", "q", "page"]), category = query.category ?? "corporation", level = query.level ?? "all";
  if (!isResourceCategory(category) || (level !== "all" && !isResourceEducationLevel(level))) throw new ResourceError();
  return { category, level: category === "education" ? level : "all", q: (query.q ?? "").trim(), page: resourcePage(query.page) };
}
/** JSON.parse validates grammar first; this bounded walk then detects duplicate decoded keys. */
function rejectDuplicateJsonKeys(source: string) {
  let position = 0;
  const space = () => { while (/\s/.test(source[position] ?? "")) position++; };
  const string = () => { const start = position++; while (position < source.length) { if (source[position++] === "\\") position++; else if (source[position - 1] === '"') break; } return JSON.parse(source.slice(start, position)) as string; };
  const value = (depth: number) => {
    if (depth > 64) throw new ResourceError();
    space(); const token = source[position];
    if (token === "{") {
      position++; space(); const keys = new Set<string>();
      if (source[position] !== "}") while (true) { space(); const key = string(); if (keys.has(key)) throw new ResourceError("중복 입력 항목을 확인해 주세요."); keys.add(key); space(); position++; value(depth + 1); space(); if (source[position] !== ",") break; position++; }
      position++;
    } else if (token === "[") { position++; space(); if (source[position] !== "]") while (true) { value(depth + 1); space(); if (source[position] !== ",") break; position++; } position++; }
    else if (token === '"') string();
    else while (position < source.length && !/[\s,}\]]/.test(source[position])) position++;
  };
  value(0);
}
export async function readResourceJson(request: Request): Promise<unknown> {
  if ((request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") throw new ResourceError("JSON 요청이 필요합니다.", "UNSUPPORTED_MEDIA_TYPE", 415);
  const declared = request.headers.get("content-length"), max = 65536;
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new ResourceError();
  if (declared !== null && Number(declared) > max) throw new ResourceError("요청이 너무 큽니다.", "PAYLOAD_TOO_LARGE", 413);
  if (!request.body) throw new ResourceError();
  const reader = request.body.getReader(), chunks: Uint8Array[] = [], deadline = Date.now() + 10000;
  let size = 0;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new ResourceError("요청 시간이 초과되었습니다. 입력을 보관하고 다시 시도해 주세요.", "REQUEST_TIMEOUT", 408)); void reader.cancel().catch(() => undefined); }, Math.max(1, deadline - Date.now())); });
      const next = await Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
      if (next.done) break;
      size += next.value.byteLength;
      if (size > max) { void reader.cancel().catch(() => undefined); throw new ResourceError("요청이 너무 큽니다.", "PAYLOAD_TOO_LARGE", 413); }
      chunks.push(next.value);
    }
  } catch (error) { if (error instanceof ResourceError) throw error; throw new ResourceError(); }
  finally { reader.releaseLock(); }
  if (declared !== null && Number(declared) !== size) throw new ResourceError();
  try { const source = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size)), value = JSON.parse(source) as unknown; rejectDuplicateJsonKeys(source); return value; }
  catch (error) { if (error instanceof ResourceError) throw error; throw new ResourceError(); }
}
