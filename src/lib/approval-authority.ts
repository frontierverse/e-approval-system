export const APPROVAL_AUTHORITY_POSITION_NAME = "시설장";

export type ApprovalAuthorityCandidate = {
  positionName: string;
};

export function isApprovalAuthorityPosition(
  positionName: string | null | undefined,
) {
  return positionName?.trim() === APPROVAL_AUTHORITY_POSITION_NAME;
}

export function getApprovalAuthorityLineError(
  approvers: readonly ApprovalAuthorityCandidate[],
) {
  if (
    approvers.length !== 1 ||
    !isApprovalAuthorityPosition(approvers[0]?.positionName)
  ) {
    return `${APPROVAL_AUTHORITY_POSITION_NAME} 1명을 결재자로 지정하세요.`;
  }

  return null;
}
