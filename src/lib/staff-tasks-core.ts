import { getKoreanDateTimeParts } from "@/lib/korean-date";

export type StaffTaskStatus = "all" | "pending" | "completed" | "overdue";

export type StaffTaskItem = {
  id: string;
  title: string;
  description: string | null;
  meetingTitle: string | null;
  dueDate: string | null;
  assigneeId: string;
  assigneeName: string;
  departmentName: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type StaffTaskAssignee = {
  id: string;
  name: string;
  departmentName: string;
};

export type StaffTaskCounts = {
  pending: number;
  completed: number;
  overdue: number;
};

export type StaffTaskPage = {
  tasks: StaffTaskItem[];
  counts: StaffTaskCounts;
  page: number;
  totalPages: number;
  total: number;
};

export type StaffTaskEmployeeSummary = StaffTaskCounts & {
  assigneeId: string;
  assigneeName: string;
  departmentName: string;
};

export type StaffTaskFormValues = {
  title: string;
  description: string;
  meetingTitle: string;
  dueDate: string;
  assigneeId: string;
  requestId: string;
};

export type StaffTaskFormState = {
  error?: string;
  success?: string;
  values?: StaffTaskFormValues;
  savedTaskId?: string;
};

export const staffTaskStatusOptions = [
  { value: "pending", label: "미완료" },
  { value: "overdue", label: "기한 초과" },
  { value: "completed", label: "완료" },
  { value: "all", label: "전체" },
] as const;

export function normalizeStaffTaskStatus(value: unknown): StaffTaskStatus {
  return value === "all" || value === "completed" || value === "overdue"
    ? value
    : "pending";
}

export function getStaffTaskToday(now = new Date()): string {
  const parts = getKoreanDateTimeParts(now);
  if (!parts) throw new Error("Invalid staff task date");
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isStaffTaskOverdue(
  task: Pick<StaffTaskItem, "dueDate" | "completedAt">,
  today = getStaffTaskToday(),
): boolean {
  return task.completedAt === null && task.dueDate !== null && task.dueDate < today;
}

export function isValidStaffTaskDate(value: string): boolean {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidStaffTaskId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function isValidStaffTaskVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < 2147483647;
}

export function normalizeStaffTaskFormValues(formData: FormData): StaffTaskFormValues {
  const getText = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  return {
    title: getText("title"),
    description: getText("description"),
    meetingTitle: getText("meetingTitle"),
    dueDate: getText("dueDate"),
    assigneeId: getText("assigneeId"),
    requestId: getText("requestId"),
  };
}

export function validateStaffTaskFormValues(values: StaffTaskFormValues): string | null {
  if (!values.title) return "할 일을 입력해 주세요.";
  if (values.title.length > 160) return "할 일은 160자 이하로 입력해 주세요.";
  if (values.description.length > 2000) return "상세 내용은 2,000자 이하로 입력해 주세요.";
  if (values.meetingTitle.length > 160) return "회의명은 160자 이하로 입력해 주세요.";
  if (values.dueDate && !isValidStaffTaskDate(values.dueDate)) return "기한을 올바른 날짜로 입력해 주세요.";
  if (!isValidStaffTaskId(values.assigneeId)) return "담당 직원을 선택해 주세요.";
  return null;
}
