import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createDraftUpdateAuditDetails } from "../src/lib/draft-update-audit.ts";

const baseDocument = {
  title: "기존 결재 제목",
  category: "일반 기안서",
  content: "기존 본문",
  templateId: "template-general",
  status: "DRAFT",
  documentNo: null,
  approvers: [
    {
      id: "user-001",
      name: "김민준",
    },
  ],
};

describe("draft update audit", () => {
  test("summarizes changed title, template, approval line, attachments, status, and document number", () => {
    const details = createDraftUpdateAuditDetails({
      before: baseDocument,
      after: {
        ...baseDocument,
        title: "변경된 결재 제목",
        category: "휴가 신청서",
        templateId: "template-vacation",
        status: "SUBMITTED",
        documentNo: "EA-2026-0001",
        approvers: [
          {
            id: "user-002",
            name: "박재숙",
          },
          {
            id: "user-003",
            name: "안윤숙",
          },
        ],
      },
      addedAttachmentNames: ["추가자료.pdf"],
      removedAttachments: [
        {
          id: "attachment-001",
          originalName: "삭제자료.pdf",
        },
      ],
    });

    assert.equal(
      details.summary,
      '제목 "기존 결재 제목" -> "변경된 결재 제목", 문서양식 "일반 기안서" -> "휴가 신청서", 결재선 김민준 -> 박재숙 -> 안윤숙, 첨부파일 추가 1개(추가자료.pdf), 첨부파일 삭제 1개(삭제자료.pdf), 상태 임시저장 -> 결재요청, 문서번호 없음 -> EA-2026-0001',
    );
    assert.deepEqual(
      details.changes.map((change) => change.field),
      [
        "title",
        "template",
        "approvalLine",
        "attachments",
        "status",
        "documentNo",
      ],
    );
  });

  test("records content changes without storing full body text", () => {
    const details = createDraftUpdateAuditDetails({
      before: baseDocument,
      after: {
        ...baseDocument,
        content: "바뀐 본문입니다.",
      },
    });

    assert.equal(details.summary, "본문 변경");
    assert.deepEqual(details.changes, [
      {
        field: "content",
        label: "본문",
        beforeLength: 5,
        afterLength: 9,
      },
    ]);
  });

  test("states when there are no meaningful changes", () => {
    const details = createDraftUpdateAuditDetails({
      before: baseDocument,
      after: baseDocument,
    });

    assert.equal(details.summary, "변경 사항 없음");
    assert.deepEqual(details.changes, []);
  });
});
