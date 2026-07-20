import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getApprovalPdfLayout } from "../src/lib/generated-approval-pdf-layout.ts";

describe("generated approval pdf layout", () => {
  test("selects document-specific layouts by template name", () => {
    assert.equal(getApprovalPdfLayout("일반 기안서").kind, "general");
    assert.equal(getApprovalPdfLayout("지출결의서").kind, "expense");
    assert.equal(getApprovalPdfLayout("휴가신청서").kind, "vacation");
    assert.equal(getApprovalPdfLayout("구매요청서").kind, "purchase");
    assert.equal(getApprovalPdfLayout("회의록").kind, "meeting");
  });

  test("provides different visual labels for each document layout", () => {
    assert.equal(getApprovalPdfLayout("지출결의서").headerTitle, "지출결의 전자문서");
    assert.equal(getApprovalPdfLayout("휴가신청서").bodyTitle, "휴가 신청 내용");
    assert.equal(getApprovalPdfLayout("구매요청서").focusTitle, "구매 검토 기준");
  });
});
