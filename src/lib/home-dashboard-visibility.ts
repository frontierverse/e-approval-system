import {
  APPROVAL_AUTHORITY_POSITION_NAME,
  isApprovalAuthorityPosition,
} from "@/lib/approval-authority";

export const HOME_APPROVAL_QUEUE_POSITION_NAME =
  APPROVAL_AUTHORITY_POSITION_NAME;

export function canViewHomeApprovalQueue(
  positionName: string | null | undefined,
) {
  return isApprovalAuthorityPosition(positionName);
}
