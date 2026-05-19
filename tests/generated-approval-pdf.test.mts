import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getApprovalStampColumnIndex,
  getApprovalStampRowIndex,
  getFinalApprovalStampSource,
  getStampedApprovalPdfTypeLabel,
  getVisibleApprovalColumnCount,
  getVisibleApprovalRowCount,
} from "../src/lib/approval-pdf-stamp-source.ts";

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
});
