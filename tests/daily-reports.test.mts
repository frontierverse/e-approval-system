import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { canWriteDailyReport, parseDailyReportForm } from "../src/lib/daily-report-core.ts";
import { getWorkLogToday } from "../src/lib/work-log-core.ts";

// Test the real query and action modules against an isolated transaction store.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const employee = { id: "employee", name: "직원", role: "USER", status: "ACTIVE", hireDate: null, resignationDate: null, position: { name: "생활지도원" }, department: { name: "운영팀" } };
const director = { ...employee, id: "director", name: "시설장", position: { name: "시설장" } };
const colleague = { ...employee, id: "colleague", name: "동료", role: "ADMIN" };
const harness = { user: employee as Row | null, users: [] as Row[], reports: [] as Row[], youths: [] as Row[], audits: [] as Row[], reads: [] as Row[], invalidated: [] as string[], failAudit: false, race: false };
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((part: Row) => matches(row, part));
    if (key === "OR") return value.some((part: Row) => matches(row, part));
    if (key === "authorId_workDate") return matches(row, value);
    const current = row[key];
    if (value instanceof Date) return current?.getTime() === value.getTime();
    if (value === null || typeof value !== "object") return current === value;
    if ("not" in value && current === value.not) return false;
    if ("gte" in value && !(current !== null && current >= value.gte)) return false;
    if ("lte" in value && !(current !== null && current <= value.lte)) return false;
    return true;
  });
}
function selected(row: Row, select: Row): Row {
  return Object.fromEntries(Object.entries(select).filter(([, include]) => include).map(([key, include]) => [key,
    typeof include === "object" && row[key] ? selected(row[key], include.select) : row[key],
  ]));
}
function reportRow(row: Row) {
  return { ...row, author: harness.users.find(user => user.id === row.authorId), reviewedBy: harness.users.find(user => user.id === row.reviewedById) ?? null };
}
const db = {
  dailyWorkReport: {
    async findUnique({ where, select }: Row) { const row = harness.reports.find(row => matches(row, where)); return row ? selected(reportRow(row), select) : null; },
    async findUniqueOrThrow(args: Row) { const row = await this.findUnique(args); if (!row) throw new Error("Missing report"); return row; },
    async findMany({ where, select, skip = 0, take }: Row) {
      harness.reads.push({ table: "reports", where });
      return harness.reports.filter(row => matches(row, where)).sort((a, b) => b.workDate - a.workDate).slice(skip, take ? skip + take : undefined).map(row => selected(reportRow(row), select));
    },
    async create({ data, select }: Row) {
      assert.equal(harness.reports.some(row => row.authorId === data.authorId && row.workDate.getTime() === data.workDate.getTime()), false);
      const row = { id: `report-${harness.reports.length + 1}`, version: 1, reviewedAt: null, reviewedById: null, updatedAt: new Date(), ...data };
      harness.reports.push(row); return selected(reportRow(row), select);
    },
    async updateMany({ where, data }: Row) {
      if (harness.race) return { count: 0 };
      const row = harness.reports.find(row => matches(row, where));
      if (!row) return { count: 0 };
      const version = row.version + (data.version?.increment ?? 0);
      Object.assign(row, data, { version, updatedAt: new Date() }); return { count: 1 };
    },
  },
  user: { async findUnique({ where, select }: Row) { const row = harness.users.find(row => matches(row, where)); return row ? selected(row, select) : null; }, async findMany({ where, select }: Row) { return harness.users.filter(row => matches(row, where)).map(row => selected(row, select)); } },
  youth: { async findMany({ where, select }: Row) { return harness.youths.filter(row => matches(row, where)).map(row => selected(row, select)); } },
  auditLog: { async create({ data }: Row) { if (harness.failAudit) throw new Error("Audit unavailable"); harness.audits.push(data); } },
  async $transaction(operation: (tx: Row) => Promise<unknown>) {
    const snapshot = structuredClone({ reports: harness.reports, audits: harness.audits });
    try { return await operation(db); } catch (error) { Object.assign(harness, snapshot); throw error; }
  },
};
const key = "__dailyReportHarness";
(globalThis as Row)[key] = { harness, db };
function moduleUrl(source: string) { return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`; }
const mocks = moduleUrl(`
  const { harness: h, db } = globalThis.${key};
  export const prisma = db;
  export async function requireUser() { if (!h.user) throw new Error("Unauthenticated"); return h.user; }
  export function revalidatePath(path) { h.invalidated.push(path); }
  export async function getCurrentAuditLogRequestData() { return {}; }
`);
const aliases = { "@/lib/prisma": mocks, "@/lib/auth": mocks, "next/cache": mocks, "@/lib/audit-log-request": mocks };
function compile(file: string, replacements: Record<string, string>) {
  let source = readFileSync(new URL(file, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`"${from}"`, JSON.stringify(to));
  return moduleUrl(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
const accessUrl = compile("../src/lib/youth-record-access.ts", aliases);
const queryAliases = { ...aliases, "@/lib/youth-record-access": accessUrl };
const queryDomainUrl = compile("../src/lib/daily-report-queries.ts", queryAliases);
const sharedAliases = { ...queryAliases, "@/lib/daily-report-queries": queryDomainUrl };
const queryUrl = compile("../src/lib/daily-reports.ts", sharedAliases);
const mutationUrl = compile("../src/lib/daily-report-mutations.ts", sharedAliases);
const cacheUrl = compile("../src/lib/daily-report-cache.ts", aliases);
const queries = await import(queryUrl);
const actions = await import(compile("../src/app/work-schedule/daily-reports/actions.ts", { ...sharedAliases, "@/lib/daily-report-mutations": mutationUrl, "@/lib/daily-report-cache": cacheUrl }));
function form(overrides: Row = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ workDate: "2026-09-01", mainContent: "당일 주요 업무", youthReports: "[]", version: "0", intent: "submit", ...overrides })) data.set(key, String(value));
  return data;
}
async function save(overrides: Row = {}) { return actions.saveDailyReportAction({}, form(overrides)); }
beforeEach(() => {
  harness.user = employee; harness.users = structuredClone([employee, director, colleague]);
  harness.youths = [{ id: "youth-1", name: "청소년가", admissionDate: "2026-08-01", dischargeDate: null, actualDischargeDate: null, purgeStartedAt: null, purgedAt: null, phone: "must-not-leak" }];
  harness.reports = []; harness.audits = []; harness.reads = []; harness.invalidated = []; harness.failAudit = false; harness.race = false;
});
after(() => { delete (globalThis as Row)[key]; });

test("home summary distinguishes missing, private draft, submitted and reviewed without report content", async () => {
  const today = getWorkLogToday();
  assert.deepEqual(await queries.getDailyReportHomeSummary(), { mode: "employee", today, status: "missing" });
  await save({ workDate: today, intent: "draft" });
  assert.deepEqual(await queries.getDailyReportHomeSummary(), { mode: "employee", today, status: "draft" });
  harness.user = colleague;
  assert.equal((await queries.getDailyReportHomeSummary()).status, "missing");
  harness.user = director;
  assert.deepEqual(await queries.getDailyReportHomeSummary(), { mode: "director", today, submitted: 0, unreviewed: 0 });
  harness.user = employee;
  const saved = await save({ workDate: today, version: 1 });
  assert.ok(harness.invalidated.includes("/"));
  assert.deepEqual(await queries.getDailyReportHomeSummary(), { mode: "employee", today, status: "submitted" });
  harness.user = director;
  assert.deepEqual(await queries.getDailyReportHomeSummary(), { mode: "director", today, submitted: 1, unreviewed: 1 });
  await actions.reviewDailyReportAction({}, form({ id: saved.entry.id, version: 2 }));
  assert.deepEqual(await queries.getDailyReportHomeSummary(), { mode: "director", today, submitted: 1, unreviewed: 0 });
  harness.user = employee;
  assert.deepEqual(await queries.getDailyReportHomeSummary(), { mode: "employee", today, status: "reviewed" });
  harness.user = { ...employee, status: "INACTIVE" };
  assert.equal(await queries.getDailyReportHomeSummary(), null);
});

test("all employed staff including non-director admins can write; directors and former staff cannot", async () => {
  assert.equal(canWriteDailyReport(employee), true);
  assert.equal(canWriteDailyReport(colleague), true);
  assert.equal(canWriteDailyReport(director), false);
  assert.equal(canWriteDailyReport({ ...employee, resignationDate: "2020-01-01" }), false);
  assert.equal(canWriteDailyReport({ ...employee, status: "INACTIVE" }), false);
  harness.user = director; assert.match((await save()).error, /시설장을 제외/);
  assert.equal(harness.reports.length, 0);
  harness.user = colleague; assert.ok((await save()).success);
});
test("main report is required only for submission; youth fields are optional and bounded", () => {
  assert.ok(parseDailyReportForm(form({ mainContent: "  " })).fieldErrors.mainContent);
  assert.deepEqual(parseDailyReportForm(form({ mainContent: "", intent: "draft" })).fieldErrors, {});
  assert.deepEqual(parseDailyReportForm(form()).fieldErrors, {});
  for (const raw of ["{", "null", JSON.stringify([{ youthId: "x", content: "a" }, { youthId: "x", content: "b" }])]) assert.ok(parseDailyReportForm(form({ youthReports: raw })).fieldErrors.youthReports);
  assert.ok(parseDailyReportForm(form({ workDate: "9999-01-01" })).fieldErrors.workDate);
  assert.ok(parseDailyReportForm(form({ mainContent: "가".repeat(10001) })).fieldErrors.mainContent);
  assert.ok(parseDailyReportForm(form({ youthReports: JSON.stringify([{ youthId: "x", content: "가".repeat(4001) }]) })).fieldErrors["youth-x"]);
});
test("drafts are private, submitted reports reach the director, admins only see their own", async () => {
  const draft = await save({ intent: "draft", youthReports: JSON.stringify([{ youthId: "youth-1", content: "대화 기록", youthName: "위조 이름" }]) });
  assert.equal(draft.entry.youthReports[0].youthName, "청소년가");
  harness.user = director;
  let data = await queries.getDailyReportPageData("2026-09-01");
  assert.deepEqual(data.reports, []); assert.deepEqual(data.history, []); assert.deepEqual(data.youths, []);
  assert.equal(data.staff.length, 2);
  harness.user = employee; assert.ok((await save({ version: 1 })).success);
  harness.user = director; data = await queries.getDailyReportPageData("2026-09-01");
  assert.equal(data.reports.length, 1);
  harness.user = colleague; data = await queries.getDailyReportPageData("2026-09-01");
  assert.equal(data.mode, "employee"); assert.equal(data.selectedReport, null); assert.deepEqual(data.history, []);
  assert.equal(JSON.stringify(data).includes("당일 주요 업무"), false);
  assert.deepEqual(data.youths, [{ id: "youth-1", name: "청소년가" }]);
});
test("date archives stay separate and history is paginated", async () => {
  for (let day = 1; day <= 17; day++) assert.ok((await save({ workDate: `2026-08-${String(day).padStart(2, "0")}` })).success);
  const first = await queries.getDailyReportPageData("2026-08-01");
  const second = await queries.getDailyReportPageData("2026-08-17", "2");
  assert.equal(first.selectedReport.workDate, "2026-08-01");
  assert.equal(first.history.length, 15); assert.equal(first.historyHasMore, true);
  assert.equal(second.history.length, 2); assert.equal(second.historyHasMore, false);
  assert.equal((await queries.getDailyReportPageData("2026-08-18")).selectedReport, null);
});
test("review is director only, submitted only, version checked; a correction resets review", async () => {
  const saved = await save();
  const review = () => actions.reviewDailyReportAction({}, form({ id: saved.entry.id, version: 1 }));
  assert.match((await review()).error, /시설장만/);
  harness.user = director; assert.ok((await review()).success);
  harness.user = employee; const edited = await save({ version: 1, mainContent: "수정한 당일 업무" });
  assert.ok(edited.success); assert.equal(edited.entry.reviewedAt, null); assert.equal(edited.entry.version, 2);
  harness.user = director; assert.match((await review()).error, /변경되었거나/);
  harness.user = employee; const draft = await save({ workDate: "2026-09-02", intent: "draft" });
  harness.user = director; assert.ok((await actions.reviewDailyReportAction({}, form({ id: draft.entry.id, version: 1 }))).error);
});
test("conflicts and duplicate requests do not overwrite, failed audit rolls back", async () => {
  const result = await save({ authorId: colleague.id });
  assert.ok(result.success);
  assert.equal(result.entry.authorId, employee.id);
  assert.equal((await save({ mainContent: "duplicate overwrite" })).conflict, true);
  assert.equal(harness.reports[0].mainContent, "당일 주요 업무");
  harness.race = true; assert.equal((await save({ version: 1 })).conflict, true); harness.race = false;
  harness.failAudit = true;
  const oldError = console.error; console.error = () => {};
  try { assert.ok((await save({ version: 1, mainContent: "rollback" })).error); } finally { console.error = oldError; }
  assert.equal(harness.reports[0].mainContent, "당일 주요 업무"); assert.equal(harness.reports[0].version, 1);
});
test("discharged notes are hidden from queries and edits but preserved until reviewed purge", async () => {
  assert.ok((await save({ youthReports: JSON.stringify([{ youthId: "unknown", content: "기록" }]) })).error);
  const notes = JSON.stringify([{ youthId: "youth-1", content: "활동 기록" }]);
  assert.ok((await save({ youthReports: notes })).success);
  harness.youths[0].actualDischargeDate = "2026-09-01";
  const page = await queries.getDailyReportPageData("2026-09-01");
  assert.deepEqual(page.youths, []); assert.deepEqual(page.selectedReport.youthReports, []);
  assert.equal(JSON.stringify(page).includes("활동 기록"), false);
  assert.ok((await save({ version: 1, youthReports: notes })).error);
  const edited = await save({ version: 1, youthReports: "[]" });
  assert.ok(edited.success); assert.deepEqual(edited.entry.youthReports, []);
  assert.equal(harness.reports[0].youthReports[0].youthName, "청소년가");
  assert.equal(harness.reports[0].youthReports[0].content, "활동 기록");
  harness.user = director;
  assert.deepEqual((await queries.getDailyReportPageData("2026-09-01")).reports[0].youthReports, []);
});

test("a missing director blocks submission but not drafting; signed-out access fails", async () => {
  harness.users = [employee, colleague]; assert.match((await save()).error, /시설장이 등록/);
  assert.ok((await save({ intent: "draft" })).success);
  harness.user = null;
  await assert.rejects(save(), /Unauthenticated/);
  await assert.rejects(queries.getDailyReportPageData(), /Unauthenticated/);
});
