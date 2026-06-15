import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  getApprovalStampColumnIndex,
  getApprovalStampRowIndex,
  getFinalApprovalStampSource,
  getStampedApprovalPdfTypeLabel,
  getVisibleApprovalColumnCount,
  getVisibleApprovalRowCount,
} from "../src/lib/approval-pdf-stamp-source.ts";
import { compileDocumentTemplateContent } from "../src/lib/draft-template-content.ts";
import { createApprovalDocumentPdfBuffer } from "../src/lib/generated-approval-pdf.ts";

describe("generated approval pdf", () => {
  test("uses the approval-line approver stamp for final approval PDFs", () => {
    const source = getFinalApprovalStampSource({
      approver: {
        name: "안윤숙",
        signatureImageStorageProvider: "supabase",
        signatureImageStorageKey: "signature-images/facility-head.png",
      },
    });

    assert.equal(source.name, "안윤숙");
    assert.equal(
      source.signatureImageStorageKey,
      "signature-images/facility-head.png",
    );
  });

  test("labels in-progress stamped PDFs separately from final approvals", () => {
    assert.equal(getStampedApprovalPdfTypeLabel("IN_PROGRESS"), "결재본");
    assert.equal(getStampedApprovalPdfTypeLabel("SUBMITTED"), "결재본");
    assert.equal(getStampedApprovalPdfTypeLabel("APPROVED"), "승인본");
  });

  test("places stamps by approval-line rows and columns", () => {
    const columnCount = getVisibleApprovalColumnCount(5);

    assert.equal(columnCount, 5);
    assert.equal(getApprovalStampColumnIndex(1, columnCount), 0);
    assert.equal(getApprovalStampColumnIndex(2, columnCount), 1);
    assert.equal(getApprovalStampColumnIndex(3, columnCount), 2);
    assert.equal(getApprovalStampColumnIndex(4, columnCount), 3);
    assert.equal(getApprovalStampColumnIndex(5, columnCount), 4);
    assert.equal(getApprovalStampColumnIndex(6, columnCount), 0);
    assert.equal(getApprovalStampRowIndex(1, columnCount), 0);
    assert.equal(getApprovalStampRowIndex(5, columnCount), 0);
    assert.equal(getApprovalStampRowIndex(6, columnCount), 1);
  });

  test("wraps long approval lines instead of hiding approvers", () => {
    assert.equal(getVisibleApprovalColumnCount(1), 1);
    assert.equal(getVisibleApprovalColumnCount(5), 5);
    assert.equal(getVisibleApprovalColumnCount(6), 5);
    assert.equal(getVisibleApprovalColumnCount(12), 5);
    assert.equal(getVisibleApprovalRowCount(1), 1);
    assert.equal(getVisibleApprovalRowCount(5), 1);
    assert.equal(getVisibleApprovalRowCount(6), 2);
    assert.equal(getVisibleApprovalRowCount(12), 3);
  });

  test("creates readable approval document PDF buffers", async () => {
    const buffer = await createApprovalDocumentPdfBuffer({
      documentNo: "DOC-2026-0001",
      title: "구매요청서",
      category: "구매요청서",
      content: "구매 목적과 품목을 검토해 주세요.",
      templateName: "구매요청서",
      drafter: {
        name: "김민준",
        departmentName: "운영지원팀",
        positionName: "팀장",
      },
      approvers: [
        {
          name: "박서연",
          departmentName: "운영지원팀",
          positionName: "1차 결재자",
        },
      ],
      issuedAt: new Date("2026-06-04T09:30:00+09:00"),
    });
    const pdf = await PDFDocument.load(buffer);

    assert.equal(pdf.getPageCount(), 1);
    assert.ok(buffer.byteLength > 0);
  });

  test("paginates long schema table values", async () => {
    const schema = {
      version: 1,
      fields: [
        {
          name: "title",
          label: "제목",
          type: "text",
          required: true,
        },
        {
          name: "content",
          label: "상세 내용",
          type: "textarea",
          required: true,
        },
      ],
    };
    const longContent = Array.from(
      { length: 90 },
      (_, index) =>
        `긴본문 ${index + 1}번째 줄입니다. PDF 표 안에서 줄바꿈과 페이지 넘김이 안정적으로 처리되어야 합니다.`,
    ).join("\n");
    const content = compileDocumentTemplateContent(schema, {
      title: "장문 문서",
      content: longContent,
    });
    const buffer = await createApprovalDocumentPdfBuffer({
      documentNo: "DOC-2026-LONG",
      title: "장문 schema 문서",
      category: "일반 기안서",
      content,
      templateName: "일반 기안서",
      templateSchema: schema,
      drafter: {
        name: "김민준",
        departmentName: "운영지원팀",
        positionName: "팀장",
      },
      approvers: [
        {
          name: "박서연",
          departmentName: "운영지원팀",
          positionName: "1차 결재자",
        },
        {
          name: "이도윤",
          departmentName: "경영지원실",
          positionName: "최종 결재자",
        },
      ],
      issuedAt: new Date("2026-06-04T09:30:00+09:00"),
    });
    const pdf = await PDFDocument.load(buffer);

    assert.ok(pdf.getPageCount() > 1);
    assert.ok(buffer.byteLength > 0);
  });
});
