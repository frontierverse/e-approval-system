import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getApprovalDecisionPlan,
  type ApprovalFlowDocument,
} from "../src/lib/approval-flow-core.ts";

function createTwoStepDocument(): ApprovalFlowDocument {
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

describe("approval rejection flow", () => {
  test("ends the document when the first approver rejects", () => {
    const plan = getApprovalDecisionPlan(
      createTwoStepDocument(),
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

  test("ends the document when a later current approver rejects", () => {
    const document = createTwoStepDocument();
    document.status = "IN_PROGRESS";
    document.approvalSteps[0].status = "APPROVED";
    document.approvalSteps[1].status = "PENDING";

    const plan = getApprovalDecisionPlan(document, "approver-002", "reject");

    assert.equal(plan.ok, true);

    if (!plan.ok) {
      return;
    }

    assert.equal(plan.currentStep.id, "step-002");
    assert.equal(plan.nextStep, null);
    assert.equal(plan.finalDocumentStatus, "REJECTED");
    assert.equal(plan.completesDocument, true);
  });

  test("blocks a waiting approver from rejecting before their turn", () => {
    const plan = getApprovalDecisionPlan(
      createTwoStepDocument(),
      "approver-002",
      "reject",
    );

    assert.deepEqual(plan, {
      ok: false,
      message: "현재 결재자만 승인 또는 반려할 수 있습니다.",
    });
  });

  test("blocks rejection for draft documents", () => {
    const document = createTwoStepDocument();
    document.status = "DRAFT";

    const plan = getApprovalDecisionPlan(document, "approver-001", "reject");

    assert.deepEqual(plan, {
      ok: false,
      message: "진행 중인 문서만 결재할 수 있습니다.",
    });
  });
});
