import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminAuditLogList } from "../src/components/admin-audit-log-list.tsx";
import { AttachmentFileRow } from "../src/components/attachment-file-row.tsx";
import { ApprovalTimeline } from "../src/components/approval-timeline.tsx";
import { DocumentList } from "../src/components/document-list.tsx";
import { EmptyState } from "../src/components/empty-state.tsx";
import { PageTitle } from "../src/components/page-title.tsx";
import { ResourceLibraryList } from "../src/components/resource-library-list.tsx";
import { ResourceViewerList } from "../src/components/resource-viewer-list.tsx";
import { StatusBadge } from "../src/components/status-badge.tsx";
import type { ApprovalDocument } from "../src/lib/mock-data.ts";
import type {
  ResourceLibraryItem,
  ResourceViewer,
} from "../src/lib/resource-library-core.ts";

const document: ApprovalDocument = {
  id: "document-001",
  documentNo: "EA-2026-0001",
  title: "시설 운영비 집행 기안",
  templateName: "일반 기안서",
  category: "운영",
  status: "in_progress",
  drafter: {
    id: "user-001",
    name: "김민준",
    departmentName: "바자울",
    positionName: "주임",
  },
  drafterId: "user-001",
  createdAt: "2026-05-01T00:00:00.000Z",
  submittedAt: "2026-05-02T00:00:00.000Z",
  completedAt: null,
  content: "시설 운영비 집행을 요청합니다.",
  attachmentCount: 0,
  attachments: [],
  approvalSteps: [
    {
      id: "step-001",
      order: 1,
      approverId: "user-002",
      approver: {
        id: "user-002",
        name: "박서연",
        departmentName: "바자울",
        positionName: "팀장",
      },
      status: "approved",
      actedAt: "2026-05-03T00:00:00.000Z",
      comment: "확인했습니다.",
    },
    {
      id: "step-002",
      order: 2,
      approverId: "user-003",
      approver: {
        id: "user-003",
        name: "이도윤",
        departmentName: "법인",
        positionName: "이사",
      },
      status: "pending",
      actedAt: null,
      comment: null,
    },
  ],
  histories: [],
};

const resourceItem: ResourceLibraryItem = {
  id: "resource-test-001",
  title: "업무 자료 공유",
  summary: "직원들이 참고할 공통 자료입니다.",
  category: "manual",
  authorId: "user-001",
  authorName: "김민준",
  departmentName: "바자울",
  createdAt: "2026-05-11T12:02:00+09:00",
  updatedAt: "2026-05-11T12:02:00+09:00",
  viewCount: 12,
  pinned: true,
  attachments: [
    {
      fileName: "업무자료.pdf",
      size: 1024,
    },
  ],
};

const resourceViewers: ResourceViewer[] = [
  {
    userId: "user-002",
    name: "박서연",
    departmentName: "운영팀",
    positionName: "팀장",
    firstViewedAt: "2026-05-11T12:05:00+09:00",
    lastViewedAt: "2026-05-11T12:10:00+09:00",
    viewCount: 3,
  },
  {
    userId: "user-003",
    name: "이도윤",
    departmentName: "법무팀",
    positionName: "이사",
    firstViewedAt: "2026-05-11T12:20:00+09:00",
    lastViewedAt: "2026-05-11T12:20:00+09:00",
    viewCount: 1,
  },
];

describe("major UI rendering", () => {
  test("renders a page title with an action", () => {
    const html = renderToStaticMarkup(
      React.createElement(PageTitle, {
        title: "받은결재함",
        description: "승인 또는 반려해야 할 문서를 확인합니다.",
        action: React.createElement("a", { href: "/drafts/new" }, "새 기안"),
      }),
    );

    assert.match(html, /받은결재함/);
    assert.match(html, /승인 또는 반려해야 할 문서를 확인합니다\./);
    assert.match(html, /새 기안/);
  });

  test("renders an empty state", () => {
    const html = renderToStaticMarkup(
      React.createElement(EmptyState, {
        title: "결재 대기 문서가 없습니다",
        description: "새로 도착한 결재 요청이 있으면 이곳에 표시됩니다.",
      }),
    );

    assert.match(html, /결재 대기 문서가 없습니다/);
    assert.match(html, /새로 도착한 결재 요청/);
  });

  test("renders document and step status badges", () => {
    const documentBadgeHtml = renderToStaticMarkup(
      React.createElement(StatusBadge, {
        type: "document",
        status: "approved",
      }),
    );
    const stepBadgeHtml = renderToStaticMarkup(
      React.createElement(StatusBadge, {
        type: "step",
        status: "pending",
      }),
    );

    assert.match(documentBadgeHtml, /승인완료/);
    assert.match(stepBadgeHtml, /결재대기/);
  });

  test("renders the document list with current approver and progress", () => {
    const html = renderToStaticMarkup(
      React.createElement(DocumentList, {
        documents: [document],
        empty: React.createElement(EmptyState, {
          title: "문서가 없습니다",
          description: "조건을 조정해보세요.",
        }),
      }),
    );

    assert.match(html, /시설 운영비 집행 기안/);
    assert.match(html, /김민준/);
    assert.match(html, /이도윤/);
    assert.match(html, /1\/2/);
    assert.doesNotMatch(html, /문서가 없습니다/);
  });

  test("renders the approval timeline with the current step", () => {
    const html = renderToStaticMarkup(
      React.createElement(ApprovalTimeline, {
        document,
      }),
    );

    assert.match(html, /결재 진행/);
    assert.match(html, /현재 이도윤/);
    assert.match(html, /확인했습니다\./);
    assert.match(html, /현재 결재 차례입니다\./);
  });

  test("renders attachment file icons by extension", () => {
    const pdfHtml = renderToStaticMarkup(
      React.createElement(AttachmentFileRow, {
        fileName: "계약서.pdf",
        size: 153600,
      }),
    );
    const sheetHtml = renderToStaticMarkup(
      React.createElement(AttachmentFileRow, {
        fileName: "정산내역.xlsx",
        size: 2048,
      }),
    );

    assert.match(pdfHtml, /PDF/);
    assert.match(pdfHtml, /PDF 문서/);
    assert.match(pdfHtml, /계약서\.pdf/);
    assert.match(pdfHtml, /bg-\[#fff1f1\]/);
    assert.match(sheetHtml, /XLSX/);
    assert.match(sheetHtml, /스프레드시트/);
    assert.match(sheetHtml, /bg-\[#e8f5ed\]/);
  });

  test("renders admin audit logs with readable labels", () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminAuditLogList, {
        logs: [
          {
            id: "audit-001",
            action: "UPDATE_USER",
            targetType: "User",
            targetId: "user-002",
            message: "박서연 사용자 정보를 수정했습니다.",
            createdAt: new Date("2026-05-08T05:10:00.000Z"),
            actor: {
              name: "김민준",
              email: "admin@example.com",
            },
            document: null,
          },
          {
            id: "audit-002",
            action: "APPROVE",
            targetType: "ApprovalDocument",
            targetId: "document-001",
            message: null,
            createdAt: new Date("2026-05-08T05:00:00.000Z"),
            actor: {
              name: "이도윤",
              email: "approver@example.com",
            },
            document: {
              title: "시설 운영비 집행 기안",
              documentNo: "EA-2026-0001",
            },
          },
          {
            id: "audit-003",
            action: "CREATE_DRAFT",
            targetType: "ApprovalDocument",
            targetId: "document-002",
            message: "문서를 임시저장했습니다.",
            createdAt: new Date("2026-05-08T04:50:00.000Z"),
            actor: {
              name: "김민준",
              email: "admin@example.com",
            },
            document: {
              title: "임시 문서",
              documentNo: null,
            },
          },
        ],
      }),
    );

    assert.match(html, /감사 로그/);
    assert.match(html, /사용자 수정/);
    assert.match(html, /bg-\[#f6f0ff\]/);
    assert.match(html, /박서연 사용자 정보를 수정했습니다\./);
    assert.match(html, /승인/);
    assert.match(html, /bg-\[#e8f5ed\]/);
    assert.match(html, /임시저장/);
    assert.doesNotMatch(html, /기안 작성/);
    assert.match(html, /EA-2026-0001/);
    assert.match(html, /시설 운영비 집행 기안/);
    assert.match(html, /검색/);
    assert.match(html, /사용자/);
    assert.match(html, /상태/);
  });

  test("renders admin audit filters and pagination links", () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminAuditLogList, {
        logs: [
          {
            id: "audit-010",
            action: "APPROVE",
            targetType: "ApprovalDocument",
            targetId: "document-010",
            message: "문서를 승인했습니다.",
            createdAt: new Date("2026-05-08T05:00:00.000Z"),
            actor: {
              name: "이도윤",
              email: "approver@example.com",
            },
            document: {
              title: "테스트 문서",
              documentNo: "EA-2026-0010",
            },
          },
        ],
        actors: [
          {
            id: "user-003",
            name: "이도윤",
            email: "approver@example.com",
          },
        ],
        filters: {
          query: "approval",
          status: "APPROVE",
          actorId: "user-003",
          dateFrom: "2026-05-01",
          dateTo: "2026-05-08",
        },
        page: 2,
        pageSize: 12,
        total: 25,
        totalPages: 3,
      }),
    );

    assert.match(html, /name="tab" value="audit"/);
    assert.match(html, /defaultValue="approval"|value="approval"/);
    assert.match(html, /이도윤 · approver@example\.com/);
    assert.match(html, /승인/);
    assert.match(html, /25건 중 13-24건 표시/);
    assert.match(
      html,
      /href="\/admin\?tab=audit&amp;q=approval&amp;dateFrom=2026-05-01&amp;dateTo=2026-05-08&amp;user=user-003&amp;status=APPROVE"/,
    );
    assert.match(
      html,
      /href="\/admin\?tab=audit&amp;q=approval&amp;dateFrom=2026-05-01&amp;dateTo=2026-05-08&amp;user=user-003&amp;status=APPROVE&amp;page=3"/,
    );
  });

  test("renders resource library items with attachment context", () => {
    const html = renderToStaticMarkup(
      React.createElement(ResourceLibraryList, {
        items: [resourceItem],
        hasActiveFilter: false,
      }),
    );

    assert.match(html, /자료명/);
    assert.match(html, /업무 자료 공유/);
    assert.doesNotMatch(html, /업무 매뉴얼/);
    assert.doesNotMatch(html, /고정/);
    assert.match(html, /총 1개 · PDF 1개/);
    assert.doesNotMatch(html, /업무자료\.pdf/);
    assert.match(html, /2026\. 05\. 11\. 오후 12:02/);
    assert.match(html, /12명/);
  });

  test("renders resource post viewers", () => {
    const html = renderToStaticMarkup(
      React.createElement(ResourceViewerList, {
        viewers: resourceViewers,
      }),
    );

    assert.match(html, /열람 현황/);
    assert.match(html, /확인 2명/);
    assert.match(html, /박서연/);
    assert.match(html, /운영팀/);
    assert.match(html, /마지막 확인 2026\. 05\. 11\. 오후 12:10/);
  });
});
