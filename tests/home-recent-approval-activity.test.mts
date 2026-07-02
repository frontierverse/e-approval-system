import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HomeRecentApprovalActivity,
  type HomePublicApprovalActivity,
  type HomeRecentApprovalHistory,
} from "../src/components/home-recent-approval-activity.tsx";

const requester = {
  id: "user-001",
  name: "김민준",
  departmentName: "바자울",
  positionName: "주임",
  profileImageStorageKey: null,
  profileImageUpdatedAt: null,
};

const personalHistories: HomeRecentApprovalHistory[] = [
  {
    id: "audit-001",
    action: "결재 요청",
    actionValue: "SUBMIT",
    approvalSteps: [
      {
        id: "step-001",
        order: 1,
        approverId: "approver-001",
        approver: {
          id: "approver-001",
          name: "안윤숙",
          departmentName: "바자울",
          positionName: "시설장",
          profileImageStorageKey: null,
          profileImageUpdatedAt: null,
        },
        status: "approved",
        actedAt: "2026-07-01T00:00:00.000Z",
        comment: null,
      },
    ],
    createdAt: "2026-07-01T00:00:00.000Z",
    description: "김민준님이 결재를 요청했습니다.",
    documentId: "document-001",
    documentNo: "EA-2026-0001",
    requester,
    title: "보이는 내 결재 문서",
  },
];

const publicActivities: HomePublicApprovalActivity[] = [
  {
    action: "승인",
    actionValue: "APPROVE",
    actedAt: "2026-07-02T00:00:00.000Z",
    actor: {
      id: "user-002",
      name: "심태호",
      departmentName: "바자울",
      positionName: "팀장",
      profileImageStorageKey: null,
      profileImageUpdatedAt: null,
    },
    id: "audit-secret-001",
  },
];

describe("HomeRecentApprovalActivity", () => {
  test("renders personal details and redacted public activity actions", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomeRecentApprovalActivity, {
        personalHistoryPage: {
          histories: personalHistories,
          page: 1,
          pageSize: 5,
          total: 6,
          totalPages: 2,
        },
        publicActivityPage: {
          activities: publicActivities,
          page: 1,
          pageSize: 5,
          total: 6,
          totalPages: 2,
        },
      }),
    );

    assert.match(html, /나의 최근 결재 활동/);
    assert.match(html, /모든 결재 활동/);
    assert.match(html, /보이는 내 결재 문서/);
    assert.match(html, /href="\/documents\/document-001"/);
    assert.match(html, /심태호/);
    assert.match(html, /승인/);
    assert.match(html, /aria-label="이전 나의 최근 결재 활동"/);
    assert.match(html, /aria-label="다음 나의 최근 결재 활동"/);
    assert.match(html, /aria-label="이전 모든 결재 활동"/);
    assert.match(html, /aria-label="다음 모든 결재 활동"/);
    assert.match(html, /dark:bg-\[#0d1117\]/);
    assert.match(html, /dark:bg-\[#30363d\]/);
    assert.match(html, /dark:bg-\[#21262d\]/);
    assert.match(html, /<svg/);
    assert.doesNotMatch(html, /보안상 감춤/);
    assert.doesNotMatch(html, /audit-secret-001/);
  });
});
