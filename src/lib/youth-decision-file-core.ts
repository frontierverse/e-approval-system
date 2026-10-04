import { defaultAllowedAttachmentExtensions } from "@/lib/attachment-policy-core";
import { YouthError, youthId, youthObject, youthTimestamp } from "@/lib/mobile-youth-core";
export const youthDecisionMaxFileSize = 30 * 1024 * 1024;
export const youthDecisionPolicy = { maxNewFileCount: 5, maxFileSize: youthDecisionMaxFileSize, allowedExtensions: defaultAllowedAttachmentExtensions };
export type YouthDecisionUploadInput = { requestId: string; targetYouthId: string | null; originalName: string; mimeType: string; size: number; wholeSha256: string };
export type YouthDecisionUploadDto = { id: string; requestId: string; targetYouthId: string | null; state: "uploading" | "finalizing" | "ready" | "consumed" | "deleting" | "expired" | "deleted" | "purged"; expiresAt: string; file: { originalName: string; mimeType: string; size: number } | null; consumed: { youthId: string; documentId: string; requestId: string } | null };
export function youthDecisionFilename(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || /[\x00-\x1f\x7f/\\]/.test(value) || value === "." || value === ".." || new TextEncoder().encode(value).byteLength > 1024) throw new YouthError("결정문 파일 이름을 확인해 주세요.", "ATTACHMENT_POLICY", 400);
  const name = value.trim(), extension = name.lastIndexOf(".") < 0 ? "" : name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!extension || !defaultAllowedAttachmentExtensions.includes(extension)) throw new YouthError("허용된 확장자의 결정문을 선택하세요.", "ATTACHMENT_POLICY", 400);
  return name;
}
export function parseYouthDecisionUpload(value: unknown): YouthDecisionUploadInput {
  const raw = youthObject(value, ["requestId", "targetYouthId", "originalName", "mimeType", "size", "wholeSha256"]);
  if (!Number.isSafeInteger(raw.size) || (raw.size as number) < 1 || (raw.size as number) > youthDecisionMaxFileSize || typeof raw.wholeSha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.wholeSha256)) throw new YouthError("파일 크기와 검증 정보를 확인해 주세요.", "ATTACHMENT_POLICY", 400);
  if (typeof raw.mimeType !== "string" || !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(raw.mimeType) || raw.mimeType.length > 127) throw new YouthError("파일 형식을 확인해 주세요.", "ATTACHMENT_POLICY", 400);
  return { requestId: youthId(raw.requestId, true), targetYouthId: raw.targetYouthId === null ? null : youthId(raw.targetYouthId), originalName: youthDecisionFilename(raw.originalName), mimeType: raw.mimeType, size: raw.size as number, wholeSha256: raw.wholeSha256 };
}
export function parseYouthUploadIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) throw new YouthError("새 결정문은 한 번에 1~5개 첨부할 수 있습니다.");
  const ids = value.map(id => youthId(id)).sort(); if (new Set(ids).size !== ids.length) throw new YouthError(); return ids;
}
export function parseYouthDocumentAttach(value: unknown) { const raw = youthObject(value, ["requestId", "expectedYouthUpdatedAt", "uploadIds"]); return { requestId: youthId(raw.requestId, true), expectedYouthUpdatedAt: youthTimestamp(raw.expectedYouthUpdatedAt), uploadIds: parseYouthUploadIds(raw.uploadIds) }; }
export function parseYouthDocumentDelete(value: unknown) { const raw = youthObject(value, ["requestId", "youthId", "expectedYouthUpdatedAt", "expectedDocumentUpdatedAt"]); return { requestId: youthId(raw.requestId, true), youthId: youthId(raw.youthId), expectedYouthUpdatedAt: youthTimestamp(raw.expectedYouthUpdatedAt), expectedDocumentUpdatedAt: youthTimestamp(raw.expectedDocumentUpdatedAt) }; }
export const youthDecisionDownloadReasons = ["CASE_SUPPORT", "EXTERNAL_SUBMISSION", "INTERNAL_REVIEW", "OTHER"] as const;
export type YouthDecisionDownloadInput = { requestId: string; reason: typeof youthDecisionDownloadReasons[number]; reasonDetail: string | null };
export function parseYouthDecisionDownload(value: unknown): YouthDecisionDownloadInput {
  const raw = youthObject(value, ["requestId", "reason"], ["reasonDetail"]);
  if (!youthDecisionDownloadReasons.includes(raw.reason as YouthDecisionDownloadInput["reason"])) throw new YouthError("결정문 다운로드 사유를 선택하세요.", "INVALID_REASON", 400);
  if (raw.reasonDetail !== undefined && raw.reasonDetail !== null && typeof raw.reasonDetail !== "string") throw new YouthError();
  const reasonDetail = typeof raw.reasonDetail === "string" ? raw.reasonDetail.trim() || null : null;
  if ((raw.reason === "OTHER" && !reasonDetail) || (reasonDetail?.length ?? 0) > 200) throw new YouthError("기타 사유는 200자 이내로 입력하세요.", "INVALID_REASON", 400);
  return { requestId: youthId(raw.requestId, true), reason: raw.reason as YouthDecisionDownloadInput["reason"], reasonDetail };
}
export function youthDecisionDisposition(name: string) {
  const clean = name.replace(/[\x00-\x1f\x7f/\\]/g, "_") || "decision-document";
  const fallback = clean.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(clean).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
