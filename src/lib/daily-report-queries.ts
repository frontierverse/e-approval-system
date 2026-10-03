import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getOperationalYouthIds } from "@/lib/youth-record-access";
import { youthOperationalWhere } from "@/lib/youth-retention-core";
import { canWriteDailyReport, isDailyReportDirector, readYouthReports, type DailyReportPageData, type DailyReportHomeSummary, type DailyReportEntry } from "@/lib/daily-report-core";
import { getWorkLogToday, isWorkLogDate, parseWorkLogDateValue } from "@/lib/work-log-core";


export const dailyReportActorSelect = {
  id: true, name: true, status: true, hireDate: true, resignationDate: true,
  position: { select: { name: true } },
} as const satisfies Prisma.UserSelect;
export type DailyReportActor = Prisma.UserGetPayload<{ select: typeof dailyReportActorSelect }>;
export type DailyReportDb = Pick<Prisma.TransactionClient, "dailyWorkReport" | "user" | "youth">;
export function getDailyReportActor(userId: string, db: DailyReportDb = prisma) {
  return db.user.findUnique({ where: { id: userId }, select: dailyReportActorSelect });
}
export function dailyReportStatus(report: { submittedAt: Date | string | null; reviewedAt: Date | string | null } | null) {
  return !report ? "missing" as const : !report.submittedAt ? "draft" as const : report.reviewedAt ? "reviewed" as const : "submitted" as const;
}

export const dailyReportSelect = {
  id: true, authorId: true, workDate: true, mainContent: true, youthReports: true,
  version: true, submittedAt: true, reviewedAt: true, updatedAt: true,
  author: { select: { name: true, department: { select: { name: true } } } },
  reviewedBy: { select: { name: true } },
} as const satisfies Prisma.DailyWorkReportSelect;

export async function getDailyReportHomeSummaryForActor(user: DailyReportActor, db: DailyReportDb = prisma, today = getWorkLogToday()): Promise<DailyReportHomeSummary | null> {
  const director = isDailyReportDirector(user);
  if (!director && !canWriteDailyReport(user, today)) return null;

  try {
    const workDate = parseWorkLogDateValue(today);
    if (director) {
      // Submission metadata only: drafts and report content never reach the home page.
      const reports = await db.dailyWorkReport.findMany({
        where: { workDate, submittedAt: { not: null } },
        select: { reviewedAt: true },
      });
      return { mode: "director", today, submitted: reports.length, unreviewed: reports.filter(report => !report.reviewedAt).length };
    }
    const report = await db.dailyWorkReport.findUnique({
      where: { authorId_workDate: { authorId: user.id, workDate } },
      select: { submittedAt: true, reviewedAt: true },
    });
    return { mode: "employee", today, status: dailyReportStatus(report) };
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
export function reportYouthWhere(date: string, today = getWorkLogToday()): Prisma.YouthWhereInput {
  return { AND: [
    youthOperationalWhere(today),
    { OR: [{ admissionDate: null }, { admissionDate: { lte: date } }] },
    { OR: [{ dischargeDate: null }, { dischargeDate: { gte: date } }] },
  ] };
}

export async function getDailyReportPageDataForActor(user: DailyReportActor, date?: string, page?: string, db: DailyReportDb = prisma, today = getWorkLogToday()): Promise<DailyReportPageData> {
  const allowedYouthIds = new Set(await getOperationalYouthIds(db));
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
      db.dailyWorkReport.findMany({
        where: { workDate: parseWorkLogDateValue(selectedDate), submittedAt: { not: null } },
        select: dailyReportSelect, orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
      }),
      db.user.findMany({
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
    db.dailyWorkReport.findUnique({ where: { authorId_workDate: { authorId: user.id, workDate: parseWorkLogDateValue(selectedDate) } }, select: dailyReportSelect }),
    db.youth.findMany({ where: reportYouthWhere(selectedDate, today), select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({
      where: { status: "ACTIVE", AND: [
        { OR: [{ resignationDate: null }, { resignationDate: { gte: today } }] },
        { OR: [{ hireDate: null }, { hireDate: { lte: today } }] },
      ] }, select: { name: true, position: { select: { name: true } } },
    }),
    db.dailyWorkReport.findMany({
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


export const dailyReportHistorySelect = { id: true, workDate: true, submittedAt: true, reviewedAt: true } as const satisfies Prisma.DailyWorkReportSelect;
export type DailyReportListFilters = { date: string; page: number; filter: "all" | "unread" | "missing" | "reviewed"; q: string };

export async function getDailyReportEditorForActor(user: DailyReportActor, date: string, db: DailyReportDb = prisma, today = getWorkLogToday()) {
  const [record, youths, recipients, allowedIds] = await Promise.all([
    db.dailyWorkReport.findUnique({ where: { authorId_workDate: { authorId: user.id, workDate: parseWorkLogDateValue(date) } }, select: dailyReportSelect }),
    db.youth.findMany({ where: reportYouthWhere(date, today), select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { status: "ACTIVE", AND: [
      { OR: [{ resignationDate: null }, { resignationDate: { gte: today } }] },
      { OR: [{ hireDate: null }, { hireDate: { lte: today } }] },
    ] }, select: { name: true, position: { select: { name: true } } } }),
    getOperationalYouthIds(db),
  ]);
  const entry = record ? mapDailyReport(record, new Set(allowedIds)) : null;
  const available = new Map(youths.map(youth => [youth.id, youth]));
  // Existing operational snapshots remain editable if the report-day roster changed.
  // Their stored name takes precedence, matching the web editor.
  for (const note of entry?.youthReports ?? []) available.set(note.youthId, { id: note.youthId, name: note.youthName });
  return { mode: "employee" as const, today, selectedDate: date, userName: user.name, canWrite: canWriteDailyReport(user, today),
    recipients: recipients.filter(isDailyReportDirector).map(person => person.name),
    youths: [...available.values()].sort((a, b) => a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id)), entry };
}

export async function getDailyReportListForActor(user: DailyReportActor, filters: DailyReportListFilters, db: DailyReportDb = prisma, today = getWorkLogToday()) {
  if (!isDailyReportDirector(user)) {
    const [total, current] = await Promise.all([
      db.dailyWorkReport.count({ where: { authorId: user.id } }),
      db.dailyWorkReport.findUnique({ where: { authorId_workDate: { authorId: user.id, workDate: parseWorkLogDateValue(today) } }, select: { submittedAt: true, reviewedAt: true } }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / 15));
    const page = Math.min(filters.page, totalPages);
    const records = await db.dailyWorkReport.findMany({ where: { authorId: user.id }, select: dailyReportHistorySelect,
      orderBy: { workDate: "desc" }, skip: (page - 1) * 15, take: 15 });
    return { mode: "employee" as const, today, userName: user.name, canWrite: canWriteDailyReport(user, today), todayStatus: dailyReportStatus(current),
      history: records.map(record => ({ id: record.id, workDate: record.workDate.toISOString().slice(0, 10), submittedAt: record.submittedAt?.toISOString() ?? null, reviewedAt: record.reviewedAt?.toISOString() ?? null })),
      page, pageSize: 15 as const, total, totalPages };
  }
  // Search only filtered, authorized content. Never search raw retained youth JSON.
  const data = await getDailyReportPageDataForActor(user, filters.date, undefined, db, today);
  const byAuthor = new Map(data.reports.map(report => [report.authorId, report]));
  const priority = (report: DailyReportEntry | null) => !report ? 1 : report.reviewedAt ? 2 : 0;
  const allRows = data.staff.map(staff => ({ staff, report: byAuthor.get(staff.id) ?? null }));
  const counts = { staff: allRows.length, submitted: data.reports.length,
    missing: allRows.filter(row => !row.report).length, unreviewed: data.reports.filter(report => !report.reviewedAt).length };
  const query = filters.q.toLocaleLowerCase();
  const rows = allRows.filter(({ staff, report }) => {
    const status = !report ? "missing" : report.reviewedAt ? "reviewed" : "unread";
    if (filters.filter !== "all" && filters.filter !== status) return false;
    return [staff.name, staff.departmentName, report?.mainContent, ...(report?.youthReports.map(note => `${note.youthName} ${note.content}`) ?? [])]
      .join(" ").toLocaleLowerCase().includes(query);
  }).sort((a, b) => priority(a.report) - priority(b.report) || a.staff.name.localeCompare(b.staff.name, "ko") || a.staff.id.localeCompare(b.staff.id));
  const total = rows.length, totalPages = Math.max(1, Math.ceil(total / 20)), page = Math.min(filters.page, totalPages);
  return { mode: "director" as const, today, selectedDate: filters.date, userName: user.name, canWrite: false as const,
    filter: filters.filter, q: filters.q, counts, rows: rows.slice((page - 1) * 20, page * 20).map(({ staff, report }) => ({ staff, report: report ? {
      id: report.id, workDate: report.workDate, version: report.version, submittedAt: report.submittedAt!, reviewedAt: report.reviewedAt, updatedAt: report.updatedAt,
    } : null })), page, pageSize: 20 as const, total, totalPages };
}

export async function getDailyReportDetailForActor(user: DailyReportActor, id: string, db: DailyReportDb = prisma) {
  const record = await db.dailyWorkReport.findFirst({ where: { id, ...(isDailyReportDirector(user) ? { submittedAt: { not: null } } : { authorId: user.id }) }, select: dailyReportSelect });
  if (!record) return null;
  const allowedIds = new Set(await getOperationalYouthIds(db));
  return mapDailyReport(record, allowedIds);
}
