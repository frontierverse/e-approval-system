import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";
import { compileDocumentTemplateContent } from "../src/lib/draft-template-content.ts";
import { getMeetingMinutesDocumentTemplateSchema } from "../src/lib/document-template-schema.ts";
import { getWorkLogMeetingDate } from "../src/lib/work-log-linked-meetings-core.ts";

// This in-memory Prisma double supports heterogeneous relation filters and projections.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const schema = getMeetingMinutesDocumentTemplateSchema();
const harness = {
  currentUser: { id: "employee", role: "USER" } as Row | null,
  documents: [] as Row[],
  logs: [] as Row[],
  tasks: [] as Row[],
  reads: [] as Row[],
  failMeetings: false,
  beforeMeetingRead: null as ((options: Row) => void) | null,
  prisma: {} as Row,
};

function equals(left: unknown, right: unknown) {
  return left instanceof Date && right instanceof Date ? left.getTime() === right.getTime() : left === right;
}

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (Array.isArray(value) ? value : [value]).every((clause: Row) => matches(row, clause));
    if (key === "OR") return value.some((clause: Row) => matches(row, clause));
    if (key === "authorId_workDate") return matches(row, value);
    if (value === null || value instanceof Date || typeof value !== "object") return equals(row[key], value);
    if ("not" in value && equals(row[key], value.not)) return false;
    if ("in" in value && !value.in.some((item: unknown) => equals(row[key], item))) return false;
    if ("notIn" in value && value.notIn.some((item: unknown) => equals(row[key], item))) return false;
    if ("gte" in value && !(row[key] != null && row[key] >= value.gte)) return false;
    if ("lte" in value && !(row[key] != null && row[key] <= value.lte)) return false;
    if ("lt" in value && !(row[key] != null && row[key] < value.lt)) return false;
    if ("some" in value) return (row[key] ?? []).some((item: Row) => matches(item, value.some));
    if ("is" in value) return row[key] !== null && matches(row[key], value.is);
    return true;
  });
}

function project(row: Row, select: Row | undefined): Row {
  if (!select) return structuredClone(row);
  return Object.fromEntries(Object.entries(select).filter(([, selection]) => selection).map(([key, selection]) => {
    if (selection === true) return [key, structuredClone(row[key])];
    const relation = selection as Row;
    const value = row[key];
    return [key, Array.isArray(value)
      ? findMany(value, relation)
      : value === null || value === undefined ? value : project(value, relation.select)];
  }));
}

function findMany(rows: Row[], options: Row): Row[] {
  let result = rows.filter((row) => matches(row, options.where));
  const ordering = Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy ?? {}];
  result = result.slice().sort((a, b) => {
    for (const order of ordering) {
      for (const [field, direction] of Object.entries(order)) {
        const value = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
        if (value) return direction === "desc" ? -value : value;
      }
    }
    return 0;
  });
  if (options.take !== undefined) result = result.slice(0, options.take);
  return result.map((row) => project(row, options.select));
}

const database = {
  approvalDocument: {
    async findMany(options: Row) {
      harness.reads.push({ model: "approvalDocument", ...options });
      if (harness.failMeetings) throw new Error("Meeting documents unavailable");
      harness.beforeMeetingRead?.(options);
      return findMany(harness.documents, options);
    },
  },
  workLog: {
    async findUnique(options: Row) {
      const row = harness.logs.find((record) => matches(record, options.where));
      return row ? project(row, options.select) : null;
    },
    async findMany(options: Row) { return findMany(harness.logs, options); },
  },
  staffTask: {
    async findMany(options: Row) { return findMany(harness.tasks, options); },
  },
  async $queryRaw() { return []; },
};
harness.prisma = database;

const harnessKey = "__workLogMeetingDocumentHarness";
(globalThis as Row)[harnessKey] = harness;
const mockModule = moduleUrl(`
const h = globalThis.${harnessKey};
export const prisma = h.prisma;
export async function getCurrentUser() { return h.currentUser; }
export async function getWorkLogLinkedScheduleLoadState() { return { status: "ready", schedules: [] }; }
`);
const aliases = {
  "@/lib/prisma": mockModule,
  "@/lib/auth": mockModule,
  "@/lib/work-log-linked-schedules": mockModule,
};
const queryModule = compileModule("../src/lib/work-logs.ts", aliases);
const queries = await import(queryModule);
const route = await import(compileModule("../src/app/api/work-logs/[date]/route.ts", { ...aliases, "@/lib/work-logs": queryModule }));

function moduleUrl(source: string) { return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`; }
function compileModule(path: string, replacements: Record<string, string>) {
  let source = readFileSync(new URL(path, import.meta.url), "utf8");
  for (const [specifier, replacement] of Object.entries(replacements)) source = source.replaceAll(`"${specifier}"`, JSON.stringify(replacement));
  return moduleUrl(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}

function meetingContent(meetingDate: string) {
  return compileDocumentTemplateContent(schema, {
    meetingTitle: "운영 회의",
    meetingDate,
    location: "회의실",
    attendees: "테스트 직원, 동료",
    host: "진행 담당자",
    agenda: "내부 운영 논의",
    discussion: "PRIVATE DISCUSSION BODY",
  });
}

function attachment(overrides: Row = {}) {
  return {
    id: "attachment-1",
    originalName: "운영회의록.pdf",
    mimeType: "application/pdf",
    size: 2048,
    createdAt: new Date("2026-09-09T02:00:00Z"),
    signedAt: null,
    signedSourceAttachmentId: null,
    convertedAt: null,
    convertedSourceAttachmentId: null,
    storageProvider: "PRIVATE STORAGE PROVIDER",
    storageKey: "PRIVATE STORAGE KEY",
    uploaderId: "PRIVATE UPLOADER",
    ...overrides,
  };
}

function addMeeting(overrides: Row = {}) {
  const record = {
    id: `meeting-${harness.documents.length + 1}`,
    documentNo: `2026-${harness.documents.length + 1}`,
    title: "운영 회의록",
    templateId: "template-meeting-minutes",
    template: { schema },
    drafterId: "employee",
    drafter: { name: "테스트 직원" },
    approvalSteps: [],
    status: "APPROVED",
    content: meetingContent("2026-09-08"),
    createdAt: new Date("2026-09-09T01:00:00Z"),
    updatedAt: new Date("2026-09-09T03:00:00Z"),
    completedAt: new Date("2026-09-09T04:00:00Z"),
    discardedAt: null,
    attachments: [attachment()],
    ...overrides,
  };
  harness.documents.push(record);
  return record;
}

function addLog() {
  const record = {
    id: "manual-log",
    authorId: "employee",
    author: { name: "테스트 직원" },
    workDate: new Date("2026-09-08T00:00:00Z"),
    keyword: "직접 입력한 키워드",
    content: "직접 입력한 상세 업무\n내용을 그대로 보존합니다.",
    createdAt: new Date("2026-09-08T01:00:00Z"),
    updatedAt: new Date("2026-09-08T02:00:00Z"),
    updatedBy: { name: "테스트 직원" },
  };
  harness.logs.push(record);
  return record;
}

async function entry(workDate = "2026-09-08", authorId = "employee") {
  return queries.getWorkLogEntry({ authorId, workDate }, database);
}

async function page(overrides: Row = {}) {
  return queries.getWorkLogPageData({ authorId: "employee", selectedDate: "2026-09-08", today: "2026-09-09", ...overrides }, database);
}

beforeEach(() => {
  harness.currentUser = { id: "employee", role: "USER" };
  harness.documents = [];
  harness.logs = [];
  harness.tasks = [];
  harness.reads = [];
  harness.failMeetings = false;
  harness.beforeMeetingRead = null;
});
after(() => { delete (globalThis as Row)[harnessKey]; });

describe("meeting minutes automatically linked to personal work logs", () => {
  test("requires one explicit meeting date field and rejects duplicate date headings", () => {
    assert.equal(getWorkLogMeetingDate(meetingContent("2028-02-29"), schema), "2028-02-29");
    assert.equal(getWorkLogMeetingDate(`${meetingContent("2026-09-08")}\n\n일시: 2026-09-09`, schema), null);
    assert.equal(getWorkLogMeetingDate(meetingContent("2026-09-08"), { ...schema, fields: schema.fields.filter((field) => field.name !== "meetingDate") }), null);
    assert.equal(getWorkLogMeetingDate(meetingContent("2026-09-08"), null), null);
  });

  test("uses the date written in the meeting minutes rather than document creation or approval dates", async () => {
    const meeting = addMeeting();
    const result = await entry();
    assert.ok(result);
    assert.equal(result.workDate, "2026-09-08");
    assert.equal(result.manualLogId, null);
    assert.equal(result.manualUpdatedAt, null);
    assert.deepEqual(result.meetingDocuments.map((document: Row) => document.id), [meeting.id]);
    assert.equal(result.meetingDocuments[0].meetingDate, "2026-09-08");
    assert.equal(await entry("2026-09-09"), null);
    assert.equal(harness.logs.length, 0);
  });

  test("includes the employee's own drafts after approval and documents assigned to them for approval", async () => {
    addMeeting({ id: "own-approved" });
    addMeeting({ id: "assigned-approved", drafterId: "colleague", drafter: { name: "다른 기안자" }, approvalSteps: [{ approverId: "employee", approver: { name: "테스트 직원" } }] });
    addMeeting({ id: "private", drafterId: "colleague", title: "PRIVATE OTHER EMPLOYEE DOCUMENT" });
    const result = await entry();
    assert.deepEqual(result.meetingDocuments.map((document: Row) => document.id).sort(), ["assigned-approved", "own-approved"]);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE OTHER EMPLOYEE/);
    assert.equal(result.authorName, "테스트 직원");
  });

  test("a meeting-only day belongs to the approving employee rather than the other drafter", async () => {
    addMeeting({ drafterId: "colleague", drafter: { name: "다른 기안자" }, approvalSteps: [{ approverId: "employee", approver: { name: "테스트 직원" } }] });
    const result = await entry();
    assert.ok(result);
    assert.equal(result.authorName, "테스트 직원");
    assert.equal(result.manualLogId, null);
  });

  test("excludes draft, pending, rejected, recalled, discarded and unrelated document types", async () => {
    for (const status of ["DRAFT", "SUBMITTED", "IN_PROGRESS", "REJECTED", "RECALLED", "DISCARDED"]) addMeeting({ status });
    addMeeting({ templateId: "template-general-draft" });
    addMeeting({ attachments: [] });
    assert.equal(await entry(), null);
    const result = await page();
    assert.deepEqual(result.contributionDates, []);
    assert.deepEqual(result.recentLogs, []);
  });

  test("never guesses a missing, impossible or ambiguous meeting date from document timestamps", async () => {
    for (const date of ["", "2026-02-30", "2026-9-8", "2026-09-08 또는 2026-09-09"]) addMeeting({ content: meetingContent(date), createdAt: new Date("2026-09-08T01:00:00Z") });
    addMeeting({ content: "회의 일자는 정해지지 않았습니다.\n작성일: 2026-09-08", createdAt: new Date("2026-09-08T01:00:00Z") });
    assert.equal(await entry(), null);
    assert.deepEqual((await page()).contributionDates, []);
  });

  test("preserves manually written content, identity and concurrency token when meeting files are linked", async () => {
    const manual = addLog();
    addMeeting();
    const result = await entry();
    assert.equal(result.id, manual.id);
    assert.equal(result.manualLogId, manual.id);
    assert.equal(result.manualUpdatedAt, manual.updatedAt.toISOString());
    assert.equal(result.keyword, manual.keyword);
    assert.equal(result.content, manual.content);
    assert.equal(result.meetingDocuments.length, 1);
    assert.deepEqual(await entry(), result);
    assert.equal(harness.logs.length, 1);
  });

  test("returns document and attachment display metadata without source content or private storage references", async () => {
    addMeeting();
    const document = (await entry()).meetingDocuments[0];
    assert.equal(document.title, "운영 회의록");
    assert.equal(document.attachments[0].originalName, "운영회의록.pdf");
    assert.equal(document.attachments[0].mimeType, "application/pdf");
    assert.equal(document.attachments[0].size, 2048);
    assert.doesNotMatch(JSON.stringify(document), /PRIVATE|storageKey|storageProvider|uploaderId|approvalSteps|discussion/);
    assert.ok(!Object.hasOwn(document, "content"));
  });

  test("shows the latest signed file once instead of its unsigned original and older signed copies", async () => {
    addMeeting({ attachments: [
      attachment({ id: "source", originalName: "회의록 원본.pdf" }),
      attachment({ id: "old-signed", signedSourceAttachmentId: "source", signedAt: new Date("2026-09-09T03:00:00Z") }),
      attachment({ id: "latest-signed", signedSourceAttachmentId: "source", signedAt: new Date("2026-09-09T04:00:00Z") }),
      attachment({ id: "separate", originalName: "회의 자료.pdf" }),
    ] });
    const documents = (await entry()).meetingDocuments;
    assert.equal(documents.length, 1);
    assert.deepEqual(documents[0].attachments.map((file: Row) => file.id).sort(), ["latest-signed", "separate"]);
    assert.equal(documents[0].attachments.find((file: Row) => file.id === "latest-signed").isSigned, true);
    assert.equal(documents[0].attachments.find((file: Row) => file.id === "separate").isSigned, false);
  });
});

describe("meeting-only work-log dates, combined days and read failures", () => {
  test("counts one day once when manual text, completed tasks and multiple meeting files coincide", async () => {
    addLog();
    addMeeting({ id: "first", attachments: [attachment({ id: "file-1" }), attachment({ id: "file-2" })] });
    addMeeting({ id: "second" });
    harness.tasks.push({ id: "task", title: "자료 정리", description: null, meetingTitle: null, assigneeId: "employee", assignee: { name: "테스트 직원" }, completedAt: new Date("2026-09-08T01:00:00Z"), deletedAt: null });
    const result = await page();
    assert.deepEqual(result.contributionDates, ["2026-09-08"]);
    assert.equal(result.recentLogs.length, 1);
    assert.equal(result.selectedLog.meetingDocuments.length, 2);
    assert.equal(result.selectedLog.completedTasks.length, 1);
    assert.deepEqual(result.selectedLog, result.recentLogs[0]);
  });

  test("keeps twelve distinct recent meeting days despite many documents on one day", async () => {
    for (let index = 0; index < 28; index += 1) addMeeting();
    for (let offset = 1; offset <= 15; offset += 1) {
      const day = new Date(Date.UTC(2026, 8, 8 - offset)).toISOString().slice(0, 10);
      addMeeting({ content: meetingContent(day) });
    }
    const result = await page();
    assert.equal(result.recentLogs.length, 12);
    assert.deepEqual(result.recentLogs.map((log: Row) => log.workDate), Array.from({ length: 12 }, (_, offset) => new Date(Date.UTC(2026, 8, 8 - offset)).toISOString().slice(0, 10)));
    assert.equal(result.recentLogs[0].meetingDocuments.length, 28);
    const detailQueries = harness.reads.filter((read) => read.select?.attachments);
    assert.ok(detailQueries.length > 0);
    assert.ok(detailQueries.every((read) => JSON.stringify(read.where).includes('"in"')));
  });

  test("loads a selected historical meeting outside recent records while excluding future meeting dates", async () => {
    addMeeting({ id: "historical", content: meetingContent("2024-01-01") });
    addMeeting({ id: "future", content: meetingContent("2026-09-10") });
    for (let day = 1; day <= 13; day += 1) addMeeting({ content: meetingContent(`2026-08-${String(day).padStart(2, "0")}`) });
    const result = await page({ selectedDate: "2024-01-01" });
    assert.equal(result.selectedLog.meetingDocuments[0].id, "historical");
    assert.ok(!result.contributionDates.includes("2024-01-01"));
    assert.ok(!result.contributionDates.includes("2026-09-10"));
    assert.equal(result.recentLogs.length, 12);
    assert.ok(result.recentLogs.every((log: Row) => log.workDate >= "2026-08-02" && log.workDate <= "2026-09-09"));
  });

  test("rechecks access, approval status, meeting date and file existence after reading the date index", async () => {
    for (const changes of [
      { drafterId: "colleague" },
      { status: "DRAFT" },
      { content: meetingContent("2026-09-07") },
      { attachments: [] },
    ]) {
      harness.documents = [];
      const document = addMeeting();
      harness.beforeMeetingRead = (options) => {
        if (options.select?.attachments) Object.assign(document, changes);
      };
      const result = await page();
      assert.equal(result.selectedLog, null);
      assert.ok(result.recentLogs.every((log: Row) => log.meetingDocuments.length === 0));
    }
  });

  test("propagates meeting query errors instead of returning an apparently complete manual-only work log", async () => {
    addLog();
    harness.failMeetings = true;
    await assert.rejects(() => entry(), /Meeting documents unavailable/);
    await assert.rejects(() => page(), /Meeting documents unavailable/);
  });
});

describe("meeting work-log API authorization", () => {
  const request = () => new Request("https://example.test/api/work-logs/2026-09-08?authorId=colleague");
  const context = () => ({ params: Promise.resolve({ date: "2026-09-08" }) });

  test("returns a meeting-only day while ignoring an injected author and elevated administrator visibility", async () => {
    addMeeting({ id: "own" });
    addMeeting({ id: "private", drafterId: "colleague", title: "PRIVATE OTHER EMPLOYEE" });
    harness.currentUser = { id: "employee", role: "ADMIN" };
    const response = await route.GET(request(), context());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const payload = await response.json();
    assert.deepEqual(payload.entry.meetingDocuments.map((document: Row) => document.id), ["own"]);
    assert.doesNotMatch(JSON.stringify(payload), /PRIVATE OTHER EMPLOYEE/);
  });

  test("rejects anonymous readers before reading meetings and reports a query failure as 503", async () => {
    harness.currentUser = null;
    assert.equal((await route.GET(request(), context())).status, 401);
    assert.equal(harness.reads.length, 0);
    harness.currentUser = { id: "employee", role: "USER" };
    harness.failMeetings = true;
    const originalError = console.error;
    console.error = () => undefined;
    try {
      const response = await route.GET(request(), context());
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    } finally { console.error = originalError; }
  });
});
