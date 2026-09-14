/** Until explicit delegation exists, only an independent administrator may act. */
export function canActAsApprovalProxy(
  actorId: string | undefined,
  actorRole: string | undefined,
  drafterId: string,
) {
  return Boolean(actorId && actorId !== drafterId && actorRole?.toUpperCase() === "ADMIN");
}

export function getProxyApprovalReasonError(comment: string) {
  const length = comment.trim().length;
  return length < 2 || length > 1000
    ? "대리결재 사유를 2자 이상 1,000자 이하로 입력하세요."
    : null;
}
