import { isApprovalAuthorityPosition } from "@/lib/approval-authority";
import { getWorkLogToday, isWorkLogDate } from "@/lib/work-log-core";

export const dailyReportPath = "/work-schedule/daily-reports";
export type DailyReportHomeSummary =
  | { mode: "employee"; today: string; status: "missing" | "draft" | "submitted" | "reviewed" }
  | { mode: "director"; today: string; submitted: number; unreviewed: number }
  | { mode: "unavailable"; today: string };
export const dailyReportMainLimit = 10000;
export const dailyReportYouthLimit = 4000;
export const dailyReportYouthCountLimit = 200;
export type ReportYouth = { id: string; name: string };
export type YouthReport = { youthId: string; youthName: string; content: string };
export type DailyReportValues = {
  workDate: string;
  mainContent: string;
  youthReports: { youthId: string; content: string }[];
};
export type DailyReportEntry = {
  id: string;
  workDate: string;
  mainContent: string;
  youthReports: YouthReport[];
  authorId: string;
  authorName: string;
  departmentName: string;
  version: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  updatedAt: string;
};
export type DailyReportState = {
  error?: string;
  success?: string;
  conflict?: boolean;
  fieldErrors?: Record<string, string>;
  entry?: DailyReportEntry;
};
export type DailyReportStaff = { id: string; name: string; departmentName: string };
export type DailyReportPageData = {
  mode: "director" | "employee";
  today: string;
  selectedDate: string;
  userName: string;
  canWrite: boolean;
  recipients: string[];
  youths: ReportYouth[];
  selectedReport: DailyReportEntry | null;
  reports: DailyReportEntry[];
  staff: DailyReportStaff[];
  history: Pick<DailyReportEntry, "id" | "workDate" | "submittedAt" | "reviewedAt">[];
  historyPage: number;
  historyHasMore: boolean;
};

export function isDailyReportDirector(user: { position: { name: string } }) {
  return isApprovalAuthorityPosition(user.position.name);
}

export function canWriteDailyReport(user: {
  position: { name: string }; status: string; resignationDate: string | null; hireDate?: string | null;
}, today = getWorkLogToday()) {
  return !isDailyReportDirector(user) && user.status === "ACTIVE" &&
    (!user.resignationDate || user.resignationDate >= today) &&
    (!user.hireDate || user.hireDate <= today);
}

export function readYouthReports(value: unknown): YouthReport[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is YouthReport => Boolean(item) &&
    typeof item === "object" && typeof item.youthId === "string" &&
    typeof item.youthName === "string" && typeof item.content === "string");
}

export function parseDailyReportForm(form: FormData) {
  const fieldErrors: Record<string, string> = {};
  const workDate = String(form.get("workDate") ?? "");
  const mainContent = String(form.get("mainContent") ?? "").trim();
  const intent = String(form.get("intent") ?? "");
  const rawVersion = String(form.get("version") ?? "");
  const version = /^\d{1,9}$/.test(rawVersion) ? Number(rawVersion) : -1;
  let youthReports: DailyReportValues["youthReports"] = [];
  try {
    const raw = String(form.get("youthReports") ?? "[]");
    if (raw.length > 900000) throw new Error("Too large");
    const items: unknown = JSON.parse(raw);
    if (!Array.isArray(items) || items.length > dailyReportYouthCountLimit) throw new Error("Invalid list");
    const ids = new Set<string>();
    youthReports = items.map((item: unknown) => {
      if (!item || typeof item !== "object" || !("youthId" in item) || !("content" in item) ||
        typeof item.youthId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(item.youthId) ||
        typeof item.content !== "string" || ids.has(item.youthId)) throw new Error("Invalid youth");
      ids.add(item.youthId);
      const content = item.content.trim();
      if (content.length > dailyReportYouthLimit) fieldErrors[`youth-${item.youthId}`] = `청소년별 보고는 ${dailyReportYouthLimit.toLocaleString()}자 이내로 작성해 주세요.`;
      return { youthId: item.youthId, content };
    }).filter(item => item.content);
  } catch {
    fieldErrors.youthReports = "청소년별 입력 정보를 확인할 수 없습니다. 입력을 보관한 뒤 새로고침해 주세요.";
  }
  if (!isWorkLogDate(workDate) || workDate > getWorkLogToday()) fieldErrors.workDate = "오늘 또는 이전 날짜를 선택해 주세요.";
  if (intent !== "draft" && intent !== "submit") fieldErrors.intent = "저장 방식을 확인해 주세요.";
  if (version < 0) fieldErrors.version = "보고서 버전을 확인할 수 없습니다. 새로고침해 주세요.";
  if (intent === "submit" && !mainContent) fieldErrors.mainContent = "주요 업무보고 내용을 입력해 주세요.";
  if (mainContent.length > dailyReportMainLimit) fieldErrors.mainContent = "주요 업무보고는 10,000자 이내로 작성해 주세요.";
  return { values: { workDate, mainContent, youthReports }, intent, version, fieldErrors };
}
