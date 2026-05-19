export type ApprovalLinePolicyApprover = {
  name: string;
  positionName?: string;
  positionLevel?: number | null;
};

export function canStartApprovalLine(approver: ApprovalLinePolicyApprover) {
  void approver;
  return true;
}

export function getApprovalLinePolicyError(
  approvers: readonly ApprovalLinePolicyApprover[],
) {
  for (let index = 1; index < approvers.length; index += 1) {
    const previousApprover = approvers[index - 1];
    const currentApprover = approvers[index];

    if (!previousApprover || !currentApprover) {
      continue;
    }

    if (
      typeof previousApprover.positionLevel !== "number" ||
      typeof currentApprover.positionLevel !== "number"
    ) {
      continue;
    }

    if (previousApprover.positionLevel <= currentApprover.positionLevel) {
      continue;
    }

    return `결재선 순서가 올바르지 않습니다. ${getPositionLabel(
      previousApprover,
    )} 다음에 ${getPositionLabel(
      currentApprover,
    )}은 올 수 없습니다. 결재선은 낮은 직급에서 높은 직급 순서로 지정하세요.`;
  }

  return null;
}

function getPositionLabel(approver: ApprovalLinePolicyApprover) {
  return approver.positionName
    ? `${approver.positionName} 직급`
    : `${approver.name} 결재자`;
}
