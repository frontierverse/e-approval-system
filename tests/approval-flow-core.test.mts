import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getApprovalDecisionPlan,
  type ApprovalFlowDocument,
} from "../src/lib/approval-flow-core.ts";

function createSubmittedDocument(): ApprovalFlowDocument {
  return {
    id: "document-001",
    status: "SUBMITTED",
    approvalSteps: [
      {
        id: "step-001",
        order: 1,
        approverId: "approver-001",
        status: "PENDING",
      },
      {
        id: "step-002",
        order: 2,
        approverId: "approver-002",
        status: "WAITING",
      },
    ],
  };
}

describe("approval decision flow", () => {
  test("moves to the next approver after the first approval", () => {
    const plan = getApprovalDecisionPlan(
      createSubmittedDocument(),
      "approver-001",
      "approve",
    );

    assert.equal(plan.ok, true);

    if (!plan.ok) {
      return;
    }

    assert.equal(plan.currentStep.id, "step-001");
    assert.equal(plan.nextStep?.id, "step-002");
    assert.equal(plan.finalDocumentStatus, "IN_PROGRESS");
    assert.equal(plan.completesDocument, false);
  });

  test("completes the document after the final approval", () => {
    const document = createSubmittedDocument();
    document.status = "IN_PROGRESS";
    document.approvalSteps[0].status = "APPROVED";
    document.approvalSteps[1].status = "PENDING";

    const plan = getApprovalDecisionPlan(document, "approver-002", "approve");

    assert.equal(plan.ok, true);

    if (!plan.ok) {
      return;
    }

    assert.equal(plan.currentStep.id, "step-002");
    assert.equal(plan.nextStep, null);
    assert.equal(plan.finalDocumentStatus, "APPROVED");
    assert.equal(plan.completesDocument, true);
  });

  test("rejects the document from the current approver", () => {
    const plan = getApprovalDecisionPlan(
      createSubmittedDocument(),
      "approver-001",
      "reject",
    );

    assert.equal(plan.ok, true);

    if (!plan.ok) {
      return;
    }

    assert.equal(plan.currentStep.id, "step-001");
    assert.equal(plan.nextStep, null);
    assert.equal(plan.finalDocumentStatus, "REJECTED");
    assert.equal(plan.completesDocument, true);
  });

  test("blocks users who are not the current approver", () => {
    const plan = getApprovalDecisionPlan(
      createSubmittedDocument(),
      "approver-002",
      "approve",
    );

    assert.deepEqual(plan, {
      ok: false,
      message: "현재 결재자만 승인 또는 반려할 수 있습니다.",
    });
  });

  test("blocks decisions after the document is already finished", () => {
    const document = createSubmittedDocument();
    document.status = "APPROVED";

    const plan = getApprovalDecisionPlan(document, "approver-001", "approve");

    assert.deepEqual(plan, {
      ok: false,
      message: "진행 중인 문서만 결재할 수 있습니다.",
    });
  });
});
