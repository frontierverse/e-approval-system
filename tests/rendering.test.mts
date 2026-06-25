import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DocumentDetailLoading from "../src/app/documents/[id]/loading.tsx";
import { AdminAuditLogFilterControlsContent } from "../src/components/admin-audit-log-filter-controls.tsx";
import { AdminLoginHistoryFilterControlsContent } from "../src/components/admin-login-history-filter-controls.tsx";
import { AdminAuditLogList } from "../src/components/admin-audit-log-list.tsx";
import { AdminLoginHistoryList } from "../src/components/admin-login-history-list.tsx";
import { AppModal } from "../src/components/app-modal.tsx";
import { ApprovalDecisionForm } from "../src/components/approval-decision-form.tsx";
import { ApprovalLinePreview } from "../src/components/approval-line-preview.tsx";
import { AttachmentFileRow } from "../src/components/attachment-file-row.tsx";
import { ApprovalTimeline } from "../src/components/approval-timeline.tsx";
import { DocumentList } from "../src/components/document-list.tsx";
import { DocumentAuditHistory } from "../src/components/document-audit-history.tsx";
import { EducationResourceQuickFiltersContent } from "../src/components/education-resource-quick-filters.tsx";
import { EmptyState } from "../src/components/empty-state.tsx";
import { LineNumberedDocumentContent } from "../src/components/line-numbered-document-content.tsx";
import { PageTitle } from "../src/components/page-title.tsx";
import { QuickStatusLinks } from "../src/components/quick-status-links.tsx";
import { ResourceLibraryFilterControlsContent } from "../src/components/resource-library-filter-controls.tsx";
import { ResourceLibraryList } from "../src/components/resource-library-list.tsx";
import { ResourceCategoryBadge } from "../src/components/resource-category-badge.tsx";
import { ResourceViewerList } from "../src/components/resource-viewer-list.tsx";
import { ShellQuickStatusLinks } from "../src/components/shell-quick-status-links.tsx";
import { SignedAttachmentDeleteForm } from "../src/components/signed-attachment-delete-form.tsx";
import { StatusBadge } from "../src/components/status-badge.tsx";
import {
  getUserAvatarColorClass,
  UserAvatar,
} from "../src/components/user-avatar.tsx";
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
  category: "bajaul",
  educationLevel: null,
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
        titleAccessory: React.createElement("span", null, "구매요청서"),
        action: React.createElement("a", { href: "/drafts/new" }, "새 기안"),
      }),
    );

    assert.match(html, /받은결재함/);
    assert.match(html, /구매요청서/);
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

  test("renders modal frames with a thin border", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        AppModal,
        {
          label: "테스트 모달",
          onClose: () => undefined,
        },
        React.createElement("p", null, "모달 내용"),
      ),
    );

    assert.match(html, /data-app-modal="true"/);
    assert.match(html, /border border-\[#d9dee7\]/);
  });

  test("renders fallback user avatars with initial-based colors", () => {
    const kimColorClass = getUserAvatarColorClass("김민준");
    const kangColorClass = getUserAvatarColorClass("강하늘");
    const leeColorClass = getUserAvatarColorClass("이도윤");
    const html = renderToStaticMarkup(
      React.createElement(UserAvatar, {
        user: {
          id: "user-avatar-001",
          name: "김민준",
          profileImageStorageKey: null,
          profileImageUpdatedAt: null,
        },
      }),
    );

    assert.equal(kimColorClass, kangColorClass);
    assert.notEqual(kimColorClass, leeColorClass);
    assert.ok(html.includes(kimColorClass));
  });

  test("renders quick status cards as links", () => {
    const html = renderToStaticMarkup(
      React.createElement(QuickStatusLinks, {
        items: [
          {
            label: "받은 결재 대기",
            value: "3",
            note: "처리할 문서",
            href: "/inbox",
          },
          {
            label: "완료 문서",
            value: "7",
            note: "승인 또는 반려",
            href: "/completed",
          },
        ],
      }),
    );

    assert.match(html, /aria-label="빠른 현황"/);
    assert.match(html, /href="\/inbox"/);
    assert.match(html, /aria-label="받은 결재 대기 바로가기"/);
    assert.match(html, /href="\/completed"/);
    assert.match(html, /받은 결재 대기/);
    assert.match(html, /완료 문서/);
  });

  test("renders shell quick status rows as links", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShellQuickStatusLinks, {
        items: [
          {
            label: "받은결재",
            value: 0,
            href: "/inbox",
          },
          {
            label: "임시저장",
            value: 2,
            href: "/drafts",
          },
          {
            label: "제출문서",
            value: 3,
            href: "/sent",
          },
          {
            label: "완료문서",
            value: 1,
            href: "/completed",
          },
          {
            label: "보관 검토",
            value: 0,
            href: "/completed?archiveReview=today",
          },
        ],
      }),
    );

    assert.match(html, /aria-label="빠른 현황"/);
    assert.match(html, /href="\/inbox"/);
    assert.match(html, /href="\/drafts"/);
    assert.match(html, /href="\/sent"/);
    assert.match(html, /href="\/completed"/);
    assert.match(html, /href="\/completed\?archiveReview=today"/);
    assert.match(html, /받은결재/);
    assert.match(html, /제출문서/);
    assert.match(html, /tabular-nums/);
  });

  test("renders approval actions without requiring attachment signing", () => {
    const html = renderToStaticMarkup(
      React.createElement(ApprovalDecisionForm, {
        action: async () => ({}),
      }),
    );

    assert.match(html, /결재 처리/);
    assert.match(html, />승인</);
    assert.match(html, />반려</);
    assert.doesNotMatch(html, /첨부파일에 날인하러 가기/);
    assert.doesNotMatch(html, /href="\/attachments\/attachment-001\/sign"/);
  });

  test("renders document detail loading skeleton", () => {
    const html = renderToStaticMarkup(React.createElement(DocumentDetailLoading));

    assert.match(html, /문서 상세 불러오는 중/);
    assert.match(html, /문서번호 불러오는 중/);
    assert.match(html, /문서 상태/);
    assert.match(html, /문서 본문/);
    assert.match(html, /첨부파일/);
    assert.match(html, /감사 이력/);
    assert.match(html, /결재선/);
    assert.doesNotMatch(html, /업무 홈/);
  });

  test("renders document content with line numbers", () => {
    const html = renderToStaticMarkup(
      React.createElement(LineNumberedDocumentContent, {
        content: "첫 번째 줄\n두 번째 줄",
      }),
    );

    assert.match(html, /aria-label="문서 본문 내용"/);
    assert.match(html, /max-w-\[53\.75rem\]/);
    assert.match(html, /whitespace-pre-wrap/);
    assert.match(html, />1<\/div>/);
    assert.match(html, />2<\/div>/);
    assert.match(html, /첫 번째 줄/);
    assert.match(html, /두 번째 줄/);
  });

  test("renders document and step status badges", () => {
    const documentBadgeHtml = renderToStaticMarkup(
      React.createElement(StatusBadge, {
        type: "document",
        status: "submitted",
      }),
    );
    const stepBadgeHtml = renderToStaticMarkup(
      React.createElement(StatusBadge, {
        type: "step",
        status: "pending",
      }),
    );

    assert.match(documentBadgeHtml, /진행중/);
    assert.doesNotMatch(documentBadgeHtml, /결재 요청/);
    assert.match(documentBadgeHtml, /shrink-0/);
    assert.match(documentBadgeHtml, /whitespace-nowrap/);
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
    assert.match(html, /whitespace-nowrap px-5 py-4 tabular-nums/);
    assert.doesNotMatch(html, /문서가 없습니다/);
  });

  test("renders the approval timeline with the current step", () => {
    const html = renderToStaticMarkup(
      React.createElement(ApprovalTimeline, {
        document,
        progressLabel: "진행 1/2",
        progressPercent: 50,
      }),
    );

    assert.match(html, /결재 진행/);
    assert.match(html, /진행 1\/2/);
    assert.match(html, /width:50%/);
    assert.match(html, /이도윤/);
    assert.match(html, /확인했습니다\./);
    assert.match(html, /현재 결재 차례입니다\./);
    assert.ok(
      html.indexOf('aria-hidden="true">이</span>') < html.indexOf("이도윤"),
    );
    assert.doesNotMatch(html, /현재 결재자/);
  });

  test("renders proxy approval buttons through selectable target steps", () => {
    const html = renderToStaticMarkup(
      React.createElement(ApprovalTimeline, {
        document,
        currentUserId: "user-001",
        currentUserRole: "ADMIN",
        progressLabel: "진행 1/2",
        progressPercent: 50,
        proxyApproveDocumentAction: async () => {},
      }),
    );

    assert.match(html, /현재 단계 대리결재/);
    assert.doesNotMatch(html, /현재 대리결재 대상/);
  });

  test("renders a compact approval line preview in order", () => {
    const html = renderToStaticMarkup(
      React.createElement(ApprovalLinePreview, {
        steps: document.approvalSteps,
      }),
    );

    assert.match(html, /결재선/);
    assert.match(html, /aria-label="결재선: 1차 박서연 승인, 2차 이도윤 진행중"/);
    assert.match(html, /박서연/);
    assert.match(html, /이도윤/);
    assert.doesNotMatch(html, />승인</);
    assert.doesNotMatch(html, />진행중</);
    assert.doesNotMatch(html, /rounded-md border/);
    assert.doesNotMatch(html, /shadow-\[/);
    assert.match(html, /bg-transparent/);
    assert.equal(html.match(/approval-line-current/g)?.length, 2);
    assert.match(html, /flex h-6 items-center/);
    assert.match(html, /h-px min-w-8 flex-1/);
    assert.doesNotMatch(html, /mx-2/);
    assert.doesNotMatch(html, /bg-\[#e8f5ed\]/);
    assert.doesNotMatch(html, /bg-\[#e7f4f3\]/);
  });

  test("renders audit history as a timeline", () => {
    const html = renderToStaticMarkup(
      React.createElement(DocumentAuditHistory, {
        histories: [
          {
            id: "history-001",
            actorId: "user-001",
            actorName: "김민준",
            actor: document.drafter,
            action: "결재 요청",
            createdAt: "2026-05-02T00:00:00.000Z",
            description: "문서를 결재 요청했습니다.",
          },
          {
            id: "history-002",
            actorId: "user-002",
            actorName: "박서연",
            actor: document.approvalSteps[0].approver,
            action: "승인",
            createdAt: "2026-05-03T00:00:00.000Z",
            description: "1차 결재자가 승인했습니다.",
          },
          {
            id: "history-003",
            actorId: "user-001",
            actorName: "김민준",
            actor: document.drafter,
            action: "대리결재",
            createdAt: "2026-05-04T00:00:00.000Z",
            description:
              "김민준 주임이 이도윤 이사의 결재를 대리 승인했습니다.",
          },
        ],
      }),
    );

    assert.match(html, /감사 이력/);
    assert.match(html, /aria-label="감사 이력 타임라인"/);
    assert.match(html, /결재 요청/);
    assert.match(html, /문서를 결재 요청했습니다\./);
    assert.match(html, /김민준/);
    assert.match(html, /승인/);
    assert.match(html, /박서연/);
    assert.match(html, /대리결재/);
    assert.match(html, /bg-\[#fff8df\]/);
    assert.match(html, /left-\[0\.9375rem\]/);
  });

  test("renders draft update audit changes as structured summary chips", () => {
    const html = renderToStaticMarkup(
      React.createElement(DocumentAuditHistory, {
        histories: [
          {
            id: "history-update-001",
            actorId: "user-001",
            actorName: "김민준",
            actor: document.drafter,
            action: "임시저장 수정",
            createdAt: "2026-05-05T00:00:00.000Z",
            description:
              '임시저장 문서를 수정했습니다. 변경: 제목 "이전 제목" -> "변경 제목", 문서양식 "일반 기안서" -> "휴가신청서", 첨부파일 추가 1개(추가자료.pdf)',
            metadata: {
              changes: [
                {
                  field: "title",
                  label: "제목",
                  before: "이전 제목",
                  after: "변경 제목",
                },
                {
                  field: "template",
                  label: "문서양식",
                  before: "일반 기안서",
                  after: "휴가신청서",
                },
                {
                  field: "content",
                  label: "본문",
                  before: "기존 본문입니다.\n확인이 필요합니다.",
                  after: "수정된 본문입니다.\n첨부 확인까지 반영했습니다.",
                  beforeLength: 18,
                  afterLength: 27,
                },
                {
                  field: "attachments",
                  label: "첨부파일",
                  added: ["추가자료.pdf"],
                  removed: [
                    {
                      id: "attachment-001",
                      originalName: "삭제자료.pdf",
                    },
                  ],
                },
              ],
            },
          },
        ],
      }),
    );

    assert.match(html, /수정 내역 요약/);
    assert.match(html, /임시저장 문서를 수정했습니다\./);
    assert.doesNotMatch(html, /변경: 제목/);
    assert.match(html, /제목/);
    assert.match(html, /이전 제목 -&gt; 변경 제목/);
    assert.match(html, /문서양식/);
    assert.match(html, /일반 기안서 -&gt; 휴가신청서/);
    assert.match(html, /본문 변경/);
    assert.match(html, /첨부파일/);
    assert.match(html, /추가 1개 · 삭제 1개/);
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

  test("renders full attachment file names when requested", () => {
    const html = renderToStaticMarkup(
      React.createElement(AttachmentFileRow, {
        fileName: "교육자료_상세운영가이드_최종본.pdf",
        showFullFileName: true,
        size: 153600,
      }),
    );

    assert.match(html, /교육자료_상세운영가이드_최종본\.pdf/);
    assert.match(html, /break-all leading-5 whitespace-normal/);
    assert.doesNotMatch(html, /truncate/);
  });

  test("renders image attachment thumbnails when provided", () => {
    const html = renderToStaticMarkup(
      React.createElement(AttachmentFileRow, {
        fileName: "영수증.png",
        size: 4096,
        thumbnailHref: "/attachments/image-1/preview",
      }),
    );

    assert.match(html, /src="\/attachments\/image-1\/preview"/);
    assert.match(html, /alt="영수증\.png 미리보기"/);
    assert.match(html, /이미지 파일/);
  });

  test("requires a reason before signed attachment deletion", () => {
    const html = renderToStaticMarkup(
      React.createElement(SignedAttachmentDeleteForm, {
        action: async () => {},
      }),
    );

    assert.match(html, /서명본 삭제 사유/);
    assert.match(html, /name="deleteReason"/);
    assert.match(html, /required=""/);
    assert.match(html, /maxLength="200"/);
    assert.match(html, />삭제<\/button>/);
  });

  test("renders admin audit logs with readable labels", () => {
    const filters = {
      query: "",
      status: "all" as const,
      actorId: "all",
      dateFrom: "",
      dateTo: "",
    };
    const html = renderToStaticMarkup(
      React.createElement(AdminAuditLogList, {
        logs: [
          {
            id: "audit-001",
            action: "UPDATE_USER",
            targetType: "User",
            targetId: "user-002",
            message: "박서연 사용자 정보를 수정했습니다.",
            metadata: {
              changes: [
                {
                  field: "name",
                  label: "이름",
                  before: "박서연",
                  after: "박소연",
                },
                {
                  field: "hireDate",
                  label: "입사일",
                  before: null,
                  after: "2026-06-19",
                },
                {
                  field: "password",
                  label: "비밀번호",
                  before: "기존 비밀번호",
                  after: "재설정됨",
                },
              ],
            },
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
          {
            id: "audit-004",
            action: "UPDATE_DRAFT",
            targetType: "Attachment",
            targetId: "attachment-001",
            message: "시스템 원본문서 PDF를 생성했습니다.",
            metadata: {
              generatedApprovalPdfType: "SOURCE",
            },
            createdAt: new Date("2026-05-08T04:40:00.000Z"),
            actor: {
              name: "김민준",
              email: "admin@example.com",
            },
            document: {
              title: "PDF 생성 문서",
              documentNo: "EA-2026-0002",
            },
          },
          {
            id: "audit-005",
            action: "CREATE_YOUTH",
            targetType: "Youth",
            targetId: "youth-001",
            message: "김하늘 청소년을 등록했습니다.",
            createdAt: new Date("2026-05-08T04:30:00.000Z"),
            actor: {
              name: "김민준",
              email: "admin@example.com",
            },
            document: null,
          },
          {
            id: "audit-006",
            action: "DELETE_YOUTH_NOTE",
            targetType: "YouthSpecialNote",
            targetId: "note-001",
            message: "김하늘 청소년의 특이사항을 삭제했습니다.",
            createdAt: new Date("2026-05-08T04:20:00.000Z"),
            actor: {
              name: "김민준",
              email: "admin@example.com",
            },
            document: null,
          },
          {
            id: "audit-007",
            action: "UPDATE_COMPANY_INFO",
            targetType: "CompanyBusinessInfo",
            targetId: "youth-self-reliance-school",
            message: "사회적협동조합 청소년자립학교 회사 정보를 수정했습니다.",
            metadata: {
              changes: [
                {
                  field: "registrationNumber",
                  label: "사업자등록번호",
                  before: null,
                  after: "123-45-67890",
                },
                {
                  field: "address",
                  label: "소재지",
                  before: "이전 주소",
                  after: "서울특별시 테스트로 1",
                },
              ],
            },
            createdAt: new Date("2026-05-08T04:10:00.000Z"),
            actor: {
              name: "김민지",
              email: "admin@example.com",
            },
            document: null,
          },
        ],
        filterControls: React.createElement(AdminAuditLogFilterControlsContent, {
          actors: [],
          filters,
          navigate: () => {},
          total: 7,
        }),
      }),
    );

    assert.match(html, /감사 로그/);
    assert.match(html, /05\. 08\. 14:10/);
    assert.match(html, /사용자 수정/);
    assert.match(html, /bg-\[#f6f0ff\]/);
    assert.match(html, /박서연 사용자 정보를 수정했습니다\./);
    assert.match(html, /이름/);
    assert.match(html, /박서연/);
    assert.match(html, /박소연/);
    assert.match(html, /입사일/);
    assert.match(html, /미등록/);
    assert.match(html, /2026-06-19/);
    assert.match(html, /비밀번호/);
    assert.match(html, /재설정됨/);
    assert.match(html, /승인/);
    assert.match(html, /bg-\[#e8f5ed\]/);
    assert.match(html, /임시저장/);
    assert.match(html, /PDF 생성/);
    assert.match(html, /시스템 원본문서 PDF를 생성했습니다\./);
    assert.match(html, /청소년 등록/);
    assert.match(html, /김하늘 청소년을 등록했습니다\./);
    assert.match(html, /청소년 특이사항 삭제/);
    assert.match(html, /회사 정보 수정/);
    assert.match(html, /사회적협동조합 청소년자립학교 회사 정보를 수정했습니다\./);
    assert.match(html, /사업자등록번호/);
    assert.match(html, /123-45-67890/);
    assert.match(html, /소재지/);
    assert.match(html, /서울특별시 테스트로 1/);
    assert.doesNotMatch(html, /기안 작성/);
    assert.match(html, /EA-2026-0001/);
    assert.match(html, /시설 운영비 집행 기안/);
    assert.match(html, /검색/);
    assert.match(html, /사용자/);
    assert.match(html, /상태/);
  });

  test("renders admin audit filters and pagination links", () => {
    const actors = [
      {
        id: "user-003",
        name: "이도윤",
        email: "approver@example.com",
      },
    ];
    const filters = {
      query: "approval",
      status: "APPROVE" as const,
      actorId: "user-003",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-08",
    };
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
        actors,
        filterControls: React.createElement(AdminAuditLogFilterControlsContent, {
          actors,
          filters,
          navigate: () => {},
          total: 25,
        }),
        filters,
        page: 2,
        pageSize: 12,
        total: 25,
        totalPages: 3,
      }),
    );

    assert.match(html, /name="tab" value="audit"/);
    assert.doesNotMatch(html, /<form[^>]*action="\/admin"/);
    assert.match(html, /defaultValue="approval"|value="approval"/);
    assert.match(html, /이도윤 · approver@example\.com/);
    assert.match(html, /승인/);
    assert.match(html, /25건 중 13-24건 표시/);
    assert.match(html, /처음/);
    assert.match(html, /aria-current="page"[^>]*>2</);
    assert.match(html, /끝/);
    assert.match(
      html,
      /href="\/admin\?tab=audit&amp;q=approval&amp;dateFrom=2026-05-01&amp;dateTo=2026-05-08&amp;user=user-003&amp;status=APPROVE"/,
    );
    assert.match(
      html,
      /href="\/admin\?tab=audit&amp;q=approval&amp;dateFrom=2026-05-01&amp;dateTo=2026-05-08&amp;user=user-003&amp;status=APPROVE&amp;page=3"/,
    );
  });

  test("renders admin login history filters and results", () => {
    const users = [
      {
        id: "user-001",
        name: "김민준",
        email: "minjun@example.com",
      },
    ];
    const filters = {
      query: "Chrome",
      result: "failure" as const,
      userId: "user-001",
      dateFrom: "2026-05-14",
      dateTo: "2026-05-14",
    };
    const html = renderToStaticMarkup(
      React.createElement(AdminLoginHistoryList, {
        histories: [
          {
            id: "login-001",
            attemptedName: "김민준",
            success: false,
            failureReason: "invalid_credentials",
            ipAddress: "203.0.113.10",
            userAgent: "Mozilla/5.0 Chrome/126.0.0.0",
            browser: "Chrome 126",
            os: "Windows",
            device: "데스크톱",
            country: "KR",
            region: "45",
            city: "Gunsan",
            createdAt: new Date("2026-05-14T01:30:00.000Z"),
            user: {
              id: "user-001",
              name: "김민준",
              email: "minjun@example.com",
            },
          },
        ],
        users,
        filterControls: React.createElement(
          AdminLoginHistoryFilterControlsContent,
          {
            filters,
            navigate: () => {},
            total: 13,
            users,
          },
        ),
        filters,
        page: 1,
        pageSize: 12,
        total: 13,
        totalPages: 2,
      }),
    );

    assert.match(html, /name="tab" value="login-history"/);
    assert.doesNotMatch(html, /<form[^>]*action="\/admin"/);
    assert.match(html, /로그인 이력/);
    assert.match(html, /실패/);
    assert.match(html, /이름 또는 비밀번호 불일치/);
    assert.match(html, /203\.0\.113\.10/);
    assert.match(html, /데스크톱 · Chrome 126 · Windows/);
    assert.match(html, /군산, 전북, 대한민국 · IP 추정/);
    assert.doesNotMatch(html, /Gunsan \/ 45 \/ KR/);
    assert.match(html, /13건 중 1-12건 표시/);
    assert.match(
      html,
      /href="\/admin\?tab=login-history&amp;q=Chrome&amp;dateFrom=2026-05-14&amp;dateTo=2026-05-14&amp;user=user-001&amp;result=failure&amp;page=2"/,
    );
  });

  test("renders education target badges with distinct tones", () => {
    const commonHtml = renderToStaticMarkup(
      React.createElement(ResourceCategoryBadge, {
        category: "education",
        educationLevel: "common",
      }),
    );
    const highHtml = renderToStaticMarkup(
      React.createElement(ResourceCategoryBadge, {
        category: "education",
        educationLevel: "high",
      }),
    );
    const middleHtml = renderToStaticMarkup(
      React.createElement(ResourceCategoryBadge, {
        category: "education",
        educationLevel: "middle",
      }),
    );

    assert.match(commonHtml, /교육 · 공통/);
    assert.match(commonHtml, /bg-\[#eef2f7\]/);
    assert.match(highHtml, /교육 · 고등/);
    assert.match(highHtml, /bg-\[#eaf0fb\]/);
    assert.match(middleHtml, /교육 · 중등/);
    assert.match(middleHtml, /bg-\[#fff8df\]/);
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
    assert.match(html, /tabular-nums text-sm font-semibold text-\[#697386\]/);
    assert.match(html, /바자울/);
    assert.doesNotMatch(html, /고정/);
    assert.match(html, /PDF/);
    assert.match(html, /업무자료\.pdf/);
    assert.doesNotMatch(html, /총 1개 · PDF 1개/);
    assert.doesNotMatch(html, /break-all text-xs leading-5/);
    assert.match(html, /2026\. 05\. 11\. 오후 12:02/);
    assert.match(html, /12명/);
  });

  test("summarizes resource attachment file names in the list", () => {
    const html = renderToStaticMarkup(
      React.createElement(ResourceLibraryList, {
        items: [
          {
            ...resourceItem,
            attachments: [
              { fileName: "education-plan.pdf", size: 1024 },
              { fileName: "safety-checklist.xlsx", size: 2048 },
              { fileName: "program-photos.zip", size: 4096 },
            ],
          },
        ],
        hasActiveFilter: false,
      }),
    );

    assert.match(html, /education-plan\.pdf/);
    assert.match(html, /외 2개/);
    assert.doesNotMatch(html, /safety-checklist\.xlsx/);
    assert.doesNotMatch(html, /program-photos\.zip/);
    assert.match(html, /min-w-0 truncate text-\[#394150\]/);
    assert.doesNotMatch(html, /총 3개/);
  });

  test("renders compact resource library rows", () => {
    const html = renderToStaticMarkup(
      React.createElement(ResourceLibraryList, {
        compact: true,
        items: [resourceItem],
        hasActiveFilter: false,
      }),
    );

    assert.match(html, /min-h-20 gap-4 px-4 py-2/);
    assert.match(html, /block p-2\.5/);
    assert.match(html, /leading-4/);
    assert.match(html, /h-6 border-\[#f0c6c6\]/);
    assert.doesNotMatch(html, /min-h-24 gap-5 px-5 py-3/);
  });

  test("renders resource library toolbar inside the list panel", () => {
    const html = renderToStaticMarkup(
      React.createElement(ResourceLibraryList, {
        items: [resourceItem],
        hasActiveFilter: false,
        toolbar: React.createElement(
          "div",
          { className: "resource-toolbar-test" },
          "toolbar",
        ),
      }),
    );

    assert.match(
      html,
      /border-b border-\[#d9dee7\] bg-white px-4 py-2/,
    );
    assert.match(html, /resource-toolbar-test/);
    assert.ok(html.indexOf("resource-toolbar-test") < html.indexOf("자료명"));
  });

  test("renders resource library filter controls as a compact row", () => {
    const html = renderToStaticMarkup(
      React.createElement(ResourceLibraryFilterControlsContent, {
        category: "education",
        leadingControl: React.createElement(
          "div",
          { className: "education-category-control" },
          "category",
        ),
        query: "safety",
        navigate: () => {},
      }),
    );

    assert.match(
      html,
      /flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center/,
    );
    assert.match(html, /class="sr-only"/);
    assert.match(html, /h-9 min-w-0 flex-1/);
    assert.match(html, /h-9 flex-1 px-3 text-sm sm:flex-none/);
    assert.ok(
      html.indexOf("education-category-control") <
        html.indexOf('id="resourceSearch"'),
    );
    assert.doesNotMatch(html, /mt-2 h-10/);
  });

  test("renders education resource category dropdown filters", () => {
    const html = renderToStaticMarkup(
      React.createElement(EducationResourceQuickFiltersContent, {
        educationLevel: "high",
        query: "검정고시",
        navigate: () => {},
      }),
    );

    assert.match(html, /aria-label="교육 자료 카테고리 검색"/);
    assert.match(html, /role="group"/);
    assert.match(html, /flex min-w-0 gap-2 sm:shrink-0/);
    assert.match(html, /<select/);
    assert.match(html, /sm:w-24/);
    assert.match(html, /sm:w-28/);
    assert.match(html, />대상</);
    assert.match(html, />분류</);
    assert.match(html, /value="common">공통/);
    assert.match(html, /value="high" selected="">고등/);
    assert.match(html, /value="middle">중등/);
    assert.match(html, /value="검정고시" selected="">검정고시/);
    assert.match(html, /value="기출문제">기출문제/);
    assert.match(html, /value="개념">개념/);
    assert.doesNotMatch(html, /href="\/resources/);
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
