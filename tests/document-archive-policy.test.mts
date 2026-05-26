import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getArchiveReviewBaseDateRange,
  documentArchiveRetentionYears,
  getArchivePolicyText,
  getDocumentArchiveInfo,
  getTodayArchiveReviewBaseDateRange,
} from "../src/lib/document-archive-policy.ts";

type ArchiveDocument = Parameters<typeof getDocumentArchiveInfo>[0];

function createDocument(overrides: Partial<ArchiveDocument> = {}): ArchiveDocument {
  return {
    id: "document-001",
    documentNo: "EA-2026-0001",
    title: "보관 정책 테스트",
    templateName: "일반 기안서",
    category: "일반",
    status: "approved",
    drafter: {
      id: "drafter-001",
      name: "작성자",
      departmentName: "바자울",
      positionName: "주임",
    },
    drafterId: "drafter-001",
    createdAt: "2026-04-01T00:00:00.000Z",
    submittedAt: "2026-04-02T00:00:00.000Z",
    completedAt: "2026-05-07T00:00:00.000Z",
    content: "문서 내용",
    attachmentCount: 0,
    attachments: [],
    approvalSteps: [],
    histories: [],
    ...overrides,
  };
}

describe("document archive policy", () => {
  test("does not apply to documents that are still in progress", () => {
    const info = getDocumentArchiveInfo(createDocument({ status: "submitted" }));

    assert.deepEqual(info, {
      applies: false,
      isReviewDue: false,
      baseDate: null,
      reviewAt: null,
    });
    assert.equal(
      getArchivePolicyText(info),
      "진행 중인 문서는 보관 검토 대상이 아닙니다.",
    );
  });

  test("sets the review date five years after the completed date", () => {
    const info = getDocumentArchiveInfo(
      createDocument(),
      new Date("2031-05-06T23:59:59.999Z"),
    );

    assert.equal(info.applies, true);
    assert.equal(info.isReviewDue, false);
    assert.equal(info.baseDate, "2026-05-07T00:00:00.000Z");
    assert.equal(info.reviewAt, "2031-05-07T00:00:00.000Z");
    assert.equal(
      getArchivePolicyText(info),
      `${documentArchiveRetentionYears}년 보관 후 검토합니다. 자동 삭제하지 않습니다.`,
    );
  });

  test("marks terminal documents as due on or after the review date", () => {
    const info = getDocumentArchiveInfo(
      createDocument(),
      new Date("2031-05-07T00:00:00.000Z"),
    );

    assert.equal(info.applies, true);
    assert.equal(info.isReviewDue, true);
    assert.equal(
      getArchivePolicyText(info),
      "보관 검토 대상입니다. 자동 삭제하지 않고 관리자 검토 후 처리합니다.",
    );
  });

  test("falls back to submitted date when completed date is missing", () => {
    const info = getDocumentArchiveInfo(
      createDocument({
        status: "recalled",
        completedAt: null,
      }),
      new Date("2031-04-01T00:00:00.000Z"),
    );

    assert.equal(info.applies, true);
    assert.equal(info.baseDate, "2026-04-02T00:00:00.000Z");
    assert.equal(info.reviewAt, "2031-04-02T00:00:00.000Z");
  });

  test("gets the base date range for documents due for review today", () => {
    const range = getTodayArchiveReviewBaseDateRange(
      new Date("2026-05-19T03:00:00.000Z"),
    );

    assert.equal(range.from.toISOString(), "2021-05-18T15:00:00.000Z");
    assert.equal(range.to.toISOString(), "2021-05-19T14:59:59.999Z");
  });

  test("gets the base date range for a selected archive review date range", () => {
    const range = getArchiveReviewBaseDateRange({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-27",
    });

    assert.equal(range.from?.toISOString(), "2021-04-30T15:00:00.000Z");
    assert.equal(range.to?.toISOString(), "2021-05-27T14:59:59.999Z");
  });
});
