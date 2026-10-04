import type { EffectiveYouthPermissions } from "@/lib/youth-permissions-core";

export class YouthError extends Error {
  constructor(message = "청소년 요청 정보를 확인해 주세요.", readonly code = "INVALID_REQUEST", readonly status = 400, readonly fields?: Record<string, string>) { super(message); }
}
export type YouthPermissions = Omit<EffectiveYouthPermissions, "canViewYouthBasic" | "canDeleteYouth"> & { canViewYouthBasic: true; canDeleteYouth: false };
export type YouthBasic = { id: string; name: string; admissionDate: string | null; dischargeDate: string | null; updatedAt: string };
export type YouthBasicDetail = { today: string; permissions: YouthPermissions; youth: YouthBasic };
export type YouthContacts = { phone: string | null; familyContacts: Array<{ id: string; relationship: string | null; phone: string | null }> };
export type YouthSensitiveDetails = { birthDate: string | null; age: number | null; koreanAge: number | null; initialDischargeDate: string | null; dischargeExtensions: Array<{ id: string; extensionOrder: number; previousDischargeDate: string; extendedDischargeDate: string; reason: string; processedAt: string; processedBy: { id: string; name: string } }> };
export type YouthMutationOperation = "profile.create" | "profile.patch" | "profile.extend" | "personal.create" | "personal.update" | "personal.delete" | "common.batch" | "concept.create" | "concept.delete" | "concept.check" | "rule.create" | "rule.delete" | "document.attach" | "document.delete";
export type YouthMutationResult<T> = { ok: true; replayed: boolean; requestId: string; operation: YouthMutationOperation; targetType: string; targetId: string; youthId: string | null; outcome: "present" | "deleted" | "unavailable"; committedAt: string; committedUpdatedAt: string | null; result: T | null };
export type YouthProfilePatch = { name?: string; admissionDate?: string | null; birthDate?: string | null; phone?: string | null; familyContacts?: Array<{ relationship: string | null; phone: string | null }> };
export type YouthCreateBody = { requestId: string; name: string; admissionDate: string | null; dischargeDate: string | null; birthDate?: string | null; phone?: string | null; familyContacts?: Array<{ relationship: string | null; phone: string | null }>; uploadIds: string[] };
export type YouthPatchBody = { requestId: string; expectedUpdatedAt: string; patch: YouthProfilePatch };
export type YouthExtensionBody = { requestId: string; expectedUpdatedAt: string; extendedDischargeDate: string; reason: string };
export function youthId(value: unknown, request = false): string { if (typeof value !== "string" || !(request ? /^[A-Za-z0-9_-]{8,128}$/ : /^[A-Za-z0-9_-]{1,128}$/).test(value)) throw new YouthError(); return value; }
export function youthTimestamp(value: unknown): string { if (typeof value !== "string" || !Number.isFinite(new Date(value).getTime()) || new Date(value).toISOString() !== value) throw new YouthError("최신 청소년 정보를 다시 확인해 주세요."); return value; }
export function youthObject(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new YouthError(); const raw = value as Record<string, unknown>; if (required.some(key => !Object.hasOwn(raw, key)) || Object.keys(raw).some(key => ![...required, ...optional].includes(key))) throw new YouthError(); return raw; }
export function isMobileYouthDate(value: unknown): value is string { if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(value + "T00:00:00.000Z"); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }
export function youthDate(value: unknown, field: string, optional = true): string | null { if (optional && (value === null || value === "")) return null; if (!isMobileYouthDate(value)) throw new YouthError("날짜는 YYYY-MM-DD 형식으로 입력하세요.", "VALIDATION_ERROR", 400, { [field]: "유효한 날짜를 입력하세요." }); return value; }
function text(value: unknown, field: string): string { if (typeof value !== "string" || !value.trim()) throw new YouthError("입력 내용을 확인해 주세요.", "VALIDATION_ERROR", 400, { [field]: "필수 입력 항목입니다." }); return value.trim(); }
function phone(value: unknown): string | null { if (value === null || value === "") return null; if (typeof value !== "string") throw new YouthError(); const normalized = value.trim(); if (!normalized) return null; if (!/^010-\d{3,4}-\d{4}$/.test(normalized)) throw new YouthError("핸드폰 번호는 010-0000-0000 형식으로 입력하세요.", "VALIDATION_ERROR", 400, { phone: "010-0000-0000 형식으로 입력하세요." }); return normalized; }
function contacts(value: unknown): Array<{ relationship: string | null; phone: string | null }> { if (!Array.isArray(value)) throw new YouthError(); return value.flatMap(entry => { const raw = youthObject(entry, ["relationship", "phone"]); if (raw.relationship !== null && typeof raw.relationship !== "string") throw new YouthError(); const relationship = typeof raw.relationship === "string" ? raw.relationship.trim() || null : null, number = phone(raw.phone); return relationship || number ? [{ relationship, phone: number }] : []; }); }
function patchFields(raw: Record<string, unknown>): YouthProfilePatch { const result: YouthProfilePatch = {}; if (Object.hasOwn(raw, "name")) result.name = text(raw.name, "name"); if (Object.hasOwn(raw, "admissionDate")) result.admissionDate = youthDate(raw.admissionDate, "admissionDate"); if (Object.hasOwn(raw, "birthDate")) result.birthDate = youthDate(raw.birthDate, "birthDate"); if (Object.hasOwn(raw, "phone")) result.phone = phone(raw.phone); if (Object.hasOwn(raw, "familyContacts")) result.familyContacts = contacts(raw.familyContacts); return result; }
export function parseYouthCreate(value: unknown): YouthCreateBody { const raw = youthObject(value, ["requestId", "name", "admissionDate", "dischargeDate"], ["birthDate", "phone", "familyContacts", "uploadIds"]); const uploadIds = raw.uploadIds === undefined ? [] : Array.isArray(raw.uploadIds) ? raw.uploadIds.map(id => youthId(id)).sort() : (() => { throw new YouthError(); })(); if (uploadIds.length > 5 || new Set(uploadIds).size !== uploadIds.length) throw new YouthError("새 결정문은 최대 5개까지 첨부할 수 있습니다."); return { ...patchFields(raw), requestId: youthId(raw.requestId, true), name: text(raw.name, "name"), admissionDate: youthDate(raw.admissionDate, "admissionDate"), dischargeDate: youthDate(raw.dischargeDate, "dischargeDate"), uploadIds }; }
export function parseYouthPatch(value: unknown): YouthPatchBody { const raw = youthObject(value, ["requestId", "expectedUpdatedAt", "patch"]), patch = youthObject(raw.patch, [], ["name", "admissionDate", "birthDate", "phone", "familyContacts"]); if (!Object.keys(patch).length) throw new YouthError("변경할 내용을 입력하세요."); return { requestId: youthId(raw.requestId, true), expectedUpdatedAt: youthTimestamp(raw.expectedUpdatedAt), patch: patchFields(patch) }; }
export function parseYouthExtension(value: unknown): YouthExtensionBody { const raw = youthObject(value, ["requestId", "expectedUpdatedAt", "extendedDischargeDate", "reason"]), reason = text(raw.reason, "reason"); if (reason.length > 500) throw new YouthError("퇴소 연장 사유는 500자 이내로 입력하세요.", "VALIDATION_ERROR", 400, { reason: "500자 이내로 입력하세요." }); return { requestId: youthId(raw.requestId, true), expectedUpdatedAt: youthTimestamp(raw.expectedUpdatedAt), extendedDischargeDate: youthDate(raw.extendedDischargeDate, "extendedDischargeDate", false)!, reason }; }
export function youthQuery(url: URL, allowed: readonly string[] = []): Record<string, string> { if (new TextEncoder().encode(url.search).byteLength > 8192) throw new YouthError("조회 조건이 너무 큽니다.", "PAYLOAD_TOO_LARGE", 413); const result: Record<string, string> = {}; for (const key of url.searchParams.keys()) { if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) throw new YouthError(); result[key] = url.searchParams.get(key)!; } return result; }
export function youthPage(value: string | undefined): number { if (value === undefined) return 1; if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new YouthError(); return Number(value); }
export function nextYouthTimestamp(previous: Date, now: Date): Date { return new Date(Math.max(now.getTime(), previous.getTime() + 1)); }

/** JSON.parse validates grammar first; this bounded walk then detects duplicate decoded keys. */
function rejectDuplicateJsonKeys(source: string) {
  let position = 0;
  const space = () => { while (/\s/.test(source[position] ?? "")) position++; };
  const string = () => { const start = position++; while (position < source.length) { if (source[position++] === "\\") position++; else if (source[position - 1] === '"') break; } return JSON.parse(source.slice(start, position)) as string; };
  const value = (depth: number) => {
    if (depth > 64) throw new YouthError();
    space(); const token = source[position];
    if (token === "{") {
      position++; space(); const keys = new Set<string>();
      if (source[position] !== "}") while (true) { space(); const key = string(); if (keys.has(key)) throw new YouthError("중복 입력 항목을 확인해 주세요."); keys.add(key); space(); position++; value(depth + 1); space(); if (source[position] !== ",") break; position++; }
      position++;
    } else if (token === "[") { position++; space(); if (source[position] !== "]") while (true) { value(depth + 1); space(); if (source[position] !== ",") break; position++; } position++; }
    else if (token === '"') string();
    else while (position < source.length && !/[\s,}\]]/.test(source[position])) position++;
  };
  value(0);
}
export async function readYouthJson(request: Request, max = 65536): Promise<unknown> {
  if ((request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") throw new YouthError("JSON 요청이 필요합니다.", "UNSUPPORTED_MEDIA_TYPE", 415);
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new YouthError();
  if (declared !== null && Number(declared) > max) throw new YouthError("요청이 너무 큽니다.", "PAYLOAD_TOO_LARGE", 413);
  if (!request.body) throw new YouthError();
  const reader = request.body.getReader(), chunks: Uint8Array[] = [], deadline = Date.now() + 10000;
  let size = 0;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new YouthError("요청 시간이 초과되었습니다. 입력을 보관하고 다시 시도해 주세요.", "REQUEST_TIMEOUT", 408)); void reader.cancel().catch(() => undefined); }, Math.max(1, deadline - Date.now())); });
      const next = await Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
      if (next.done) break;
      size += next.value.byteLength;
      if (size > max) { void reader.cancel().catch(() => undefined); throw new YouthError("요청이 너무 큽니다.", "PAYLOAD_TOO_LARGE", 413); }
      chunks.push(next.value);
    }
  } catch (error) { if (error instanceof YouthError) throw error; throw new YouthError(); }
  finally { reader.releaseLock(); }
  if (declared !== null && Number(declared) !== size) throw new YouthError();
  try { const source = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size)), value = JSON.parse(source) as unknown; rejectDuplicateJsonKeys(source); return value; }
  catch (error) { if (error instanceof YouthError) throw error; throw new YouthError(); }
}
