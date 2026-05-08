export type ApprovalFlowDecision = "approve" | "reject";

export type ApprovalFlowStep = {
  id: string;
  order: number;
  approverId: string;
  status: string;
};

export type ApprovalFlowDocument = {
  id: string;
  status: string;
  approvalSteps: ApprovalFlowStep[];
};

export type ApprovalDecisionPlan<TDocument extends ApprovalFlowDocument> =
  | {
      ok: true;
      currentStep: TDocument["approvalSteps"][number];
      document: TDocument;
      nextStep: TDocument["approvalSteps"][number] | null;
      finalDocumentStatus: "IN_PROGRESS" | "APPROVED" | "REJECTED";
      completesDocument: boolean;
    }
  | {
      ok: false;
      message: string;
    };

export function getApprovalDecisionPlan<TDocument extends ApprovalFlowDocument>(
  document: TDocument | null,
  actorId: string,
  decision: ApprovalFlowDecision,
): ApprovalDecisionPlan<TDocument> {
  if (!document) {
    return {
      ok: false,
      message: "문서를 찾을 수 없습니다.",
    };
  }

  if (document.status !== "SUBMITTED" && document.status !== "IN_PROGRESS") {
    return {
      ok: false,
      message: "진행 중인 문서만 결재할 수 있습니다.",
    };
  }

  const currentStep = document.approvalSteps.find(
    (step) => step.status === "PENDING",
  );

  if (!currentStep) {
    return {
      ok: false,
      message: "현재 처리할 결재 단계가 없습니다.",
    };
  }

  if (currentStep.approverId !== actorId) {
    return {
      ok: false,
      message: "현재 결재자만 승인 또는 반려할 수 있습니다.",
    };
  }

  if (decision === "reject") {
    return {
      ok: true,
      currentStep,
      document,
      nextStep: null,
      finalDocumentStatus: "REJECTED",
      completesDocument: true,
    };
  }

  const nextStep =
    document.approvalSteps
      .filter((step) => step.order > currentStep.order)
      .sort((left, right) => left.order - right.order)[0] ?? null;

  return {
    ok: true,
    currentStep,
    document,
    nextStep,
    finalDocumentStatus: nextStep ? "IN_PROGRESS" : "APPROVED",
    completesDocument: !nextStep,
  };
}
