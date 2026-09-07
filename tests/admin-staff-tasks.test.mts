import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { AdminStaffTaskBoard } from "../src/components/admin-staff-task-board.tsx";
import { StaffTaskEditorModal } from "../src/components/staff-task-editor-modal.tsx";
import type { StaffTaskItem } from "../src/lib/staff-tasks-core.ts";

const task: StaffTaskItem = {
  id: "task-a", title: "회의 결과 정리", description: "확정된 업무와 기한 정리",
  meetingTitle: "주간 회의", dueDate: "2026-09-01", assigneeId: "staff-a",
  assigneeName: "직원 가", departmentName: "업무팀", completedAt: null,
  createdAt: "2026-08-30T01:00:00.000Z", updatedAt: "2026-08-30T01:00:00.000Z", version: 4,
};
const assignees = [{ id: "staff-a", name: "직원 가", departmentName: "업무팀" }];
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };

describe("admin staff tasks", () => {
  test("shows overdue work and employee totals without allowing admin completion", () => {
    const html = renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router },
      React.createElement(AdminStaffTaskBoard, {
        data: { tasks: [task], counts: { pending: 5, completed: 2, overdue: 3 }, page: 2, totalPages: 4, total: 5 },
        assignees,
        employees: [{ assigneeId: "staff-a", assigneeName: "직원 가", departmentName: "업무팀", pending: 5, completed: 2, overdue: 3 }],
        filters: { status: "pending", assigneeId: "staff-a", query: "회의" },
        referenceDate: "2026-09-07",
      }),
    ));
    assert.match(html, /업무 상태별 현황/);
    assert.match(html, />7<span class="sr-only">건/); // overdue is part of pending, not added twice.
    assert.match(html, /회의 결과 정리 · 직원 가 · 기한 초과 상세 및 수정/);
    assert.match(html, /미완료 5건, 완료 2건, 기한 초과 3건/);
    assert.match(html, /직원 할 일 최신 상태 새로고침/);
    assert.doesNotMatch(html, /type="checkbox"/);
    assert.match(html, /assigneeId=staff-a&amp;status=pending&amp;query=%ED%9A%8C%EC%9D%98&amp;page=3/);
    assert.ok(html.indexOf("할 일 목록") < html.indexOf("직원별 전체 현황"));
  });

  test("uses the completed status even when the task has an old deadline", () => {
    const html = renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router },
      React.createElement(AdminStaffTaskBoard, {
        data: { tasks: [{ ...task, completedAt: "2026-09-06T02:03:00.000Z" }], counts: { pending: 0, completed: 1, overdue: 0 }, page: 1, totalPages: 1, total: 1 },
        assignees, employees: [], filters: { status: "all", assigneeId: "", query: "" }, referenceDate: "2026-09-07",
      }),
    ));
    assert.match(html, /회의 결과 정리 · 직원 가 · 완료 상세 및 수정/);
    assert.match(html, /완료 2026\. 09\. 06\. 오전 11:03/);
    assert.doesNotMatch(html, /회의 결과 정리 · 직원 가 · 기한 초과/);
  });

  test("create form has required assignment and a stable request token", () => {
    const html = renderToStaticMarkup(React.createElement(StaffTaskEditorModal, {
      task: null, assignees, requestId: "request-token-12345678", onClose() {}, onSaved() {},
    }));
    assert.match(html, /role="dialog"/);
    assert.match(html, /name="requestId" value="request-token-12345678"/);
    assert.match(html, /<input(?=[^>]*name="title")(?=[^>]*required="")(?=[^>]*maxLength="160")[^>]*>/);
    assert.match(html, /name="assigneeId" required=""/);
    assert.match(html, /name="description" maxLength="2000"/);
    assert.match(html, /name="dueDate"/);
    assert.doesNotMatch(html, /name="version"/);
  });

  test("completed edit preserves current assignee and version when staff is no longer selectable", () => {
    const html = renderToStaticMarkup(React.createElement(StaffTaskEditorModal, {
      task: { ...task, completedAt: "2026-09-06T02:03:00.000Z" },
      assignees: [], requestId: "", onClose() {}, onSaved() {},
    }));
    assert.match(html, /name="id" value="task-a"/);
    assert.match(html, /name="version" value="4"/);
    assert.match(html, /name="assigneeId" required="" disabled=""/);
    assert.match(html, /type="hidden" name="assigneeId" value="staff-a"/);
    assert.match(html, /value="staff-a" selected="">직원 가 · 업무팀/);
    assert.match(html, /완료한 업무의 담당자는 변경할 수 없습니다/);
    assert.doesNotMatch(html, /type="checkbox"/);
  });
});
