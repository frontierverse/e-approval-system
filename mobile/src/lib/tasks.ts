import { requestKey } from "./drafts";
import type { MobileStaffTaskItem, MobileStaffTaskStatus } from "./types";

export const taskStatusOptions = [
  { value: "pending", label: "미완료" },
  { value: "overdue", label: "기한 초과" },
  { value: "completed", label: "완료" },
  { value: "all", label: "전체" },
  { value: "deleted", label: "삭제됨" },
] as const;

export function normalizeTaskStatus(value: unknown): MobileStaffTaskStatus {
  return value === "overdue" || value === "completed" || value === "all" || value === "deleted" ? value : "pending";
}
export function taskPage(value: unknown): number {
  const page = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}
export function isTaskId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
export function isTaskDate(value: string): boolean {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export type TaskState = { kind: "deleted" | "completed" | "overdue" | "dueToday" | "pending"; label: string; tone: "neutral" | "danger" | "accent" };
export function taskState(task: Pick<MobileStaffTaskItem, "deletedAt" | "completedAt" | "dueDate">, today: string): TaskState {
  if (task.deletedAt) return { kind: "deleted", label: "삭제됨", tone: "neutral" };
  if (task.completedAt) return { kind: "completed", label: "완료", tone: "neutral" };
  if (task.dueDate && isTaskDate(task.dueDate) && isTaskDate(today)) {
    if (task.dueDate < today) return { kind: "overdue", label: "기한 초과", tone: "danger" };
    if (task.dueDate === today) return { kind: "dueToday", label: "오늘 마감", tone: "accent" };
  }
  return { kind: "pending", label: "미완료", tone: "neutral" };
}
export function formatTaskDueDate(value: string | null): string {
  return value ? isTaskDate(value) ? `기한 ${value}` : "기한 확인 필요" : "기한 없음";
}
const timestampFormatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
export function formatTaskTimestamp(value: string | null): string {
  if (!value) return "없음";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "날짜 확인 필요";
  const parts = Object.fromEntries(timestampFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
export type TaskFormValues = { title: string; description: string; meetingTitle: string; dueDate: string };
export type TaskFormErrors = Partial<Record<keyof TaskFormValues, string>>;
export const emptyTaskFormValues: TaskFormValues = { title: "", description: "", meetingTitle: "", dueDate: "" };
export function normalizeTaskFormValues(values: TaskFormValues): TaskFormValues {
  return { title: values.title.trim(), description: values.description.trim(), meetingTitle: values.meetingTitle.trim(), dueDate: values.dueDate.trim() };
}
export function validateTaskFormValues(values: TaskFormValues): TaskFormErrors {
  const data = normalizeTaskFormValues(values);
  const errors: TaskFormErrors = {};
  if (!data.title) errors.title = "할 일을 입력해 주세요.";
  else if (data.title.length > 160) errors.title = "할 일은 160자 이하로 입력해 주세요.";
  if (data.description.length > 2000) errors.description = "상세 내용은 2,000자 이하로 입력해 주세요.";
  if (data.meetingTitle.length > 160) errors.meetingTitle = "회의명은 160자 이하로 입력해 주세요.";
  if (data.dueDate && !isTaskDate(data.dueDate)) errors.dueDate = "기한을 YYYY-MM-DD 형식의 올바른 날짜로 입력해 주세요.";
  return errors;
}
export function newTaskRequestId(): string { return requestKey(); }
