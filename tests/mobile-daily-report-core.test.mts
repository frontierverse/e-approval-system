import assert from "node:assert/strict";
import { test } from "node:test";
import * as report from "../mobile/src/lib/daily-reports";
import type { MobileDailyReportEntry, MobileDailyReportEditorResponse, MobileDailyReportSaveInput } from "../mobile/src/lib/types";
const entry = (patch: Partial<MobileDailyReportEntry> = {}): MobileDailyReportEntry => ({ id: "report-a", workDate: "2026-10-03", mainContent: "업무", youthReports: [{ youthId: "youth-a", youthName: "청소년", content: "보고" }], authorId: "account-a", authorName: "직원", departmentName: "부서", version: 2, submittedAt: null, reviewedAt: null, reviewedByName: null, updatedAt: "2026-10-03T00:00:00Z", ...patch });
const editor = (): MobileDailyReportEditorResponse => ({ mode: "employee", today: "2026-10-03", selectedDate: "2026-10-03", userName: "직원", canWrite: true, recipients: ["시설장"], youths: [{ id: "youth-a", name: "청소년" }], entry: entry() });
const input = (patch: Partial<MobileDailyReportSaveInput> = {}): MobileDailyReportSaveInput => ({ workDate: "2026-10-03", mainContent: "업무", youthReports: [], intent: "submit", version: 0, ...patch });
test("report dates reproduce the web UTC roundtrip without silently accepting malformed or future dates", () => {
  for (const value of ["0100-01-01", "0999-12-31", "2024-02-29", "9999-12-31"]) assert.equal(report.isDailyReportDate(value), true, value);
  for (const value of ["0000-01-01", "0099-01-01", "2025-02-29", "2026-02-30", "2026-1-03", "2026-10-03T00:00:00Z", ""]) assert.equal(report.isDailyReportDate(value), false, value);
  assert.ok(report.validateDailyReportInput(input({ workDate: "2026-10-04" }), "2026-10-03").workDate);
  assert.equal(report.formatDailyReportDate("2026-10-03"), "2026년 10월 3일");
});
test("status, KST year rollover and page/filter parsing preserve business meaning", () => {
  assert.equal(report.dailyReportStatus(null).value, "missing"); assert.equal(report.dailyReportStatus(entry()).value, "draft");
  assert.equal(report.dailyReportStatus(entry({ submittedAt: "2026-10-03T00:00:00Z" })).value, "submitted");
  assert.equal(report.dailyReportStatus(entry({ submittedAt: "2026-10-03T00:00:00Z", reviewedAt: "2026-10-03T01:00:00Z" })).value, "reviewed");
  assert.equal(report.formatDailyReportTimestamp("2026-12-31T15:00:00Z"), "2027-01-01 00:00");
  assert.equal(report.dailyReportPage("100001"), 100000); assert.equal(report.dailyReportPage("1e2"), 1); assert.equal(report.dailyReportPage(0), 1);
  assert.equal(report.normalizeDailyReportFilter("unread"), "unread"); assert.equal(report.normalizeDailyReportFilter(["reviewed"]), "all");
});
test("draft permits empty content while submit and exact field limits are checked", () => {
  assert.deepEqual(report.validateDailyReportInput(input({ mainContent: "", intent: "draft" }), "2026-10-03"), {});
  assert.ok(report.validateDailyReportInput(input({ mainContent: " " }), "2026-10-03").mainContent);
  assert.deepEqual(report.validateDailyReportInput(input({ mainContent: "가".repeat(10000), youthReports: [{ youthId: "youth-a", content: "나".repeat(4000) }] }), "2026-10-03"), {});
  assert.ok(report.validateDailyReportInput(input({ mainContent: "가".repeat(10001) }), "2026-10-03").mainContent);
  assert.ok(report.validateDailyReportInput(input({ youthReports: [{ youthId: "youth-a", content: "나".repeat(4001) }] }), "2026-10-03")["youth-youth-a"]);
});
test("duplicate IDs, 201 reports and JSON escaped aggregate size are rejected", () => {
  assert.ok(report.validateDailyReportInput(input({ youthReports: [{ youthId: "a", content: "" }, { youthId: "a", content: "" }] }), "2026-10-03").youthReports);
  assert.ok(report.validateDailyReportInput(input({ youthReports: Array.from({ length: 201 }, (_, index) => ({ youthId: `y-${index}`, content: "a" })) }), "2026-10-03").youthReports);
  assert.ok(report.validateDailyReportInput(input({ youthReports: Array.from({ length: 200 }, (_, index) => ({ youthId: `y-${index}`, content: "\\".repeat(4000) })) }), "2026-10-03").youthReports);
});
test("UTF8 byte counting matches JSON Unicode bytes without depending on native TextEncoder", () => {
  for (const text of ["ASCII", "가나다", "😀", "\uD800", "\n\\\"", JSON.stringify({ text: "한글😀\n" })]) assert.equal(report.dailyReportUtf8Size(text), Buffer.byteLength(text, "utf8"));
});
test("save canonicalization includes hidden allowed notes and cannot resurrect revoked IDs", () => {
  const values = { mainContent: " 업무 ", youthContents: { a: " 내용 ", b: "비공개", c: " " } };
  assert.deepEqual(report.dailyReportSaveInput("2026-10-03", values, 3, "submit", [{ id: "a" }, { id: "c" }]), input({ version: 3, youthReports: [{ youthId: "a", content: "내용" }] }));
  assert.deepEqual(report.permittedDailyReportValues(values, [{ id: "a" }]), { mainContent: " 업무 ", youthContents: { a: " 내용 " } });
});
test("ambiguous save is confirmed only by newer same-date content and requested submission state", () => {
  const attempt = input({ version: 1, youthReports: [{ youthId: "youth-a", content: "보고" }], intent: "draft" });
  assert.equal(report.dailyReportSavedMatches(entry(), attempt), true);
  assert.equal(report.dailyReportSavedMatches(entry({ version: 1 }), attempt), false);
  assert.equal(report.dailyReportSavedMatches(entry({ workDate: "2026-10-02" }), attempt), false);
  assert.equal(report.dailyReportSavedMatches(entry({ mainContent: "다른 내용" }), attempt), false);
  assert.equal(report.dailyReportSavedMatches(entry({ submittedAt: "2026-10-03T00:00:00Z" }), attempt), false);
  assert.equal(report.dailyReportSavedMatches(entry({ submittedAt: "2026-10-03T00:00:00Z" }), { ...attempt, intent: "submit" }), true);
});
test("private editor validators reject wrong-date, invalid roster and contradictory permission shapes", () => {
  assert.equal(report.isDailyReportEditor(editor(), "2026-10-03"), true);
  assert.equal(report.isDailyReportEditor(editor(), "2026-10-02"), false);
  assert.equal(report.isDailyReportEditor({ ...editor(), youths: [] }), false);
  assert.equal(report.isDailyReportEntry(entry({ reviewedAt: "2026-10-03T00:00:00Z" })), false);
  assert.equal(report.isDailyReportDetail({ mode: "director", today: "2026-10-03", canWrite: false, canReview: true, entry: entry() }, "report-a"), false);
  assert.equal(report.isDailyReportMutation({ ok: true, message: "저장", entry: entry() }, "2026-10-03", "foreign-report"), false);
});

test("a large authorized read roster and legacy notes are accepted while new submissions remain capped at 200", () => {
  const notes = Array.from({ length: 201 }, (_, index) => ({ youthId: `legacy-${index}`, youthName: `이름 ${index}`, content: "기존 보고" }));
  const large = { ...editor(), youths: notes.map(note => ({ id: note.youthId, name: note.youthName })), entry: entry({ youthReports: notes }) };
  assert.equal(report.isDailyReportEditor(large, "2026-10-03"), true);
  const payload = report.dailyReportSaveInput("2026-10-03", report.dailyReportValues(large.entry), large.entry.version, "draft", large.youths);
  assert.ok(report.validateDailyReportInput(payload, "2026-10-03").youthReports);
});
