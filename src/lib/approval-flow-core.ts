export type ApprovalFlowDecision = "approve" | "reject";

export type ApprovalFlowStep = {
  id: string;
  order: number;
  approverId: string;
  status: string;
};

export type ApprovalFlowDocument = {
  id: string;
  drafterId?: string;
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

export type ProxyApprovalDecisionPlan<TDocument extends ApprovalFlowDocument> =
  | {
      ok: true;
      currentStep: TDocument["approvalSteps"][number];
      targetStep: TDocument["approvalSteps"][number];
      stepsToApprove: TDocument["approvalSteps"][number][];
      document: TDocument;
      nextStep: TDocument["approvalSteps"][number] | null;
      finalDocumentStatus: "IN_PROGRESS" | "APPROVED";
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

export function getProxyApprovalDecisionPlan<
  TDocument extends ApprovalFlowDocument,
>(
  document: TDocument | null,
  actorId: string,
  targetStepId: string,
): ProxyApprovalDecisionPlan<TDocument> {
  if (!document) {
    return {
      ok: false,
      message: "문서를 찾을 수 없습니다.",
    };
  }

  if (document.status !== "SUBMITTED" && document.status !== "IN_PROGRESS") {
    return {
      ok: false,
      message: "진행 중인 문서만 대리결재할 수 있습니다.",
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

  const targetStep = document.approvalSteps.find(
    (step) => step.id === targetStepId,
  );

  if (!targetStep) {
    return {
      ok: false,
      message: "대리결재할 결재 단계를 찾을 수 없습니다.",
    };
  }

  if (targetStep.status !== "PENDING" && targetStep.status !== "WAITING") {
    return {
      ok: false,
      message: "대기 중인 결재 단계까지만 대리결재할 수 있습니다.",
    };
  }

  if (targetStep.order < currentStep.order) {
    return {
      ok: false,
      message: "이미 지나간 결재 단계는 대리결재할 수 없습니다.",
    };
  }

  if (targetStep.id === currentStep.id && currentStep.approverId === actorId) {
    return {
      ok: false,
      message: "본인 결재 단계는 일반 승인으로 처리하세요.",
    };
  }

  const stepsToApprove = getStepsThroughTarget(document, currentStep, targetStep);

  if (stepsToApprove.length === 0) {
    return {
      ok: false,
      message: "대리결재할 결재 단계가 없습니다.",
    };
  }

  const nextStep =
    document.approvalSteps
      .filter((step) => step.order > targetStep.order)
      .sort((left, right) => left.order - right.order)[0] ?? null;

  return {
    ok: true,
    currentStep,
    targetStep,
    stepsToApprove,
    document,
    nextStep,
    finalDocumentStatus: nextStep ? "IN_PROGRESS" : "APPROVED",
    completesDocument: !nextStep,
  };
}

function getStepsThroughTarget<TDocument extends ApprovalFlowDocument>(
  document: TDocument,
  currentStep: TDocument["approvalSteps"][number],
  targetStep: TDocument["approvalSteps"][number],
) {
  return document.approvalSteps
    .filter(
      (step) =>
        step.order >= currentStep.order &&
        step.order <= targetStep.order &&
        (step.status === "PENDING" || step.status === "WAITING"),
    )
    .sort((left, right) => left.order - right.order);
}
