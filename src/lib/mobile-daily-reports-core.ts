import { parseDailyReportForm } from "@/lib/daily-report-core";
import { getWorkLogToday, isWorkLogDate } from "@/lib/work-log-core";
import type { DailyReportSaveInput } from "@/lib/daily-report-mutations";

export class MobileDailyReportRequestError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_REQUEST", public fields?: Record<string, string>) { super(message); }
}
function parameters(params: URLSearchParams, allowed: readonly string[]) {
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new MobileDailyReportRequestError("조회 조건을 확인해 주세요.");
}
function dateValue(params: URLSearchParams, today: string) {
  const date = params.get("date") ?? today;
  if (!isWorkLogDate(date) || date > today) throw new MobileDailyReportRequestError("오늘 또는 이전 날짜를 선택해 주세요.");
  return date;
}
export function parseMobileDailyReportEditorQuery(params: URLSearchParams, today = getWorkLogToday()) {
  parameters(params, ["date"]);
  return dateValue(params, today);
}
export function parseMobileDailyReportListQuery(params: URLSearchParams, director: boolean, today = getWorkLogToday()): { date: string; page: number; filter: "all" | "unread" | "missing" | "reviewed"; q: string } {
  parameters(params, director ? ["date", "page", "filter", "q"] : ["date", "page"]);
  const rawPage = params.get("page") ?? "1", page = Number(rawPage);
  if (!/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(page)) throw new MobileDailyReportRequestError("페이지를 확인해 주세요.");
  const filter = params.get("filter") ?? "all";
  if (filter !== "all" && filter !== "unread" && filter !== "missing" && filter !== "reviewed") throw new MobileDailyReportRequestError("제출 상태를 확인해 주세요.");
  const q = (params.get("q") ?? "").trim();
  if (q.length > 200) throw new MobileDailyReportRequestError("검색어는 200자 이내로 입력해 주세요.");
  return { date: dateValue(params, today), page: Math.min(page, 100000), filter, q };
}
export function parseMobileDailyReportId(id: unknown): string {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new MobileDailyReportRequestError("보고서를 찾을 수 없습니다.", 404, "NOT_FOUND");
  return id;
}
function inputObject(input: unknown, allowed: readonly string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new MobileDailyReportRequestError("보고서 입력 정보를 확인해 주세요.");
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).some(key => !allowed.includes(key))) throw new MobileDailyReportRequestError("지원하지 않는 입력 항목이 있습니다.");
  return raw;
}
export function parseMobileDailyReportSave(input: unknown): DailyReportSaveInput {
  const raw = inputObject(input, ["workDate", "mainContent", "youthReports", "intent", "version"]);
  const fields: Record<string, string> = {};
  const form = new FormData();
  for (const key of ["workDate", "mainContent", "intent"] as const) {
    if (typeof raw[key] !== "string") fields[key] = "문자로 입력해 주세요.";
    form.set(key, typeof raw[key] === "string" ? raw[key] : "");
  }
  if (typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version < 0 || raw.version > 999999999) fields.version = "보고서 버전을 확인할 수 없습니다. 새로고침해 주세요.";
  form.set("version", typeof raw.version === "number" ? String(raw.version) : "");
  if (!Array.isArray(raw.youthReports) || raw.youthReports.some(note => !note || typeof note !== "object" || Array.isArray(note) || Object.keys(note).some(key => key !== "youthId" && key !== "content") || typeof note.youthId !== "string" || typeof note.content !== "string")) {
    fields.youthReports = "청소년별 입력 정보를 확인할 수 없습니다. 입력을 보관한 뒤 새로고침해 주세요.";
  }
  form.set("youthReports", JSON.stringify(raw.youthReports ?? null));
  const parsed = parseDailyReportForm(form);
  Object.assign(fields, parsed.fieldErrors);
  if (Object.keys(fields).length) throw new MobileDailyReportRequestError("입력 내용을 확인해 주세요.", 400, "INVALID_REQUEST", fields);
  return { values: parsed.values, version: parsed.version, intent: parsed.intent as "draft" | "submit" };
}
export function parseMobileDailyReportReview(input: unknown) {
  const raw = inputObject(input, ["version"]);
  if (typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version < 1 || raw.version > 2147483647) throw new MobileDailyReportRequestError("보고서 정보를 확인해 주세요.", 400, "INVALID_REQUEST", { version: "보고서 버전을 확인해 주세요." });
  return { version: raw.version };
}
