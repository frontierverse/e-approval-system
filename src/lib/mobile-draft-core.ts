import { createHash } from "node:crypto";

export class MobileDraftError extends Error {
  constructor(message: string, public status = 400, public fields?: Record<string, string>) { super(message); }
}

export type MobileDraftInput = {
  requestId: string;
  title: string;
  templateId: string;
  fieldValues: Record<string, string>;
  approverIds: string[];
  uploadIds: string[];
  intent: "draft" | "submit";
  expectedUpdatedAt: string | null;
};

export function parseMobileDraft(value: unknown): MobileDraftInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MobileDraftError("기안 정보가 올바르지 않습니다.");
  const v = value as Record<string, unknown>;
  if (typeof v.requestId !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(v.requestId)) throw new MobileDraftError("저장 요청을 확인할 수 없습니다. 화면을 다시 열어주세요.");
  if (v.intent !== "draft" && v.intent !== "submit") throw new MobileDraftError("저장 또는 상신을 선택하세요.");
  if (typeof v.title !== "string" || typeof v.templateId !== "string" || v.title.length > 120 || v.templateId.length > 128) throw new MobileDraftError("제목은 120자 이내로 입력하고 양식을 선택하세요.");
  if (!v.fieldValues || typeof v.fieldValues !== "object" || Array.isArray(v.fieldValues)) throw new MobileDraftError("입력 내용을 확인하세요.");
  const entries = Object.entries(v.fieldValues);
  if (entries.length > 50 || entries.some(([key, val]) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || key === "constructor" || key === "__proto__" || typeof val !== "string" || val.length > 5000)) throw new MobileDraftError("양식 입력 내용이 올바르지 않습니다.");
  const ids = (name: string, max: number) => {
    const raw = v[name];
    if (!Array.isArray(raw) || raw.length > max || raw.some(id => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id))) throw new MobileDraftError("결재자 또는 첨부파일 정보가 올바르지 않습니다.");
    if (new Set(raw).size !== raw.length) throw new MobileDraftError("결재자와 첨부파일을 중복 지정할 수 없습니다.");
    return raw as string[];
  };
  const expectedUpdatedAt = v.expectedUpdatedAt == null ? null : v.expectedUpdatedAt;
  if (expectedUpdatedAt !== null && (typeof expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(expectedUpdatedAt)))) throw new MobileDraftError("문서 수정 정보를 확인할 수 없습니다.");
  return { requestId: v.requestId, title: v.title.trim(), templateId: v.templateId.trim(), fieldValues: Object.fromEntries(entries.map(([key, val]) => [key, (val as string).trim()])), approverIds: ids("approverIds", 20), uploadIds: ids("uploadIds", 10), intent: v.intent, expectedUpdatedAt };
}

export function mobileDraftDigest(input: MobileDraftInput, documentId: string | null) {
  const { requestId, ...payload } = input;
  void requestId;
  return createHash("sha256").update(JSON.stringify({ ...payload, fieldValues: Object.fromEntries(Object.entries(input.fieldValues).sort(([a], [b]) => a.localeCompare(b))), documentId })).digest("hex");
}

export function parseMobileUpload(value: unknown, policy: { allowedExtensions: string[]; maxFileSizeMb: number }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MobileDraftError("첨부파일 정보가 올바르지 않습니다.");
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string" || !v.name.trim() || v.name.length > 180 || /[\\/\u0000-\u001f]/.test(v.name)) throw new MobileDraftError("첨부파일 이름이 올바르지 않습니다.");
  const name = v.name.trim();
  const extension = name.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  if (!extension || !policy.allowedExtensions.map(e => e.toLowerCase()).includes(extension)) throw new MobileDraftError(`허용되지 않는 파일 형식입니다: ${name}`);
  if (typeof v.size !== "number" || !Number.isSafeInteger(v.size) || v.size <= 0 || v.size > policy.maxFileSizeMb * 1024 * 1024) throw new MobileDraftError(`파일은 ${policy.maxFileSizeMb}MB 이하만 등록할 수 있습니다.`);
  if (v.mimeType != null && (typeof v.mimeType !== "string" || v.mimeType.length > 128 || /[\r\n]/.test(v.mimeType))) throw new MobileDraftError("첨부파일 형식이 올바르지 않습니다.");
  return { originalName: name, size: v.size, mimeType: typeof v.mimeType === "string" && v.mimeType ? v.mimeType : "application/octet-stream" };
}
