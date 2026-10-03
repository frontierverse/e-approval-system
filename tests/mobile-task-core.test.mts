import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTaskDueDate, formatTaskTimestamp, isTaskDate, isTaskId, newTaskRequestId, normalizeTaskFormValues, normalizeTaskStatus, taskPage, taskState, taskStatusOptions, validateTaskFormValues } from "../mobile/src/lib/tasks";
const values = { title: " 할 일 ", description: " 내용\n두 줄 ", meetingTitle: " 회의 ", dueDate: " 2026-10-03 " };
test("task form normalizes exactly the self-task web fields and validates every input boundary", () => {
  assert.deepEqual(normalizeTaskFormValues(values), { title: "할 일", description: "내용\n두 줄", meetingTitle: "회의", dueDate: "2026-10-03" });
  assert.deepEqual(validateTaskFormValues({ title: "가".repeat(160), description: "나".repeat(2000), meetingTitle: "다".repeat(160), dueDate: "" }), {});
  const errors = validateTaskFormValues({ title: " ", description: "가".repeat(2001), meetingTitle: "나".repeat(161), dueDate: "2026-02-29" });
  assert.deepEqual(Object.keys(errors), ["title", "description", "meetingTitle", "dueDate"]);
  assert.ok(validateTaskFormValues({ ...values, title: "가".repeat(161) }).title);
});
test("calendar dates accept leap days and past deadlines without local-time conversion", () => {
  for (const value of ["2028-02-29", "1000-01-01", "9999-12-31", "2020-10-03"]) assert.equal(isTaskDate(value), true);
  for (const value of ["2027-02-29", "2026-04-31", "2026-00-01", "2026-13-01", "2026-1-01", "0000-01-01", "2026-10-03T00:00:00Z"]) assert.equal(isTaskDate(value), false);
  assert.equal(formatTaskDueDate("2026-10-03"), "기한 2026-10-03");
  assert.equal(formatTaskDueDate(null), "기한 없음");
});
test("deleted and completed states take precedence over overdue, with today determined by server KST date", () => {
  const task = { dueDate: "2026-10-03", completedAt: null, deletedAt: null };
  assert.equal(taskState(task, "2026-10-03").kind, "dueToday");
  assert.equal(taskState(task, "2026-10-04").tone, "danger");
  assert.equal(taskState({ ...task, completedAt: "2026-10-02T00:00:00Z" }, "2026-10-04").kind, "completed");
  assert.equal(taskState({ ...task, completedAt: "2026-10-02T00:00:00Z", deletedAt: "2026-10-04T00:00:00Z" }, "2026-10-04").kind, "deleted");
  assert.equal(taskState({ ...task, dueDate: null }, "2026-10-04").kind, "pending");
});
test("history timestamps include the year and cross midnight at KST rather than device timezone", () => {
  assert.equal(formatTaskTimestamp("2026-12-31T14:59:00Z"), "2026-12-31 23:59");
  assert.equal(formatTaskTimestamp("2026-12-31T15:00:00Z"), "2027-01-01 00:00");
  assert.equal(formatTaskTimestamp(null), "없음");
  assert.equal(formatTaskTimestamp("invalid"), "날짜 확인 필요");
});
test("route filters and page values reject unsupported or ambiguous input shapes", () => {
  assert.deepEqual(taskStatusOptions.map(item => item.value), ["pending", "overdue", "completed", "all", "deleted"]);
  for (const value of ["", "wrong", ["deleted"], null]) assert.equal(normalizeTaskStatus(value), "pending");
  for (const value of [0, -1, "1.5", Infinity, [], [2], true, Number.MAX_SAFE_INTEGER + 1]) assert.equal(taskPage(value), 1);
  assert.equal(taskPage("2"), 2);
  for (const id of ["../private", "a/b", "a?b", "", "a".repeat(129), ["own-id"]]) assert.equal(isTaskId(id), false);
  assert.equal(isTaskId("own-task_123"), true);
});
test("registration identifiers use the existing mobile format without a new native dependency", () => {
  const ids = Array.from({ length: 100 }, () => newTaskRequestId());
  assert.equal(new Set(ids).size, 100);
  for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{16,128}$/);
});
