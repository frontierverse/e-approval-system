import type { MobileWorkLogDate, MobileWorkLogDelete, MobileWorkLogEntry, MobileWorkLogLinkedSchedule, MobileWorkLogLinkedScheduleState, MobileWorkLogPage, MobileWorkLogRecent, MobileWorkLogSave, MobileWorkLogSaveInput } from "@/lib/types";

export const workLogKeywordLimit = 100;
export const workLogContentLimit = 5000;
export type WorkLogValues = { keyword: string; content: string };
export type WorkLogErrors = Record<string, string>;
export type WorkLogTarget = { pathname: "/tasks/[id]" | "/documents/[id]" | "/attachments/[id]"; params: { id: string } };
export function isWorkLogDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
// Omission alone requests KST today. Arrays, blank or invalid explicit values remain errors.
export function workLogDate(value: unknown): string | undefined { return value === undefined ? undefined : typeof value === "string" ? value : "invalid-date"; }
export function formatWorkLogDate(value: string) { if (!isWorkLogDate(value)) return "날짜 확인 필요"; const [year, month, day] = value.split("-").map(Number); return `${year}년 ${month}월 ${day}일`; }
export function formatWorkLogTimestamp(value: string | null) {
  if (!value) return "없음";
  const date = new Date(value); if (Number.isNaN(date.getTime())) return "날짜 확인 필요";
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}
export function formatWorkLogMinute(value: number) { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const nullableText = (value: unknown) => value === null || text(value);
const id = (value: unknown): value is string => text(value) && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const stamp = (value: unknown): value is string => text(value) && value.length > 0 && Number.isFinite(new Date(value).getTime());
export const isWorkLogToken = (value: unknown): value is string => stamp(value) && new Date(value).toISOString() === value;
const date = (value: unknown): value is string => text(value) && isWorkLogDate(value);
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const unique = <T>(items: T[], get: (item: T) => string) => new Set(items.map(get)).size === items.length;
const identity = (value: Record<string, unknown>) => (value.manualLogId === null && value.manualUpdatedAt === null) || (id(value.manualLogId) && isWorkLogToken(value.manualUpdatedAt));
export function isWorkLogEntry(value: unknown, expectedDate?: string): value is MobileWorkLogEntry {
  if (!record(value) || !date(value.workDate) || value.id !== value.workDate || (expectedDate !== undefined && value.workDate !== expectedDate) || !text(value.keyword) || !text(value.content) || !text(value.authorName) || !stamp(value.createdAt) || !stamp(value.updatedAt) || !nullableText(value.updatedByName) || !identity(value) || !Array.isArray(value.completedTasks) || !Array.isArray(value.meetingDocuments)) return false;
  if (value.manualLogId === null && value.content !== "") return false;
  if (!value.completedTasks.every(task => record(task) && id(task.id) && text(task.title) && nullableText(task.description) && nullableText(task.meetingTitle) && stamp(task.completedAt)) || !unique(value.completedTasks, task => task.id)) return false;
  if (!value.meetingDocuments.every(meeting => record(meeting) && id(meeting.id) && text(meeting.title) && meeting.meetingDate === value.workDate && nullableText(meeting.documentNo) && meeting.status === "APPROVED" && Array.isArray(meeting.attachments) && meeting.attachments.every(file => record(file) && id(file.id) && text(file.name) && text(file.mimeType) && count(file.size) && typeof file.isSigned === "boolean" && (file.previewKind === null || file.previewKind === "pdf" || file.previewKind === "image")) && unique(meeting.attachments, file => file.id)) || !unique(value.meetingDocuments, meeting => meeting.id)) return false;
  return true;
}
export function isWorkLogScheduleState(value: unknown): value is MobileWorkLogLinkedScheduleState {
  return record(value) && (value.status === "error" || (value.status === "ready" && Array.isArray(value.schedules) && value.schedules.every(item => record(item) && id(item.id) && id(item.youthId) && text(item.youthName) && text(item.content) && Number.isInteger(item.startMinute) && Number.isInteger(item.endMinute) && Number(item.startMinute) >= 0 && Number(item.endMinute) <= 1440 && Number(item.startMinute) < Number(item.endMinute)) && unique(value.schedules, item => item.id)));
}
function isRecent(value: unknown): value is MobileWorkLogRecent { return record(value) && date(value.workDate) && value.id === value.workDate && text(value.keyword) && typeof value.hasManual === "boolean" && value.hasManual === (value.manualLogId !== null) && identity(value) && stamp(value.createdAt) && stamp(value.updatedAt) && count(value.completedTaskCount) && count(value.meetingDocumentCount) && count(value.meetingAttachmentCount); }
export function isWorkLogPage(value: unknown, expectedDate?: string): value is MobileWorkLogPage {
  return record(value) && date(value.today) && date(value.selectedDate) && value.selectedDate <= value.today && (expectedDate === undefined ? value.selectedDate === value.today : value.selectedDate === expectedDate) && text(value.userName) && Array.isArray(value.contributionDates) && value.contributionDates.every(item => date(item) && item <= String(value.today)) && unique(value.contributionDates, item => item) && Array.isArray(value.recentLogs) && value.recentLogs.length <= 12 && value.recentLogs.every(item => isRecent(item) && item.workDate <= String(value.today)) && unique(value.recentLogs, item => item.workDate) && (value.selectedEntry === null || isWorkLogEntry(value.selectedEntry, value.selectedDate)) && isWorkLogScheduleState(value.linkedScheduleState);
}
export function isWorkLogDateResponse(value: unknown, expectedDate: string): value is MobileWorkLogDate { return record(value) && date(value.today) && value.workDate === expectedDate && date(value.workDate) && value.workDate <= value.today && (value.entry === null || isWorkLogEntry(value.entry, expectedDate)) && isWorkLogScheduleState(value.linkedScheduleState); }
export function workLogValues(entry: MobileWorkLogEntry | null): WorkLogValues { return entry?.manualLogId ? { keyword: entry.keyword, content: entry.content } : { keyword: "", content: "" }; }
export function workLogSaveInput(workDate: string, values: WorkLogValues, entry: MobileWorkLogEntry | null): MobileWorkLogSaveInput { return { workDate, keyword: values.keyword.trim(), content: values.content.trim(), manualLogId: entry?.manualLogId ?? null, expectedUpdatedAt: entry?.manualUpdatedAt ?? "" }; }
export function workLogDirty(values: WorkLogValues, entry: MobileWorkLogEntry | null) { const baseline = workLogValues(entry); return values.keyword.trim() !== baseline.keyword.trim() || values.content.trim() !== baseline.content.trim(); }
export function validateWorkLogInput(input: MobileWorkLogSaveInput, today: string): WorkLogErrors {
  const errors: WorkLogErrors = {};
  if (!isWorkLogDate(input.workDate)) errors.workDate = "기록일을 YYYY-MM-DD 형식으로 입력하세요."; else if (input.workDate > today) errors.workDate = "오늘 이후 날짜에는 작성할 수 없습니다.";
  if (!input.keyword.trim()) errors.keyword = "키워드를 입력하세요."; else if (input.keyword.trim().length > workLogKeywordLimit) errors.keyword = "키워드는 100자 이하로 입력하세요.";
  if (!input.content.trim()) errors.content = "업무 내용을 입력하세요."; else if (input.content.trim().length > workLogContentLimit) errors.content = "업무 내용은 5,000자 이하로 입력하세요.";
  if (input.manualLogId === null ? input.expectedUpdatedAt !== "" : !id(input.manualLogId) || !isWorkLogToken(input.expectedUpdatedAt)) errors.expectedUpdatedAt = "최신 기록을 확인한 뒤 저장하세요.";
  return errors;
}
export function workLogSavedMatches(entry: MobileWorkLogEntry | null, input: MobileWorkLogSaveInput, baseline: MobileWorkLogEntry | null = null) {
  if (!entry?.manualLogId || entry.workDate !== input.workDate || entry.keyword !== input.keyword || entry.content !== input.content || !isWorkLogToken(entry.manualUpdatedAt)) return false;
  if (input.manualLogId === null) return true;
  if (entry.manualLogId !== input.manualLogId) return false;
  if (entry.manualUpdatedAt > input.expectedUpdatedAt) return true;
  return entry.manualUpdatedAt === input.expectedUpdatedAt && baseline?.manualLogId === input.manualLogId && baseline.manualUpdatedAt === input.expectedUpdatedAt && baseline.keyword === input.keyword && baseline.content === input.content;
}
export function isWorkLogSave(value: unknown, input: MobileWorkLogSaveInput, baseline: MobileWorkLogEntry | null): value is MobileWorkLogSave { return record(value) && value.ok === true && text(value.message) && (value.change === "create" || value.change === "update" || value.change === "unchanged") && isWorkLogEntry(value.entry, input.workDate) && workLogSavedMatches(value.entry, input, baseline) && (value.change === "create" ? input.manualLogId === null : value.change === "update" ? input.manualLogId !== null && String(value.entry.manualUpdatedAt) > input.expectedUpdatedAt : input.manualLogId !== null && value.entry.manualUpdatedAt === input.expectedUpdatedAt); }
export function isWorkLogDelete(value: unknown, workDate: string, manualLogId: string): value is MobileWorkLogDelete { return record(value) && value.ok === true && text(value.message) && (value.change === "deleted" || value.change === "missing") && value.deletedId === manualLogId && value.workDate === workDate && (value.entry === null || (isWorkLogEntry(value.entry, workDate) && value.entry.manualLogId !== manualLogId)); }
export function mergeWorkLogSchedules(content: string, schedules: MobileWorkLogLinkedSchedule[]) {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
  const lines = new Set(content.split(/\r?\n/).map(normalize)); let result = content; let added = 0; let skipped = 0;
  const sorted = [...schedules].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.youthName.localeCompare(b.youthName, "ko") || a.content.localeCompare(b.content, "ko") || a.id.localeCompare(b.id));
  for (const item of sorted) {
    const line = `${formatWorkLogMinute(item.startMinute)}-${formatWorkLogMinute(item.endMinute)} ${normalize(item.youthName)} · ${normalize(item.content)}`;
    if (lines.has(line)) continue;
    lines.add(line); const next = result.trimEnd() ? `${result.trimEnd()}\n${line}` : line;
    if (next.length > workLogContentLimit) { skipped++; continue; }
    result = next; added++;
  }
  return { content: added ? result : content, added, skipped };
}
export function workLogHeatmap(today: string) {
  if (!isWorkLogDate(today)) return [];
  const end = new Date(`${today}T00:00:00.000Z`); const start = new Date(end); start.setUTCDate(start.getUTCDate() - start.getUTCDay() - 52 * 7);
  return Array.from({ length: 53 }, (_, week) => Array.from({ length: 7 }, (_, day) => { const item = new Date(start); item.setUTCDate(item.getUTCDate() + week * 7 + day); return item.toISOString().slice(0, 10); }));
}
