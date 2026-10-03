import type { MobileManualSchedule, MobileScheduleChange, MobileScheduleChanges, MobileScheduleCounts, MobileScheduleDelete, MobileScheduleItem, MobileScheduleManualResponse, MobileScheduleMutation, MobileSchedulePage, MobileScheduleSaveInput, MobileScheduleSnapshot, MobileScheduleUpdateInput } from "@/lib/types";

export const scheduleBodyLimit = 8 * 1024 * 1024;
export type ScheduleValues = { scheduleDate: string; startTime: string; endTime: string; content: string };
export type ScheduleErrors = Record<string, string>;
export type ScheduleAttemptInput = Omit<MobileScheduleSaveInput, "manualScheduleId" | "expectedUpdatedAt"> & { manualScheduleId: string | null; expectedUpdatedAt: string };
export type ScheduleCalendarCell = { date: string | null; inMonth: boolean };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const identity = (value: unknown): value is string => text(value) && value.length > 0 && value.length <= 512 && !/[\s\x00-\x1f\x7f]/.test(value);
export const isManualScheduleId = (value: unknown): value is string => text(value) && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function isScheduleDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || year > 9999) return false;
  const date = new Date(0); date.setUTCHours(0, 0, 0, 0); date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function isScheduleMonth(value: string) { return /^\d{4}-\d{2}$/.test(value) && isScheduleDate(`${value}-01`); }
export function scheduleDate(value: unknown): string | undefined { return value === undefined ? undefined : text(value) ? value : ""; }
export function schedulePage(value: unknown): number { const page = text(value) && /^[1-9]\d*$/.test(value) ? Number(value) : typeof value === "number" ? value : NaN; return Number.isSafeInteger(page) && page > 0 ? page : 1; }
export function isScheduleToken(value: unknown): value is string { return text(value) && Number.isFinite(new Date(value).getTime()) && new Date(value).toISOString() === value; }
const dateValue = (value: unknown): value is string => text(value) && isScheduleDate(value);
export function shiftScheduleDate(value: string, days: number): string | null {
  if (!isScheduleDate(value) || !Number.isSafeInteger(days)) return null;
  const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return null;
  return date.toISOString().slice(0, 10);
}
export function shiftScheduleMonth(value: string, months: number): string | null {
  if (!isScheduleMonth(value) || !Number.isSafeInteger(months)) return null;
  const date = new Date(`${value}-01T00:00:00.000Z`); date.setUTCMonth(date.getUTCMonth() + months);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return null;
  return date.toISOString().slice(0, 7);
}
export function scheduleCalendar(month: string): ScheduleCalendarCell[] {
  if (!isScheduleMonth(month)) return [];
  const first = `${month}-01`; const weekday = new Date(`${first}T00:00:00.000Z`).getUTCDay();
  return Array.from({ length: 42 }, (_, index) => { const date = shiftScheduleDate(first, index - weekday); return { date, inMonth: !!date && date.startsWith(month) }; });
}
export function formatScheduleDate(value: string) { if (!isScheduleDate(value)) return "날짜 확인 필요"; const [year, month, day] = value.split("-").map(Number); return `${year}년 ${month}월 ${day}일`; }
export function formatScheduleMonth(value: string) { if (!isScheduleMonth(value)) return "월 확인 필요"; const [year, month] = value.split("-").map(Number); return `${year}년 ${month}월`; }
export function formatScheduleTimestamp(value: string) {
  if (!isScheduleToken(value)) return "날짜 확인 필요";
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}
export function formatScheduleMinute(value: number) { return Number.isInteger(value) && value >= 0 && value <= 1440 ? `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}` : "시간 확인 필요"; }
export function parseScheduleTime(value: string) { if (!/^\d{2}:\d{2}$/.test(value)) return null; const [hour, minute] = value.split(":").map(Number); return hour <= 23 && minute < 60 || hour === 24 && minute === 0 ? hour * 60 + minute : null; }
const manualTime = (start: unknown, end: unknown) => Number.isInteger(start) && Number.isInteger(end) && Number(start) >= 540 && Number(end) <= 1080 && Number(start) < Number(end) && Number(start) % 10 === 0 && Number(end) % 10 === 0;
const hospitalTime = (start: unknown, end: unknown) => Number.isInteger(start) && Number.isInteger(end) && Number(start) >= 0 && Number(end) <= 1440 && Number(start) < Number(end);
const manualKeys = ["id", "sourceType", "readOnly", "allDay", "scheduleDate", "startMinute", "endMinute", "content", "updatedAt"];
export function isManualSchedule(value: unknown): value is MobileManualSchedule { return record(value) && exact(value, manualKeys) && isManualScheduleId(value.id) && value.sourceType === "manual" && value.readOnly === false && value.allDay === false && dateValue(value.scheduleDate) && manualTime(value.startMinute, value.endMinute) && text(value.content) && !!value.content.trim() && isScheduleToken(value.updatedAt); }
export function isScheduleItem(value: unknown): value is MobileScheduleItem {
  if (isManualSchedule(value)) return true;
  if (!record(value) || !identity(value.id) || !dateValue(value.scheduleDate) || !text(value.content) || value.readOnly !== true) return false;
  if (value.sourceType === "approvedVacation") return exact(value, ["id", "sourceType", "readOnly", "allDay", "scheduleDate", "content", "staffName", "vacationLabel", "departmentName", "positionName"]) && value.allDay === true && text(value.staffName) && text(value.vacationLabel) && text(value.departmentName) && text(value.positionName);
  return value.sourceType === "hospitalAppointment" && exact(value, ["id", "sourceType", "readOnly", "allDay", "scheduleDate", "startMinute", "endMinute", "content", "youthName", "hospitalName", "escortName"]) && value.allDay === false && hospitalTime(value.startMinute, value.endMinute) && text(value.youthName) && text(value.hospitalName) && text(value.escortName);
}
export function scheduleCounts(items: MobileScheduleItem[]): MobileScheduleCounts { return { total: items.length, manual: items.filter(item => item.sourceType === "manual").length, vacation: items.filter(item => item.sourceType === "approvedVacation").length, hospital: items.filter(item => item.sourceType === "hospitalAppointment").length }; }
export function selectedScheduleItems(items: MobileScheduleItem[], date: string) { return items.filter(item => item.scheduleDate === date); }
export function scheduleSourceLabel(item: MobileScheduleItem) { return item.sourceType === "manual" ? "직접 등록" : item.sourceType === "approvedVacation" ? "승인 휴가 · 조회 전용" : "병원 예약 · 조회 전용"; }
function validCounts(value: unknown, expected: MobileScheduleCounts) { return record(value) && exact(value, ["total", "manual", "vacation", "hospital"]) && Object.entries(expected).every(([key, item]) => count(value[key]) && value[key] === item); }
export function isSchedulePage(value: unknown, expected: { month?: string; date?: string } = {}): value is MobileSchedulePage {
  if (!record(value) || !exact(value, ["today", "month", "selectedDate", "canManage", "items", "monthCounts", "selectedCounts"]) || !dateValue(value.today) || !text(value.month) || !isScheduleMonth(value.month) || !dateValue(value.selectedDate) || !value.selectedDate.startsWith(value.month) || value.canManage !== true || !Array.isArray(value.items) || !value.items.every(item => isScheduleItem(item) && item.scheduleDate.startsWith(String(value.month))) || new Set(value.items.map(item => item.id)).size !== value.items.length) return false;
  const month = expected.month ?? expected.date?.slice(0, 7) ?? value.today.slice(0, 7);
  const date = expected.date ?? (month === value.today.slice(0, 7) ? value.today : `${month}-01`);
  return value.month === month && value.selectedDate === date && validCounts(value.monthCounts, scheduleCounts(value.items)) && validCounts(value.selectedCounts, scheduleCounts(selectedScheduleItems(value.items, value.selectedDate)));
}
export function isScheduleManualResponse(value: unknown, id: string): value is MobileScheduleManualResponse { return record(value) && exact(value, ["today", "item"]) && dateValue(value.today) && isManualSchedule(value.item) && value.item.id === id; }
export function isScheduleSnapshot(value: unknown): value is MobileScheduleSnapshot { return record(value) && exact(value, ["scheduleDate", "startMinute", "endMinute", "content"]) && dateValue(value.scheduleDate) && manualTime(value.startMinute, value.endMinute) && text(value.content); }
function isChange(value: unknown): value is MobileScheduleChange { return record(value) && exact(value, ["id", "createdAt", "actor", "change", "message", "previous", "next"]) && isManualScheduleId(value.id) && isScheduleToken(value.createdAt) && record(value.actor) && exact(value.actor, ["id", "name"]) && isManualScheduleId(value.actor.id) && text(value.actor.name) && ["create", "update", "delete", "other"].includes(String(value.change)) && (value.message === null || text(value.message)) && (value.previous === null || isScheduleSnapshot(value.previous)) && (value.next === null || isScheduleSnapshot(value.next)); }
export function isScheduleChanges(value: unknown, expected: { date?: string; actorId?: string } = {}): value is MobileScheduleChanges {
  return record(value) && exact(value, ["logs", "actors", "actorId", "scheduleDate", "page", "pageSize", "total", "totalPages"]) && value.scheduleDate === (expected.date ?? "") && value.actorId === (expected.actorId ?? "all") && (value.actorId === "all" || isManualScheduleId(value.actorId)) && Array.isArray(value.logs) && value.logs.length <= 5 && value.logs.every(isChange) && new Set(value.logs.map(item => item.id)).size === value.logs.length && Array.isArray(value.actors) && value.actors.every(item => record(item) && exact(item, ["id", "name"]) && isManualScheduleId(item.id) && text(item.name)) && new Set(value.actors.map(item => item.id)).size === value.actors.length && value.pageSize === 5 && count(value.total) && count(value.totalPages) && value.totalPages === Math.max(1, Math.ceil(Number(value.total) / 5)) && Number.isSafeInteger(value.page) && Number(value.page) >= 1 && Number(value.page) <= Number(value.totalPages) && value.logs.length === Math.min(5, Math.max(0, Number(value.total) - (Number(value.page) - 1) * 5));
}
export function scheduleValues(item: MobileManualSchedule | null, date: string): ScheduleValues { return item ? { scheduleDate: item.scheduleDate, startTime: formatScheduleMinute(item.startMinute), endTime: formatScheduleMinute(item.endMinute), content: item.content } : { scheduleDate: date, startTime: "09:00", endTime: "10:00", content: "" }; }
export function scheduleDirty(values: ScheduleValues, baseline: MobileManualSchedule | null, initialDate: string) { const old = scheduleValues(baseline, initialDate); return values.scheduleDate !== old.scheduleDate || values.startTime !== old.startTime || values.endTime !== old.endTime || values.content.trim() !== old.content.trim(); }
export function scheduleSaveInput(values: ScheduleValues, item: MobileManualSchedule | null): ScheduleAttemptInput { return { scheduleDate: values.scheduleDate, startMinute: parseScheduleTime(values.startTime) ?? -1, endMinute: parseScheduleTime(values.endTime) ?? -1, content: values.content.trim(), manualScheduleId: item?.id ?? null, expectedUpdatedAt: item?.updatedAt ?? "" }; }
export function scheduleUpdateInput(input: ScheduleAttemptInput): MobileScheduleUpdateInput { return { scheduleDate: input.scheduleDate, startMinute: input.startMinute, endMinute: input.endMinute, content: input.content, expectedUpdatedAt: input.expectedUpdatedAt }; }
export function scheduleBodyBytes(value: unknown) { const json = JSON.stringify(value); let bytes = 0; for (let i = 0; i < json.length; i++) { const unit = json.charCodeAt(i); if (unit < 0x80) bytes++; else if (unit < 0x800) bytes += 2; else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < json.length && json.charCodeAt(i + 1) >= 0xdc00 && json.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; } else bytes += 3; } return bytes; }
export function validateScheduleInput(input: ScheduleAttemptInput): ScheduleErrors {
  const errors: ScheduleErrors = {};
  if (!isScheduleDate(input.scheduleDate)) errors.scheduleDate = "일정 날짜를 YYYY-MM-DD 형식으로 입력하세요.";
  if (!Number.isInteger(input.startMinute) || input.startMinute < 540 || input.startMinute >= 1080 || input.startMinute % 10 !== 0) errors.startMinute = "시작은 09:00~17:50 사이 10분 단위로 입력하세요.";
  if (!Number.isInteger(input.endMinute) || input.endMinute > 1080 || input.endMinute <= input.startMinute || input.endMinute % 10 !== 0) errors.endMinute = "종료는 시작보다 늦고 18:00 이내인 10분 단위로 입력하세요.";
  if (!input.content.trim()) errors.content = "일정 내용을 입력하세요. 삭제는 상세의 삭제 버튼을 사용하세요.";
  if (input.manualScheduleId === null ? input.expectedUpdatedAt !== "" : !isManualScheduleId(input.manualScheduleId) || !isScheduleToken(input.expectedUpdatedAt)) errors.expectedUpdatedAt = "최신 일정을 확인한 뒤 저장하세요.";
  if (scheduleBodyBytes(input.manualScheduleId === null ? input : scheduleUpdateInput(input)) > scheduleBodyLimit) errors.content = "전송 데이터가 8MiB를 넘습니다. 입력은 보관됩니다. 내용을 나누어 저장하세요.";
  return errors;
}
export function schedulePayloadMatches(item: MobileManualSchedule, input: ScheduleAttemptInput) { return item.scheduleDate === input.scheduleDate && item.startMinute === input.startMinute && item.endMinute === input.endMinute && item.content === input.content; }
export function scheduleSavedMatches(item: MobileManualSchedule, input: ScheduleAttemptInput, baseline: MobileManualSchedule | null) {
  if (!input.manualScheduleId || item.id !== input.manualScheduleId || !schedulePayloadMatches(item, input)) return false;
  return item.updatedAt > input.expectedUpdatedAt || (item.updatedAt === input.expectedUpdatedAt && !!baseline && baseline.id === item.id && baseline.updatedAt === item.updatedAt && schedulePayloadMatches(baseline, input));
}
export function isScheduleMutation(value: unknown, input: ScheduleAttemptInput, baseline: MobileManualSchedule | null): value is MobileScheduleMutation { return record(value) && exact(value, ["ok", "message", "change", "item"]) && value.ok === true && text(value.message) && isManualSchedule(value.item) && schedulePayloadMatches(value.item, input) && (value.change === "create" ? input.manualScheduleId === null : value.change === "update" ? !!input.manualScheduleId && value.item.id === input.manualScheduleId && value.item.updatedAt > input.expectedUpdatedAt : value.change === "unchanged" && !!baseline && input.manualScheduleId === baseline.id && value.item.id === baseline.id && value.item.updatedAt === input.expectedUpdatedAt && schedulePayloadMatches(baseline, input)); }
export function isScheduleDelete(value: unknown, id: string): value is MobileScheduleDelete { return record(value) && exact(value, ["ok", "message", "change", "deletedId"]) && value.ok === true && text(value.message) && (value.change === "deleted" || value.change === "missing") && value.deletedId === id; }
