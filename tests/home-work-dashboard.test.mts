import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  formatWaitingTime,
  HomeWorkDashboard,
} from "../src/components/home-work-dashboard.tsx";
import type { HomeDashboardData } from "../src/lib/home-dashboard.ts";

const requester = {
  id: "user-requester",
  name: "김민준",
  departmentName: "바자울",
  positionName: "주임",
  profileImageStorageKey: null,
  profileImageUpdatedAt: null,
};

const approver = {
  id: "user-approver",
  name: "안윤숙",
  departmentName: "법인",
  positionName: "시설장",
  profileImageStorageKey: null,
  profileImageUpdatedAt: null,
};

const dashboard: HomeDashboardData = {
  generatedAt: "2026-07-19T12:00:00.000Z",
  counts: {
    activeInbox: 6,
    overdueInbox: 2,
    recalled: 1,
    activeSent: 1,
  },
  inboxDocuments: [
    {
      id: "document-inbox",
      title: "시설 운영비 집행 기안",
      documentNo: "EA-2026-0012",
      category: "운영",
      status: "in_progress",
      submittedAt: "2026-07-17T10:00:00.000Z",
      createdAt: "2026-07-17T09:00:00.000Z",
      drafter: requester,
      currentApprover: approver,
      currentStepOrder: 2,
      totalSteps: 3,
      completedSteps: 1,
    },
  ],
  sentDocuments: [
    {
      id: "document-sent",
      title: "하계 프로그램 운영 계획",
      documentNo: "EA-2026-0013",
      category: "사업",
      status: "submitted",
      submittedAt: "2026-07-19T08:00:00.000Z",
      createdAt: "2026-07-19T07:00:00.000Z",
      drafter: requester,
      currentApprover: approver,
      currentStepOrder: 1,
      totalSteps: 2,
      completedSteps: 0,
    },
  ],
};

describe("HomeWorkDashboard", () => {
  test("renders actionable metrics and oldest approval work first", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomeWorkDashboard, {
        dashboard,
        showApprovalQueue: true,
      }),
    );

    assert.match(html, /업무 우선순위/);
    assert.match(html, /aria-label="오늘의 결재 현황"/);
    assert.match(html, /처리할 결재/);
    assert.match(html, /24시간 이상 대기/);
    assert.match(html, /회수 후 보완/);
    assert.match(html, /진행 중인 내 기안/);
    assert.match(html, /지금 처리할 결재/);
    assert.match(html, /시설 운영비 집행 기안/);
    assert.match(html, /2일 2시간 대기/);
    assert.match(html, /2\/3단계/);
    assert.match(html, /목록에 표시되지 않은 결재가/);
    assert.match(html, /5건/);
    assert.match(html, /href="\/documents\/document-inbox"/);
    assert.match(html, /받은결재함 전체 보기/);
  });

  test("renders the user's active drafts with explicit progress", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomeWorkDashboard, {
        dashboard,
        showApprovalQueue: true,
      }),
    );

    assert.match(html, /내 기안 진행/);
    assert.match(html, /하계 프로그램 운영 계획/);
    assert.match(html, /현재 안윤숙 결재 대기/);
    assert.match(html, /aria-label="결재 진행률 0%"/);
    assert.match(html, /role="progressbar"/);
    assert.match(html, /href="\/documents\/document-sent"/);
  });

  test("hides approval work from employees who do not approve documents", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomeWorkDashboard, {
        dashboard,
        showApprovalQueue: false,
      }),
    );

    assert.match(html, /aria-label="오늘의 내 문서 현황"/);
    assert.match(html, /회수 후 보완/);
    assert.match(html, /진행 중인 내 기안/);
    assert.match(html, /내 기안 진행/);
    assert.doesNotMatch(html, /지금 처리할 결재/);
    assert.doesNotMatch(html, /24시간 이상 대기/);
    assert.doesNotMatch(html, /시설 운영비 집행 기안/);
    assert.doesNotMatch(html, /href="\/inbox/);
  });

  test("formats waiting time without overstating short waits", () => {
    assert.equal(
      formatWaitingTime(
        "2026-07-19T11:59:30.000Z",
        "2026-07-19T12:00:00.000Z",
      ),
      "방금 도착",
    );
    assert.equal(
      formatWaitingTime(
        "2026-07-19T09:00:00.000Z",
        "2026-07-19T12:00:00.000Z",
      ),
      "3시간 대기",
    );
  });
});
