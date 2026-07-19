import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HomeRecentApprovalActivity,
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

describe("HomeRecentApprovalActivity", () => {
  test("renders a compact list of changes to related documents", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomeRecentApprovalActivity, {
        personalHistoryPage: {
          histories: personalHistories,
          page: 1,
          pageSize: 5,
          total: 6,
          totalPages: 2,
        },
      }),
    );

    assert.match(html, /내 관련 문서의 최근 변경/);
    assert.match(html, /총 6건/);
    assert.match(html, /보이는 내 결재 문서/);
    assert.match(html, /href="\/documents\/document-001"/);
    assert.match(html, /결재 완료 · 1\/1단계/);
    assert.match(html, /요청자/);
    assert.doesNotMatch(html, /모든 결재 활동/);
    assert.doesNotMatch(html, /aria-label="이전/);
    assert.doesNotMatch(html, /animate-pulse/);
  });
});
