import type { DocumentPickerAsset } from "expo-document-picker";

export type DraftField = { name: string; label: string; type: "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "attachments"; required: boolean; placeholder?: string; helpText?: string; options?: { label: string; value: string }[]; visibleWhen?: { field: string; values: string[] } };
export type DraftTemplate = { id: string; name: string; fields: DraftField[]; initialValues: Record<string, string> };
export type DraftOptions = { templates: DraftTemplate[]; approvers: { id: string; name: string; positionName: string }[]; attachmentPolicy: { maxFileCount: number; maxFileSizeMb: number; allowedExtensions: string[] } };
export type DraftAttachment = { id: string; name: string; size: number; mimeType: string };
export type DraftData = { id: string; title: string; templateId: string; status: string; fieldValues: Record<string, string>; approverIds: string[]; updatedAt: string; attachments: DraftAttachment[] };
export type PendingAttachment = DocumentPickerAsset & { key: string; uploadId?: string; uploadUrl?: string; uploaded?: boolean; completed?: boolean };
export type SaveDraftResult = { documentId: string; status: string; updatedAt: string; proof?: import("./draft-recovery-core").DraftCommitProof };
export type DraftList = { total: number; documents: { id: string; title: string; category: string; status: string; updatedAt: string; attachmentCount: number }[] };

export function requestKey() { return "mobile_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
export function fileSize(size: number) { return size < 1024 * 1024 ? Math.ceil(size / 1024) + "KB" : (size / (1024 * 1024)).toFixed(1) + "MB"; }
export function attachmentError(file: DocumentPickerAsset, policy: DraftOptions["attachmentPolicy"]) {
  const extension = file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  if (!extension || !policy.allowedExtensions.includes(extension)) return "허용되지 않는 파일 형식입니다: " + file.name;
  if (!file.size || file.size > policy.maxFileSizeMb * 1024 * 1024) return "파일은 " + policy.maxFileSizeMb + "MB 이하만 등록할 수 있습니다: " + file.name;
  return null;
}
