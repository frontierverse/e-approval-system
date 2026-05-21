import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isGeneratedPdfAuditLog } from "../src/lib/generated-pdf-audit.ts";

describe("generated PDF audit display", () => {
  test("detects source approval PDF generation from metadata", () => {
    assert.equal(
      isGeneratedPdfAuditLog({
        action: "UPDATE_DRAFT",
        targetType: "Attachment",
        message: "시스템 원본문서 PDF를 생성했습니다.",
        metadata: {
          generatedApprovalPdfType: "SOURCE",
        },
      }),
      true,
    );
  });

  test("detects existing generated PDF logs from messages", () => {
    assert.equal(
      isGeneratedPdfAuditLog({
        action: "UPDATE_DRAFT",
        targetType: "Attachment",
        message: "최종 승인본 PDF를 자동 생성했습니다.",
      }),
      true,
    );
  });

  test("does not treat normal attachment updates as PDF generation", () => {
    assert.equal(
      isGeneratedPdfAuditLog({
        action: "UPDATE_DRAFT",
        targetType: "Attachment",
        message: "첨부파일 서명본을 생성했습니다.",
      }),
      false,
    );
  });
});
