import { isValidStaffTaskDate, isValidStaffTaskId, isValidStaffTaskVersion, type StaffTaskFormValues, type StaffTaskStatus } from "@/lib/staff-tasks-core";

export class MobileStaffTaskRequestError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_INPUT", public fields?: Record<string, string>) { super(message); }
}
export function parseMobileStaffTaskPage(params: URLSearchParams) {
  const raw = params.get("page") ?? "1";
  const page = Number(raw);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(page)) throw new MobileStaffTaskRequestError("페이지가 올바르지 않습니다.", 400, "INVALID_QUERY");
  return page;
}
export function parseMobileStaffTaskFilters(params: URLSearchParams): { status: StaffTaskStatus; page: number } {
  const status = params.get("status") ?? "pending";
  if (status !== "pending" && status !== "overdue" && status !== "completed" && status !== "all" && status !== "deleted") {
    throw new MobileStaffTaskRequestError("할 일 상태가 올바르지 않습니다.", 400, "INVALID_QUERY");
  }
  return { status, page: parseMobileStaffTaskPage(params) };
}
export function parseMobileStaffTaskId(id: unknown): string {
  if (!isValidStaffTaskId(id)) throw new MobileStaffTaskRequestError("할 일 정보가 올바르지 않습니다.");
  return id;
}
export function staffTaskInputObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new MobileStaffTaskRequestError("할 일 요청이 올바르지 않습니다.");
  return input as Record<string, unknown>;
}
export function parseMobileStaffTaskCreate(input: unknown, userId: string): StaffTaskFormValues {
  const raw = staffTaskInputObject(input);
  const fields: Record<string, string> = {};
  const text = (key: "title" | "description" | "meetingTitle" | "dueDate", optional = false) => {
    if (raw[key] === undefined && optional) return "";
    if (typeof raw[key] !== "string") { fields[key] = "문자로 입력해 주세요."; return ""; }
    return raw[key].trim();
  };
  const values = { title: text("title"), description: text("description", true), meetingTitle: text("meetingTitle", true), dueDate: text("dueDate", true), assigneeId: userId, requestId: typeof raw.requestId === "string" ? raw.requestId.trim() : "" };
  if (!values.title) fields.title ??= "할 일을 입력해 주세요.";
  else if (values.title.length > 160) fields.title = "할 일은 160자 이하로 입력해 주세요.";
  if (values.description.length > 2000) fields.description = "상세 내용은 2,000자 이하로 입력해 주세요.";
  if (values.meetingTitle.length > 160) fields.meetingTitle = "회의명은 160자 이하로 입력해 주세요.";
  if (values.dueDate && !isValidStaffTaskDate(values.dueDate)) fields.dueDate = "기한을 올바른 날짜로 입력해 주세요.";
  if (Object.keys(fields).length) throw new MobileStaffTaskRequestError("입력 내용을 확인하세요.", 400, "INVALID_INPUT", fields);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(values.requestId)) throw new MobileStaffTaskRequestError("등록 요청을 확인할 수 없습니다. 입력 내용을 보존하고 등록 화면을 다시 열어 주세요.");
  return values;
}
export function parseMobileStaffTaskDelete(input: unknown) {
  const raw = staffTaskInputObject(input);
  if (!isValidStaffTaskVersion(raw.version)) throw new MobileStaffTaskRequestError("할 일 버전이 올바르지 않습니다. 목록을 새로고침해 주세요.");
  return { version: raw.version };
}
export function parseMobileStaffTaskCompletion(input: unknown) {
  const raw = staffTaskInputObject(input);
  const { version } = parseMobileStaffTaskDelete(raw);
  if (typeof raw.completed !== "boolean") throw new MobileStaffTaskRequestError("완료 상태가 올바르지 않습니다.");
  return { completed: raw.completed, version };
}
