import { isYouthLearningScheduleStartMinute, isYouthLearningScheduleEndMinute } from "@/lib/youth-management-core";
import { isWorkScheduleDate } from "@/lib/work-schedule-calendar";
import type { WorkSchedule, WorkScheduleChangeLog } from "@/lib/work-schedules";

export class MobileScheduleRequestError extends Error {
  constructor(message = "업무 일정 입력 정보를 확인해 주세요.", readonly status = 400, readonly code = "INVALID_REQUEST", readonly fields?: Record<string, string>) { super(message); }
}
const invalid = (field?: string) => new MobileScheduleRequestError("업무 일정 입력 정보를 확인해 주세요.", 400, "INVALID_REQUEST", field ? { [field]: "입력 값을 확인해 주세요." } : undefined);
export function parseMobileScheduleId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,191}$/.test(value)) throw invalid();
  return value;
}
export function parseMobileScheduleDate(value: unknown): string {
  if (typeof value !== "string" || !isWorkScheduleDate(value)) throw invalid("scheduleDate");
  return value;
}
function month(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value) || !isWorkScheduleDate(value + "-01")) throw invalid("scheduleDate");
  return value;
}
function queryKeys(params: URLSearchParams, keys: string[]) {
  for (const key of params.keys()) if (!keys.includes(key) || params.getAll(key).length !== 1) throw invalid();
}
export function parseMobileScheduleQuery(params: URLSearchParams, today: string) {
  queryKeys(params, ["month", "date"]);
  const selectedMonth = params.has("month") ? month(params.get("month")) : params.has("date") ? parseMobileScheduleDate(params.get("date")).slice(0, 7) : today.slice(0, 7);
  const selectedDate = params.has("date") ? parseMobileScheduleDate(params.get("date")) : selectedMonth === today.slice(0, 7) ? today : selectedMonth + "-01";
  if (selectedDate.slice(0, 7) !== selectedMonth) throw invalid("scheduleDate");
  return { month: selectedMonth, selectedDate };
}
export function parseMobileScheduleChangesQuery(params: URLSearchParams) {
  queryKeys(params, ["date", "actorId", "page"]);
  const rawPage = params.get("page");
  if (rawPage !== null && (!/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(Number(rawPage)))) throw invalid();
  return { scheduleDate: params.has("date") ? parseMobileScheduleDate(params.get("date")) : "", actorId: params.has("actorId") ? parseMobileScheduleId(params.get("actorId")) : "all", page: rawPage === null ? 1 : Number(rawPage), pageSize: 5 };
}
export function requireNoMobileScheduleQuery(params: URLSearchParams) { queryKeys(params, []); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key))) throw invalid();
  return row;
}
export function parseMobileScheduleToken(value: unknown): string {
  if (typeof value !== "string") throw invalid("expectedUpdatedAt");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw invalid("expectedUpdatedAt");
  return value;
}
export function parseMobileScheduleSave(value: unknown, create: boolean) {
  const row = object(value, ["scheduleDate", "startMinute", "endMinute", "content", "expectedUpdatedAt", ...(create ? ["manualScheduleId"] : [])]);
  const scheduleDate = parseMobileScheduleDate(row.scheduleDate);
  if (typeof row.startMinute !== "number" || !isYouthLearningScheduleStartMinute(row.startMinute)) throw invalid("startMinute");
  if (typeof row.endMinute !== "number" || !isYouthLearningScheduleEndMinute(row.endMinute, row.startMinute)) throw invalid("endMinute");
  if (typeof row.content !== "string" || !row.content.trim()) throw new MobileScheduleRequestError("일정 내용을 입력하세요.", 400, "INVALID_REQUEST", { content: "일정 내용을 입력하세요." });
  if (create && (row.manualScheduleId !== null || row.expectedUpdatedAt !== "")) throw invalid("manualScheduleId");
  return { scheduleDate, startMinute: row.startMinute, endMinute: row.endMinute, content: row.content.trim(), expectedUpdatedAt: create ? "" : parseMobileScheduleToken(row.expectedUpdatedAt) };
}
export function parseMobileScheduleDelete(value: unknown) { return parseMobileScheduleToken(object(value, ["expectedUpdatedAt"]).expectedUpdatedAt); }
export function toMobileManualSchedule(row: WorkSchedule) {
  if (row.readOnly || row.sourceType !== "manual" || !row.updatedAt || !Number.isFinite(new Date(row.updatedAt).getTime()) || new Date(row.updatedAt).toISOString() !== row.updatedAt) throw new Error("Invalid manual source");
  return { id: row.id, sourceType: "manual" as const, readOnly: false as const, allDay: false as const, scheduleDate: row.scheduleDate, startMinute: row.startMinute, endMinute: row.endMinute, content: row.content, updatedAt: row.updatedAt };
}
export function toMobileSchedule(row: WorkSchedule) {
  if (row.sourceType === "approvedVacation") return { id: row.id, sourceType: "approvedVacation" as const, readOnly: true as const, allDay: true as const, scheduleDate: row.scheduleDate, content: row.content, staffName: row.staffName!, vacationLabel: row.vacationLabel!, departmentName: row.departmentName!, positionName: row.positionName! };
  if (row.sourceType === "hospitalAppointment") return { id: row.id, sourceType: "hospitalAppointment" as const, readOnly: true as const, allDay: false as const, scheduleDate: row.scheduleDate, content: row.content, startMinute: row.startMinute, endMinute: row.endMinute, youthName: row.youthName!, hospitalName: row.hospitalName!, escortName: row.escortName! };
  return toMobileManualSchedule(row);
}
export function mobileScheduleCounts(rows: Array<ReturnType<typeof toMobileSchedule>>) { return { total: rows.length, manual: rows.filter(row => row.sourceType === "manual").length, vacation: rows.filter(row => row.sourceType === "approvedVacation").length, hospital: rows.filter(row => row.sourceType === "hospitalAppointment").length }; }
export function toMobileScheduleChange(log: WorkScheduleChangeLog) {
  const raw = log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata) ? log.metadata as Record<string, unknown> : {};
  const change = raw.changeType === "workSchedule.create" ? "create" : raw.changeType === "workSchedule.update" ? "update" : raw.changeType === "workSchedule.delete" ? "delete" : "other";
  function snapshot(prefix: "previous" | "next") {
    const content = raw[prefix + "Content"], date = raw[prefix + "ScheduleDate"], start = raw[prefix + "StartMinute"] ?? (change === "delete" ? raw.startMinute : undefined), end = raw[prefix + "EndMinute"] ?? (change === "delete" ? raw.endMinute : undefined);
    if (typeof content !== "string" || typeof date !== "string" || !isWorkScheduleDate(date) || typeof start !== "number" || typeof end !== "number" || !isYouthLearningScheduleStartMinute(start) || !isYouthLearningScheduleEndMinute(end, start)) return null;
    return { scheduleDate: date, startMinute: start, endMinute: end, content };
  }
  return { id: log.id, createdAt: log.createdAt, actor: { id: log.actor.id, name: log.actor.name }, change, message: log.message, previous: snapshot("previous"), next: snapshot("next") };
}
