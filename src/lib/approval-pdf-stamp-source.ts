export type ApprovalStampImageSource = {
  name: string;
  signatureImageStorageProvider?: string | null;
  signatureImageStorageKey?: string | null;
  isProxy?: boolean;
};

export type ApprovalStampStep = {
  approver: ApprovalStampImageSource;
  decisionType?: string | null;
  actedBy?: ApprovalStampImageSource | null;
  proxyApprovedBy?: ApprovalStampImageSource | null;
};

export function getFinalApprovalStampSource(step: ApprovalStampStep) {
  if (step.decisionType === "PROXY") {
    const actor = step.proxyApprovedBy ?? step.actedBy;
    // Never substitute the original approver's identity when a legacy actor is missing.
    return { ...(actor ?? { name: "처리자 확인 필요" }), isProxy: true };
  }
  return step.approver;
}

export function getStampedApprovalPdfTypeLabel(status: string) {
  return status === "APPROVED" ? "승인본" : "결재본";
}

export function getVisibleApprovalColumnCount(totalApprovalSteps: number) {
  return Math.max(1, Math.min(totalApprovalSteps, 5));
}

export function getVisibleApprovalRowCount(totalApprovalSteps: number) {
  const columnCount = getVisibleApprovalColumnCount(totalApprovalSteps);

  return Math.max(
    1,
    Math.ceil(Math.max(1, totalApprovalSteps) / columnCount),
  );
}

export function getApprovalStampColumnIndex(
  order: number,
  approvalColumnCount: number,
) {
  const columnCount = Math.max(1, approvalColumnCount);
  const normalizedOrder = Math.max(1, Math.floor(order));

  return (normalizedOrder - 1) % columnCount;
}

export function getApprovalStampRowIndex(
  order: number,
  approvalColumnCount: number,
) {
  const columnCount = Math.max(1, approvalColumnCount);
  const normalizedOrder = Math.max(1, Math.floor(order));

  return Math.floor((normalizedOrder - 1) / columnCount);
}
