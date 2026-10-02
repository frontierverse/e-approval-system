import { formatDocumentDate } from "./document-library";
import type { MobileDocument, MobileDocumentHistory } from "./types";

type ApprovalStep = MobileDocument["approvalSteps"][number];

export const detailStatusLabels: Record<string, string> = {
  draft: "임시저장", submitted: "상신", in_progress: "결재 중", approved: "승인", rejected: "반려",
  recalled: "회수", discarded: "폐기", waiting: "차례 대기", pending: "결재 대기", completed: "완료", skipped: "건너뜀",
};

export function detailDate(value?: string | null) {
  return value && Number.isFinite(Date.parse(value)) ? formatDocumentDate(value) : "시간 기록 없음";
}

export function stepStatusLabel(step: ApprovalStep) {
  if (step.status === "rejected" && step.decisionType === "PROXY_REJECT") return "대리결재 반려";
  if (step.status === "approved" && (step.decisionType === "PROXY" || step.proxyApprovedByName)) return "대리 승인";
  return detailStatusLabels[step.status] ?? step.status;
}

export function stepActorName(step: ApprovalStep) {
  if (step.status !== "approved" && step.status !== "rejected") return null;
  if (step.actedByName) return step.actedByName;
  // The previous proxy approver is not necessarily the person who rejected that approval.
  if (step.decisionType === "PROXY_REJECT") return null;
  return step.proxyApprovedByName || (step.decisionType === "PROXY" ? null : step.name);
}

export function currentRejectedStep(document: Pick<MobileDocument, "status" | "approvalSteps">) {
  if (document.status !== "rejected") return undefined;
  return [...document.approvalSteps].filter(step => step.status === "rejected")
    .sort((a, b) => (Date.parse(b.actedAt ?? "") || 0) - (Date.parse(a.actedAt ?? "") || 0) || b.order - a.order)[0];
}

export function latestDocumentHistories(histories: readonly MobileDocumentHistory[] = []) {
  return [...histories].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}
