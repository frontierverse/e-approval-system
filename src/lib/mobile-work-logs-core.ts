import { getWorkLogToday, isWorkLogDate, isExactWorkLogTimestamp, normalizeWorkLogFormValues, validateWorkLogFormValues, type WorkLogEntry } from "@/lib/work-log-core";
import { getAttachmentPreviewKind } from "@/lib/attachment-preview";
import type { WorkLogSaveInput } from "@/lib/work-log-mutations";

export class MobileWorkLogRequestError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_REQUEST", public fields?: Record<string, string>) { super(message); }
}
export function parseMobileWorkLogDate(value: unknown, today = getWorkLogToday()): string {
  if (typeof value !== "string" || !isWorkLogDate(value) || value > today) throw new MobileWorkLogRequestError("오늘 또는 이전 날짜를 선택해 주세요.", 400, "INVALID_REQUEST", { workDate: "날짜를 다시 선택해 주세요." });
  return value;
}
export function parseMobileWorkLogQuery(params: URLSearchParams, today: string, allowDate = true) {
  for (const key of params.keys()) if (!allowDate || key !== "date" || params.getAll(key).length !== 1) throw new MobileWorkLogRequestError("조회 조건을 확인해 주세요.");
  return allowDate ? parseMobileWorkLogDate(params.get("date") ?? today, today) : undefined;
}
function inputObject(input: unknown, allowed: readonly string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new MobileWorkLogRequestError("업무일지 입력 정보를 확인해 주세요.");
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some(key => !allowed.includes(key))) throw new MobileWorkLogRequestError("지원하지 않는 입력 항목이 있습니다.");
  return raw;
}
export function parseMobileWorkLogSave(input: unknown, today = getWorkLogToday()): WorkLogSaveInput & { manualLogId: string | null } {
  const raw = inputObject(input, ["workDate", "keyword", "content", "manualLogId", "expectedUpdatedAt"]), fields: Record<string, string> = {}, form = new FormData();
  for (const key of ["workDate", "keyword", "content"] as const) {
    if (typeof raw[key] !== "string") fields[key] = "문자로 입력해 주세요.";
    form.set(key, typeof raw[key] === "string" ? raw[key] : "");
  }
  const values = normalizeWorkLogFormValues(form);
  Object.assign(fields, validateWorkLogFormValues(values, today));
  if (typeof raw.workDate === "string" && (!isWorkLogDate(raw.workDate) || raw.workDate > today)) fields.workDate = "날짜를 다시 선택해 주세요.";
  const id = raw.manualLogId, token = raw.expectedUpdatedAt;
  if (!(id === null || (typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id)))) fields.manualLogId = "업무일지 정보를 확인해 주세요.";
  if (typeof token !== "string" || (id === null ? token !== "" : !isExactWorkLogTimestamp(token))) fields.expectedUpdatedAt = "최신 업무일지 정보를 확인해 주세요.";
  if (Object.keys(fields).length) throw new MobileWorkLogRequestError("입력 내용을 확인해 주세요.", 400, "INVALID_REQUEST", fields);
  return { values, manualLogId: id as string | null, expectedUpdatedAt: token as string };
}
export function parseMobileWorkLogDelete(input: unknown) {
  const raw = inputObject(input, ["manualLogId", "expectedUpdatedAt"]), fields: Record<string, string> = {};
  if (typeof raw.manualLogId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(raw.manualLogId)) fields.manualLogId = "삭제할 업무일지 정보를 확인해 주세요.";
  if (typeof raw.expectedUpdatedAt !== "string" || !isExactWorkLogTimestamp(raw.expectedUpdatedAt)) fields.expectedUpdatedAt = "최신 업무일지 정보를 확인해 주세요.";
  if (Object.keys(fields).length) throw new MobileWorkLogRequestError("삭제할 업무일지 정보를 확인해 주세요.", 400, "INVALID_REQUEST", fields);
  return { manualLogId: raw.manualLogId as string, expectedUpdatedAt: raw.expectedUpdatedAt as string };
}
export function toMobileWorkLogEntry(entry: WorkLogEntry, authorName?: string) {
  return { id: entry.workDate, workDate: entry.workDate, keyword: entry.keyword, content: entry.content,
    authorName: authorName ?? entry.authorName, createdAt: entry.createdAt, updatedAt: entry.updatedAt, updatedByName: entry.updatedByName,
    manualLogId: entry.manualLogId ?? null, manualUpdatedAt: entry.manualUpdatedAt ?? null,
    completedTasks: (entry.completedTasks ?? []).map(task => ({ id: task.id, title: task.title, description: task.description, meetingTitle: task.meetingTitle, completedAt: task.completedAt })),
    meetingDocuments: (entry.meetingDocuments ?? []).map(document => ({ id: document.id, title: document.title, meetingDate: document.meetingDate, documentNo: document.documentNo, status: "APPROVED" as const,
      attachments: document.attachments.map(file => ({ id: file.id, name: file.originalName, mimeType: file.mimeType, size: file.size, isSigned: file.isSigned, previewKind: getAttachmentPreviewKind(file.originalName, file.mimeType) })) })),
  };
}
export function toMobileWorkLogRecent(entry: WorkLogEntry) {
  return { id: entry.workDate, workDate: entry.workDate, keyword: entry.keyword, hasManual: Boolean(entry.manualLogId), manualLogId: entry.manualLogId ?? null, manualUpdatedAt: entry.manualUpdatedAt ?? null,
    createdAt: entry.createdAt, updatedAt: entry.updatedAt, completedTaskCount: entry.completedTasks?.length ?? 0, meetingDocumentCount: entry.meetingDocuments?.length ?? 0,
    meetingAttachmentCount: (entry.meetingDocuments ?? []).reduce((count, document) => count + document.attachments.length, 0) };
}
