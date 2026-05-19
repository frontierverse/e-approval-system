export type ApprovalStampImageSource = {
  name: string;
  signatureImageStorageProvider?: string | null;
  signatureImageStorageKey?: string | null;
};

export type ApprovalStampStep = {
  approver: ApprovalStampImageSource;
};

export function getFinalApprovalStampSource(step: ApprovalStampStep) {
  return step.approver;
}

export function getStampedApprovalPdfTypeLabel(status: string) {
  return status === "APPROVED" ? "승인본" : "결재본";
}

export function getVisibleApprovalColumnCount(totalApprovalSteps: number) {
  return Math.max(1, Math.min(totalApprovalSteps, 5));
}

export function getApprovalStampColumnIndex(
  order: number,
  approvalColumnCount: number,
) {
  const columnCount = Math.max(1, approvalColumnCount);

  return Math.max(0, Math.min(order - 1, columnCount - 1));
}
