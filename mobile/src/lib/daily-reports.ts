import type { MobileDailyReportDetailResponse, MobileDailyReportEditorResponse, MobileDailyReportEntry, MobileDailyReportFilter, MobileDailyReportMutationResponse, MobileDailyReportSaveInput } from "@/lib/types";

export const dailyReportMainLimit = 10000;
export const dailyReportYouthLimit = 4000;
export const dailyReportYouthCountLimit = 200;
export const dailyReportBodyLimit = 8 * 1024 * 1024;
export type DailyReportValues = { mainContent: string; youthContents: Record<string, string> };
export type DailyReportErrors = Record<string, string>;

export function isDailyReportDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function formatDailyReportDate(value: string) {
  if (!isDailyReportDate(value)) return "날짜 확인 필요";
  const [year, month, day] = value.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}
export function formatDailyReportTimestamp(value: string | null) {
  if (!value) return "없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 확인 필요";
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}
export function dailyReportStatus(entry: { submittedAt: string | null; reviewedAt: string | null } | null): { value: "missing" | "draft" | "submitted" | "reviewed"; label: string; tone: "secondary" | "accent" | "success" } {
  return !entry ? { value: "missing", label: "미작성", tone: "secondary" } : !entry.submittedAt ? { value: "draft", label: "임시저장", tone: "secondary" } : entry.reviewedAt ? { value: "reviewed", label: "확인 완료", tone: "success" } : { value: "submitted", label: "제출 완료", tone: "accent" };
}
export function normalizeDailyReportFilter(value: unknown): MobileDailyReportFilter {
  return value === "unread" || value === "missing" || value === "reviewed" ? value : "all";
}
export function dailyReportPage(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : 1;
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 100000) : 1;
}
export function isDailyReportId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const stamp = (value: unknown) => typeof value === "string" && value.length > 0 && !Number.isNaN(new Date(value).getTime());
const nullableStamp = (value: unknown) => value === null || stamp(value);
export function isDailyReportEntry(value: unknown): value is MobileDailyReportEntry {
  if (!record(value) || !isDailyReportId(value.id) || typeof value.workDate !== "string" || !isDailyReportDate(value.workDate) || typeof value.mainContent !== "string" || !isDailyReportId(value.authorId) || typeof value.authorName !== "string" || typeof value.departmentName !== "string" || !Number.isInteger(value.version) || Number(value.version) < 1 || Number(value.version) > 2147483647 || !nullableStamp(value.submittedAt) || !nullableStamp(value.reviewedAt) || (value.reviewedByName !== null && typeof value.reviewedByName !== "string") || !stamp(value.updatedAt) || !Array.isArray(value.youthReports)) return false;
  if (value.reviewedAt && !value.submittedAt) return false;
  const ids = new Set<string>();
  return value.youthReports.every(note => {
    if (!record(note) || !isDailyReportId(note.youthId) || ids.has(note.youthId) || typeof note.youthName !== "string" || typeof note.content !== "string") return false;
    ids.add(note.youthId); return true;
  });
}
export function isDailyReportEditor(value: unknown, expectedDate?: string): value is MobileDailyReportEditorResponse {
  if (!record(value) || value.mode !== "employee" || typeof value.today !== "string" || !isDailyReportDate(value.today) || typeof value.selectedDate !== "string" || !isDailyReportDate(value.selectedDate) || value.selectedDate > value.today || (expectedDate !== undefined && value.selectedDate !== expectedDate) || typeof value.userName !== "string" || typeof value.canWrite !== "boolean" || !Array.isArray(value.recipients) || !value.recipients.every(name => typeof name === "string") || !Array.isArray(value.youths)) return false;
  const ids = new Set<string>();
  if (!value.youths.every(youth => {
    if (!record(youth) || !isDailyReportId(youth.id) || ids.has(youth.id) || typeof youth.name !== "string") return false;
    ids.add(youth.id); return true;
  })) return false;
  return value.entry === null || (isDailyReportEntry(value.entry) && value.entry.workDate === value.selectedDate && value.entry.youthReports.every(note => ids.has(note.youthId)));
}
export function isDailyReportDetail(value: unknown, expectedId: string): value is MobileDailyReportDetailResponse {
  return record(value) && (value.mode === "employee" || value.mode === "director") && typeof value.today === "string" && isDailyReportDate(value.today) && typeof value.canWrite === "boolean" && typeof value.canReview === "boolean" && isDailyReportEntry(value.entry) && value.entry.id === expectedId && value.entry.workDate <= value.today && (value.mode !== "director" || (!!value.entry.submittedAt && !value.canWrite)) && (!value.canReview || (value.mode === "director" && !!value.entry.submittedAt && !value.entry.reviewedAt));
}
export function isDailyReportMutation(value: unknown, date: string, expectedId?: string): value is MobileDailyReportMutationResponse {
  return record(value) && value.ok === true && typeof value.message === "string" && isDailyReportEntry(value.entry) && value.entry.workDate === date && (expectedId === undefined || value.entry.id === expectedId);
}
export function dailyReportValues(entry: MobileDailyReportEntry | null): DailyReportValues {
  return { mainContent: entry?.mainContent ?? "", youthContents: Object.fromEntries(entry?.youthReports.map(note => [note.youthId, note.content]) ?? []) };
}
export function permittedDailyReportValues(values: DailyReportValues, youths: { id: string }[]): DailyReportValues {
  const allowed = new Set(youths.map(youth => youth.id));
  return { mainContent: values.mainContent, youthContents: Object.fromEntries(Object.entries(values.youthContents).filter(([id]) => allowed.has(id))) };
}
export function dailyReportSaveInput(date: string, values: DailyReportValues, version: number, intent: "draft" | "submit", youths: { id: string }[]): MobileDailyReportSaveInput {
  const allowed = new Set(youths.map(youth => youth.id));
  return { workDate: date, mainContent: values.mainContent.trim(), youthReports: Object.entries(values.youthContents).filter(([id, content]) => allowed.has(id) && content.trim()).map(([youthId, content]) => ({ youthId, content: content.trim() })).sort((a, b) => a.youthId.localeCompare(b.youthId)), version, intent };
}
export function dailyReportUtf8Size(value: string) {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 128) bytes++; else if (code < 2048) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) { bytes += 4; index++; }
    else bytes += 3;
  }
  return bytes;
}
export function validateDailyReportInput(input: MobileDailyReportSaveInput, today: string): DailyReportErrors {
  const errors: DailyReportErrors = {};
  if (!isDailyReportDate(input.workDate)) errors.workDate = "보고일을 YYYY-MM-DD 형식으로 입력하세요.";
  else if (input.workDate > today) errors.workDate = "오늘 이후 날짜에는 보고할 수 없습니다.";
  if (input.intent === "submit" && !input.mainContent.trim()) errors.mainContent = "주요 업무보고를 입력하세요.";
  else if (input.mainContent.trim().length > dailyReportMainLimit) errors.mainContent = "주요 업무보고는 10,000자 이하로 입력하세요.";
  if (input.youthReports.length > 200) errors.youthReports = "청소년 보고는 200명 이하로 작성하세요.";
  const ids = new Set<string>();
  for (const note of input.youthReports) {
    if (!isDailyReportId(note.youthId) || ids.has(note.youthId)) errors.youthReports = "청소년 명단을 다시 확인하세요.";
    ids.add(note.youthId);
    if (note.content.trim().length > 4000) errors[`youth-${note.youthId}`] = "청소년별 보고는 4,000자 이하로 입력하세요.";
  }
  if (JSON.stringify(input.youthReports).length > 900000) errors.youthReports = "청소년별 보고의 전체 분량을 줄여 주세요.";
  if (dailyReportUtf8Size(JSON.stringify(input)) > dailyReportBodyLimit) errors.youthReports = "보고서 전체 분량이 너무 큽니다. 내용을 줄여 주세요.";
  return errors;
}
export function dailyReportSavedMatches(entry: MobileDailyReportEntry | null, attempt: MobileDailyReportSaveInput) {
  if (!entry || entry.workDate !== attempt.workDate || entry.version <= attempt.version || (attempt.intent === "submit" ? !entry.submittedAt : !!entry.submittedAt)) return false;
  const saved = dailyReportSaveInput(entry.workDate, dailyReportValues(entry), entry.version, attempt.intent, entry.youthReports.map(note => ({ id: note.youthId })));
  return saved.mainContent === attempt.mainContent && JSON.stringify(saved.youthReports) === JSON.stringify(attempt.youthReports);
}
export function dailyReportDirty(values: DailyReportValues, entry: MobileDailyReportEntry | null, date: string, youths: { id: string }[]) {
  const intent = entry?.submittedAt ? "submit" : "draft";
  const input = dailyReportSaveInput(date, values, entry?.version ?? 0, intent, youths);
  const baseline = dailyReportSaveInput(date, dailyReportValues(entry), entry?.version ?? 0, intent, youths);
  return input.mainContent !== baseline.mainContent || JSON.stringify(input.youthReports) !== JSON.stringify(baseline.youthReports);
}
