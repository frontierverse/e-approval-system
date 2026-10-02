import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOperationalYouthIds } from "@/lib/youth-record-access";
import { youthOperationalWhere } from "@/lib/youth-retention-core";
import { canWriteDailyReport, isDailyReportDirector, readYouthReports, type DailyReportPageData, type DailyReportHomeSummary } from "@/lib/daily-report-core";
import { getWorkLogToday, isWorkLogDate, parseWorkLogDateValue } from "@/lib/work-log-core";

export const dailyReportSelect = {
  id: true, authorId: true, workDate: true, mainContent: true, youthReports: true,
  version: true, submittedAt: true, reviewedAt: true, updatedAt: true,
  author: { select: { name: true, department: { select: { name: true } } } },
  reviewedBy: { select: { name: true } },
} as const satisfies Prisma.DailyWorkReportSelect;

export async function getDailyReportHomeSummary(): Promise<DailyReportHomeSummary | null> {
  const user = await requireUser();
  const today = getWorkLogToday();
  const director = isDailyReportDirector(user);
  if (!director && !canWriteDailyReport(user, today)) return null;

  try {
    const workDate = parseWorkLogDateValue(today);
    if (director) {
      // Submission metadata only: drafts and report content never reach the home page.
      const reports = await prisma.dailyWorkReport.findMany({
        where: { workDate, submittedAt: { not: null } },
        select: { reviewedAt: true },
      });
      return { mode: "director", today, submitted: reports.length, unreviewed: reports.filter(report => !report.reviewedAt).length };
    }
    const report = await prisma.dailyWorkReport.findUnique({
      where: { authorId_workDate: { authorId: user.id, workDate } },
      select: { submittedAt: true, reviewedAt: true },
    });
    return { mode: "employee", today, status: !report ? "missing" : !report.submittedAt ? "draft" : report.reviewedAt ? "reviewed" : "submitted" };
  } catch (error) {
    console.error("Failed to load daily report home summary", error);
    return { mode: "unavailable", today };
  }
}

export function mapDailyReport(record: Prisma.DailyWorkReportGetPayload<{ select: typeof dailyReportSelect }>, allowedYouthIds?: ReadonlySet<string>) {
  return {
    id: record.id, authorId: record.authorId, authorName: record.author.name,
    departmentName: record.author.department.name, workDate: record.workDate.toISOString().slice(0, 10),
    mainContent: record.mainContent, youthReports: readYouthReports(record.youthReports).filter(note => !allowedYouthIds || allowedYouthIds.has(note.youthId)), version: record.version,
    submittedAt: record.submittedAt?.toISOString() ?? null, reviewedAt: record.reviewedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(), reviewedByName: record.reviewedBy?.name ?? null,
  };
}

// Select only names and identifiers; contact, case-file and medical data are not needed for reporting.
export function reportYouthWhere(date: string): Prisma.YouthWhereInput {
  return { AND: [
    youthOperationalWhere(getWorkLogToday()),
    { OR: [{ admissionDate: null }, { admissionDate: { lte: date } }] },
    { OR: [{ dischargeDate: null }, { dischargeDate: { gte: date } }] },
  ] };
}

export async function getDailyReportPageData(date?: string, page?: string): Promise<DailyReportPageData> {
  const user = await requireUser();
  const today = getWorkLogToday();
  const allowedYouthIds = new Set(await getOperationalYouthIds());
  const selectedDate = date && isWorkLogDate(date) && date <= today ? date : today;
  const parsedPage = Number(page);
  const historyPage = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 100000) : 1;
  const base: DailyReportPageData = {
    mode: isDailyReportDirector(user) ? "director" : "employee", today, selectedDate,
    userName: user.name, canWrite: canWriteDailyReport(user, today), recipients: [],
    youths: [], selectedReport: null, reports: [], staff: [], history: [], historyPage, historyHasMore: false,
  };
  if (base.mode === "director") {
    const [records, employees] = await Promise.all([
      prisma.dailyWorkReport.findMany({
        where: { workDate: parseWorkLogDateValue(selectedDate), submittedAt: { not: null } },
        select: dailyReportSelect, orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
      }),
      prisma.user.findMany({
        where: { AND: [
          // Keep former employees in past-day submission counts.
          { OR: [{ status: "ACTIVE" }, { resignationDate: { gte: selectedDate } }] },
          { OR: [{ hireDate: null }, { hireDate: { lte: selectedDate } }] },
          { OR: [{ resignationDate: null }, { resignationDate: { gte: selectedDate } }] },
        ] },
        select: { id: true, name: true, position: { select: { name: true } }, department: { select: { name: true } } },
        orderBy: { name: "asc" },
      }),
    ]);
    base.reports = records.map(record => mapDailyReport(record, allowedYouthIds));
    const staff = new Map(employees.filter(employee => !isDailyReportDirector(employee)).map(employee => [employee.id, {
      id: employee.id, name: employee.name, departmentName: employee.department.name,
    }]));
    // A later change in employment or position must never hide an archived report.
    for (const entry of base.reports) staff.set(entry.authorId, { id: entry.authorId, name: entry.authorName, departmentName: entry.departmentName });
    base.staff = [...staff.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return base;
  }

  const [record, youths, recipientUsers, history] = await Promise.all([
    prisma.dailyWorkReport.findUnique({ where: { authorId_workDate: { authorId: user.id, workDate: parseWorkLogDateValue(selectedDate) } }, select: dailyReportSelect }),
    prisma.youth.findMany({ where: reportYouthWhere(selectedDate), select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { status: "ACTIVE", AND: [
        { OR: [{ resignationDate: null }, { resignationDate: { gte: today } }] },
        { OR: [{ hireDate: null }, { hireDate: { lte: today } }] },
      ] }, select: { name: true, position: { select: { name: true } } },
    }),
    prisma.dailyWorkReport.findMany({
      where: { authorId: user.id }, orderBy: { workDate: "desc" }, skip: (historyPage - 1) * 15, take: 16,
      select: { id: true, workDate: true, submittedAt: true, reviewedAt: true },
    }),
  ]);
  base.selectedReport = record ? mapDailyReport(record, allowedYouthIds) : null;
  base.youths = youths;
  base.recipients = recipientUsers.filter(isDailyReportDirector).map(recipient => recipient.name);
  base.historyHasMore = history.length > 15;
  base.history = history.slice(0, 15).map(entry => ({
    id: entry.id, workDate: entry.workDate.toISOString().slice(0, 10),
    submittedAt: entry.submittedAt?.toISOString() ?? null, reviewedAt: entry.reviewedAt?.toISOString() ?? null,
  }));
  return base;
}
