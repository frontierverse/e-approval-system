import assert from "node:assert/strict";
import { test } from "node:test";
import * as logs from "../mobile/src/lib/work-logs";
import type { MobileWorkLogEntry, MobileWorkLogLinkedSchedule } from "../mobile/src/lib/types";
const token = "2026-10-03T00:00:00.000Z";
const entry = (patch: Partial<MobileWorkLogEntry> = {}): MobileWorkLogEntry => ({ id: "2026-10-03", workDate: "2026-10-03", keyword: "업무", content: "기록", authorName: "직원", createdAt: token, updatedAt: token, updatedByName: null, manualLogId: "manual-a", manualUpdatedAt: token, completedTasks: [], meetingDocuments: [], ...patch });
test("explicit date arrays, empty and invalid dates never request a different today", () => {
  assert.equal(logs.workLogDate(undefined), undefined); assert.equal(logs.workLogDate(""), ""); assert.equal(logs.workLogDate(["2026-10-03"]), "invalid-date");
  for (const date of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-10-3", "today", "0099-01-01"]) assert.equal(logs.isWorkLogDate(date), false, date);
  assert.equal(logs.isWorkLogDate("2024-02-29"), true); assert.equal(logs.isWorkLogDate("0100-01-01"), true);
});
test("timestamps use KST with year and schedule minutes preserve midnight boundaries", () => { assert.equal(logs.formatWorkLogTimestamp("2026-10-02T15:05:00Z"), "2026-10-03 00:05"); assert.equal(logs.formatWorkLogDate("2026-10-03"), "2026년 10월 3일"); assert.equal(logs.formatWorkLogMinute(0), "00:00"); assert.equal(logs.formatWorkLogMinute(1440), "24:00"); });
test("canonical CAS tokens and manual identity combinations are validated", () => {
  assert.equal(logs.isWorkLogToken(token), true); assert.equal(logs.isWorkLogToken("2026-10-03T00:00:00Z"), false);
  assert.ok(logs.validateWorkLogInput({ ...logs.workLogSaveInput("2026-10-03", { keyword: "업무", content: "내용" }, null), expectedUpdatedAt: token }, "2026-10-03").expectedUpdatedAt);
  assert.ok(logs.validateWorkLogInput({ ...logs.workLogSaveInput("2026-10-03", { keyword: "업무", content: "내용" }, entry()), manualLogId: null }, "2026-10-03").expectedUpdatedAt);
});
test("100 and 5000 JS character limits trim outer whitespace but preserve internal lines", () => {
  const input = logs.workLogSaveInput("2026-10-03", { keyword: ` ${"가".repeat(100)} `, content: ` ${"나".repeat(4998)}\n끝 ` }, null);
  assert.deepEqual(logs.validateWorkLogInput(input, "2026-10-03"), {}); assert.equal(input.content.length, 5000); assert.ok(input.content.includes("\n"));
  assert.ok(logs.validateWorkLogInput({ ...input, keyword: input.keyword + "가", content: input.content + "끝" }, "2026-10-03").content);
  assert.ok(logs.validateWorkLogInput({ ...input, keyword: "😀".repeat(51) }, "2026-10-03").keyword);
  assert.ok(logs.validateWorkLogInput({ ...input, workDate: "2026-10-04" }, "2026-10-03").workDate);
});
test("automatic-only records never prefill generated keyword into manual input", () => { const auto = entry({ manualLogId: null, manualUpdatedAt: null, keyword: "할 일 완료 1건", content: "" }); assert.deepEqual(logs.workLogValues(auto), { keyword: "", content: "" }); assert.equal(logs.workLogDirty({ keyword: "", content: "" }, auto), false); assert.equal(logs.workLogSaveInput(auto.workDate, { keyword: "새 업무", content: "내용" }, auto).expectedUpdatedAt, ""); });
test("unknown save comparisons require both original ID and a newer token", () => {
  const old = entry(); const input = logs.workLogSaveInput(old.workDate, { keyword: "바뀜", content: "새 입력" }, old);
  assert.equal(logs.workLogSavedMatches(entry({ keyword: input.keyword, content: input.content }), input, old), false);
  assert.equal(logs.workLogSavedMatches(entry({ keyword: input.keyword, content: input.content, manualUpdatedAt: "2026-10-03T00:00:00.001Z" }), input, old), true);
  assert.equal(logs.workLogSavedMatches(entry({ keyword: input.keyword, content: input.content, manualLogId: "manual-b", manualUpdatedAt: "2026-10-03T00:00:00.001Z" }), input, old), false);
});
test("genuine unchanged input permits the exact token while changed input does not", () => { const old = entry(); const input = logs.workLogSaveInput(old.workDate, logs.workLogValues(old), old); assert.equal(logs.workLogSavedMatches(old, input, old), true); assert.equal(logs.workLogSavedMatches(old, input), false); assert.equal(logs.workLogSavedMatches(entry({ manualLogId: "manual-new" }), input, old), false); });
test("unknown new saves require nonempty returned ID and exact normalized payload", () => { const input = logs.workLogSaveInput("2026-10-03", { keyword: "업무", content: "기록" }, null); assert.equal(logs.workLogSavedMatches(entry(), input), true); assert.equal(logs.workLogSavedMatches(entry({ content: "다름" }), input), false); assert.equal(logs.workLogSavedMatches(entry({ manualLogId: null, manualUpdatedAt: null, content: "" }), input), false); });
test("DTOs reject missing derived arrays, wrong date and malformed manual tokens", () => { assert.equal(logs.isWorkLogEntry(entry()), true); assert.equal(logs.isWorkLogEntry({ ...entry(), completedTasks: undefined }), false); assert.equal(logs.isWorkLogEntry(entry(), "2026-10-02"), false); assert.equal(logs.isWorkLogEntry(entry({ manualUpdatedAt: "2026-10-03T00:00:00Z" })), false); assert.equal(logs.isWorkLogEntry(entry({ manualLogId: null })), false); assert.equal(logs.isWorkLogEntry({ ...entry(), meetingDocuments: [{ id: "meeting", title: "회의", meetingDate: "2026-10-02", documentNo: null, status: "APPROVED", attachments: [] }] }), false); });
test("save/delete DTOs cannot confirm incompatible mutations or a retained deleted ID", () => { const old = entry(); const input = logs.workLogSaveInput(old.workDate, logs.workLogValues(old), old); assert.equal(logs.isWorkLogSave({ ok: true, message: "성공", change: "unchanged", entry: old }, input, old), true); assert.equal(logs.isWorkLogSave({ ok: true, message: "성공", change: "create", entry: old }, input, old), false); assert.equal(logs.isWorkLogDelete({ ok: true, message: "삭제", change: "deleted", deletedId: "manual-a", workDate: old.workDate, entry: old }, old.workDate, "manual-a"), false); assert.equal(logs.isWorkLogDelete({ ok: true, message: "없음", change: "missing", deletedId: "manual-a", workDate: old.workDate, entry: entry({ manualLogId: "manual-b" }) }, old.workDate, "manual-a"), true); });
test("empty date response is valid but selected date substitution and malformed schedule are rejected", () => { const response = { today: "2026-10-03", workDate: "2026-10-02", entry: null, linkedScheduleState: { status: "error" } }; assert.equal(logs.isWorkLogDateResponse(response, "2026-10-02"), true); assert.equal(logs.isWorkLogDateResponse(response, "2026-10-03"), false); assert.equal(logs.isWorkLogDateResponse({ ...response, linkedScheduleState: { status: "ready", schedules: [{ id: "a", youthId: "b", youthName: "이름", content: "내용", startMinute: 1400, endMinute: 1300 }] } }, response.workDate), false); });
test("page DTO distinguishes omitted today, twelve distinct dates and invalid response shape", () => { const page = { today: "2026-10-03", selectedDate: "2026-10-03", userName: "직원", contributionDates: ["2026-10-03"], recentLogs: [], selectedEntry: null, linkedScheduleState: { status: "ready", schedules: [] } }; assert.equal(logs.isWorkLogPage(page), true); assert.equal(logs.isWorkLogPage({ ...page, selectedDate: "2026-10-02" }), false); assert.equal(logs.isWorkLogPage({ ...page, contributionDates: ["2026-10-03", "2026-10-03"] }), false); assert.equal(logs.isWorkLogPage({ ...page, selectedEntry: {} }), false); });
test("schedule merge is ordered, deduplicates normalized display lines and caps additions", () => {
  const item = (id: string, startMinute: number, content = "상담"): MobileWorkLogLinkedSchedule => ({ id, youthId: "youth", youthName: " 청소년  가 ", content, startMinute, endMinute: startMinute + 60 });
  const merged = logs.mergeWorkLogSchedules("원래 입력", [item("later", 1200), item("early", 540), item("duplicate", 540, " 상담 ")]);
  assert.equal(merged.added, 2); assert.equal(merged.content, "원래 입력\n09:00-10:00 청소년 가 · 상담\n20:00-21:00 청소년 가 · 상담");
  assert.equal(logs.mergeWorkLogSchedules(merged.content, [item("again", 540)]).added, 0);
  const capped = logs.mergeWorkLogSchedules("가".repeat(4990), [item("too-long", 0)]); assert.equal(capped.skipped, 1); assert.equal(capped.content.length, 4990);
});
test("annual heatmap has 53 Sunday-first readonly weeks without inventing records", () => { const weeks = logs.workLogHeatmap("2026-10-03"); assert.equal(weeks.length, 53); assert.equal(weeks.flat().length, 371); assert.equal(new Date(`${weeks[0][0]}T00:00:00Z`).getUTCDay(), 0); assert.equal(weeks[52][6], "2026-10-03"); assert.deepEqual(logs.workLogHeatmap("bad"), []); });
test("mutation change labels agree with exact CAS semantics", () => { const old = entry(); const input = logs.workLogSaveInput(old.workDate, logs.workLogValues(old), old); assert.equal(logs.isWorkLogSave({ ok: true, message: "갱신", change: "update", entry: old }, input, old), false); assert.equal(logs.isWorkLogSave({ ok: true, message: "동일", change: "unchanged", entry: entry({ manualUpdatedAt: "2026-10-03T00:00:00.001Z" }) }, input, old), false); });
