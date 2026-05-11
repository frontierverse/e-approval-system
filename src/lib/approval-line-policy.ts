export type ApprovalLinePolicyApprover = {
  name: string;
  positionName?: string;
  positionLevel?: number | null;
};

export const FIRST_APPROVER_MAX_POSITION_LEVEL = 3;

export function canStartApprovalLine(approver: ApprovalLinePolicyApprover) {
  return (
    typeof approver.positionLevel !== "number" ||
    approver.positionLevel <= FIRST_APPROVER_MAX_POSITION_LEVEL
  );
}

export function getApprovalLinePolicyError(
  approvers: readonly ApprovalLinePolicyApprover[],
) {
  const firstApprover = approvers[0];

  if (!firstApprover || canStartApprovalLine(firstApprover)) {
    return null;
  }

  const positionLabel = firstApprover.positionName
    ? `${firstApprover.positionName} 직급`
    : "상위 직급";

  return `${positionLabel}은 첫 결재자로 지정할 수 없습니다. 팀장급 이하 결재자를 먼저 추가한 뒤 상위 결재자로 배치하세요.`;
}
