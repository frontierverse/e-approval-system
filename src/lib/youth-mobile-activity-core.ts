import { YouthError } from "@/lib/mobile-youth-core";
import { normalizeYouthPersonalScheduleInput, isYouthPersonalScheduleDate, isYouthPersonalScheduleMonth } from "@/lib/youth-personal-schedule-core";
import { isYouthCommonScheduleStartMinute, isYouthCommonScheduleEndMinute } from "@/lib/youth-common-schedule-time";
import { isYouthRuleCategory, youthRuleDetailMaxLength } from "@/lib/youth-management-core";
import { isYouthStudySubunitId, validateYouthStudyConceptContent } from "@/lib/youth-subject-progress-core";

export function activityObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new YouthError("입력 형식을 확인하세요.", "INVALID_REQUEST", 400);
  return value as Record<string, unknown>;
}
export function activityId(value: unknown, request = false): string {
  if (typeof value !== "string" || !(request ? /^[A-Za-z0-9_-]{8,128}$/ : /^[A-Za-z0-9_-]{1,128}$/).test(value)) throw new YouthError("대상을 다시 선택하세요.", "INVALID_REQUEST", 400);
  return value;
}
export function activityToken(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new YouthError("최신 내용을 다시 확인하세요.", "INVALID_REQUEST", 400);
  return value;
}
export function activityPage(value: unknown): number {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new YouthError("페이지를 확인하세요.", "INVALID_REQUEST", 400);
  return Number(value);
}
export function activityQuery(url: URL, allowed: readonly string[]): Record<string, string> {
  if (new TextEncoder().encode(url.search).byteLength > 8192 || /%(?![\da-f]{2})/i.test(url.search)) throw new YouthError("조회 조건을 확인하세요.", "INVALID_REQUEST", 400);
  try { decodeURIComponent(url.search.replace(/\+/g, " ")); } catch { throw new YouthError("조회 조건을 확인하세요.", "INVALID_REQUEST", 400); }
  const result: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (!allowed.includes(key) || Object.hasOwn(result, key)) throw new YouthError("조회 조건을 확인하세요.", "INVALID_REQUEST", 400);
    result[key] = value;
  }
  return result;
}
export function personalQuery(url: URL, today: string) {
  const query = activityQuery(url, ["month", "date"]), date = query.date ?? (query.month ? (query.month === today.slice(0, 7) ? today : `${query.month}-01`) : today), month = query.month ?? date.slice(0, 7);
  if (!isYouthPersonalScheduleDate(date) || !isYouthPersonalScheduleMonth(month) || date.slice(0, 7) !== month) throw new YouthError("날짜와 월을 확인하세요.", "INVALID_REQUEST", 400);
  return { date, month };
}
export function parsePersonalInput(value: unknown) {
  const input = activityObject(value, ["content", "startMinute", "endMinute", "selectionMode", "occurrenceDates", "recurrenceWeekdays", "recurrenceStartDate", "recurrenceEndDate", "scheduleType", "hospitalName", "escortType", "escortUserId", "escortOtherName", "nextAppointmentDate"]);
  for (const key of ["recurrenceStartDate", "recurrenceEndDate", "nextAppointmentDate"] as const) {
    const date = input[key];
    if (date !== undefined && date !== null && date !== "" && !isYouthPersonalScheduleDate(date)) throw new YouthError("날짜 형식을 확인하세요.", "INVALID_REQUEST", 400, { input: "날짜를 확인하세요." });
  }
  if (input.occurrenceDates !== undefined && (!Array.isArray(input.occurrenceDates) || !input.occurrenceDates.every(isYouthPersonalScheduleDate))) throw new YouthError("일정 날짜를 확인하세요.", "INVALID_REQUEST", 400);
  if (input.recurrenceWeekdays !== undefined && (!Array.isArray(input.recurrenceWeekdays) || !input.recurrenceWeekdays.every(day => typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6))) throw new YouthError("반복 요일을 확인하세요.", "INVALID_REQUEST", 400);
  for (const key of ["content", "hospitalName", "escortUserId", "escortOtherName"]) if (input[key] !== undefined && typeof input[key] !== "string") throw new YouthError("일정 입력을 확인하세요.", "INVALID_REQUEST", 400);
  const normalized = normalizeYouthPersonalScheduleInput(input);
  if (!normalized.ok) throw new YouthError(normalized.error, "VALIDATION_ERROR", 400, { input: normalized.error });
  return normalized.value;
}
export type CommonBaseline = { weekday: number; startMinute: number; scheduleId: string | null; expectedUpdatedAt: string | null };
export function parseCommonBatch(value: unknown) {
  const body = activityObject(value, ["requestId", "operation", "targetWeekdays", "baselines", "startMinute", "endMinute", "content"]);
  const requestId = activityId(body.requestId, true);
  if (body.operation !== "save" && body.operation !== "delete") throw new YouthError("변경 종류를 선택하세요.", "INVALID_REQUEST", 400);
  if (!Array.isArray(body.targetWeekdays) || body.targetWeekdays.length < 1 || body.targetWeekdays.length > 5 || !body.targetWeekdays.every(day => typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 5) || new Set(body.targetWeekdays).size !== body.targetWeekdays.length) throw new YouthError("반복 요일을 확인하세요.", "INVALID_REQUEST", 400);
  const targetWeekdays = [...body.targetWeekdays].sort((a, b) => a - b) as number[];
  if (!Array.isArray(body.baselines) || body.baselines.length !== targetWeekdays.length) throw new YouthError("최신 일정을 다시 확인하세요.", "INVALID_REQUEST", 400);
  const baselines = body.baselines.map(raw => {
    const row = activityObject(raw, ["weekday", "startMinute", "scheduleId", "expectedUpdatedAt"]);
    if (typeof row.weekday !== "number" || !targetWeekdays.includes(row.weekday) || typeof row.startMinute !== "number" || !isYouthCommonScheduleStartMinute(row.startMinute)) throw new YouthError("기존 일정 위치를 확인하세요.", "INVALID_REQUEST", 400);
    if ((row.scheduleId === null) !== (row.expectedUpdatedAt === null)) throw new YouthError("기존 일정 기준을 확인하세요.", "INVALID_REQUEST", 400);
    return { weekday: row.weekday, startMinute: row.startMinute, scheduleId: row.scheduleId === null ? null : activityId(row.scheduleId), expectedUpdatedAt: row.expectedUpdatedAt === null ? null : activityToken(row.expectedUpdatedAt) };
  }).sort((a, b) => a.weekday - b.weekday);
  if (new Set(baselines.map(row => row.weekday)).size !== targetWeekdays.length) throw new YouthError("요일 기준이 중복됩니다.", "INVALID_REQUEST", 400);
  if (body.operation === "delete") {
    if (body.startMinute !== undefined || body.endMinute !== undefined || body.content !== undefined) throw new YouthError("삭제 입력을 확인하세요.", "INVALID_REQUEST", 400);
    return { requestId, operation: "delete" as const, targetWeekdays, baselines };
  }
  if (typeof body.startMinute !== "number" || !isYouthCommonScheduleStartMinute(body.startMinute) || typeof body.endMinute !== "number" || !isYouthCommonScheduleEndMinute(body.endMinute, body.startMinute)) throw new YouthError("시간을 확인하세요.", "INVALID_REQUEST", 400);
  if (typeof body.content !== "string" || !body.content.trim()) throw new YouthError("일정 내용을 입력하세요.", "VALIDATION_ERROR", 400, { content: "내용을 입력하세요." });
  return { requestId, operation: "save" as const, targetWeekdays, baselines, startMinute: body.startMinute, endMinute: body.endMinute, content: body.content.trim() };
}
export function parseConceptCreate(value: unknown) {
  const body = activityObject(value, ["requestId", "subject", "subunitId", "content"]), requestId = activityId(body.requestId, true);
  if (body.subject !== "math" || typeof body.subunitId !== "string" || !isYouthStudySubunitId(body.subject, body.subunitId)) throw new YouthError("수학 단원을 확인하세요.", "INVALID_REQUEST", 400);
  if (typeof body.content !== "string") throw new YouthError("개념 내용을 확인하세요.", "INVALID_REQUEST", 400);
  const content = body.content.trim(), error = validateYouthStudyConceptContent(content);
  if (error) throw new YouthError(error, "VALIDATION_ERROR", 400, { content: error });
  return { requestId, subject: "math" as const, subunitId: body.subunitId, content };
}
export function parseRuleCreate(value: unknown) {
  const body = activityObject(value, ["requestId", "targetYouthId", "category", "detail"]), requestId = activityId(body.requestId, true);
  const targetYouthId = body.targetYouthId === null ? null : activityId(body.targetYouthId);
  if (typeof body.category !== "string" || !isYouthRuleCategory(body.category)) throw new YouthError("규칙 카테고리를 선택하세요.", "INVALID_REQUEST", 400);
  if (typeof body.detail !== "string" || !body.detail.trim() || body.detail.trim().length > youthRuleDetailMaxLength) throw new YouthError("세부사항은 1~2000자로 입력하세요.", "VALIDATION_ERROR", 400, { detail: "세부사항을 확인하세요." });
  return { requestId, targetYouthId, category: body.category, detail: body.detail.trim() };
}
export function parseActivityDelete(value: unknown, parent: "youthId" | "targetYouthId" | null = null) {
  const body = activityObject(value, ["requestId", "expectedUpdatedAt", ...(parent ? [parent] : [])]);
  return { requestId: activityId(body.requestId, true), expectedUpdatedAt: activityToken(body.expectedUpdatedAt), ...(parent ? { youthId: parent === "targetYouthId" && body[parent] === null ? null : activityId(body[parent]) } : {}) };
}
export function assertActivityVersion(actual: Date, expected: string | undefined) {
  if (expected !== undefined && actual.toISOString() !== expected) throw new YouthError("다른 직원이 내용을 변경했습니다. 최신 내용을 확인하세요.", "YOUTH_CONFLICT", 409);
}
export function nextActivityToken(now: Date, previous: Date) { return new Date(Math.max(now.getTime(), previous.getTime() + 1)); }
