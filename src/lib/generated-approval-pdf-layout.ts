export type ApprovalPdfLayoutKind =
  | "expense"
  | "general"
  | "meeting"
  | "purchase"
  | "vacation";

export type ApprovalPdfLayout = {
  accentFill: string;
  bodyTitle: string;
  heroStroke: string;
  infoLabelFill: string;
  kind: ApprovalPdfLayoutKind;
};

export const approvalPdfInk = "#000000";
export const approvalPdfPaper = "#ffffff";

// All template types share an ink-saving print palette. Use type and weight,
// rather than filled backgrounds, to distinguish headings and labels.
const printPalette = {
  accentFill: approvalPdfInk,
  heroStroke: approvalPdfInk,
  infoLabelFill: approvalPdfPaper,
};

const approvalPdfLayouts = {
  general: {
    ...printPalette,
    bodyTitle: "기안 내용",
    kind: "general",
  },
  expense: {
    ...printPalette,
    bodyTitle: "지출/정산 내용",
    kind: "expense",
  },
  vacation: {
    ...printPalette,
    bodyTitle: "휴가 신청 내용",
    kind: "vacation",
  },
  meeting: {
    ...printPalette,
    bodyTitle: "논의 내용",
    kind: "meeting",
  },
  purchase: {
    ...printPalette,
    bodyTitle: "구매 요청 내용",
    kind: "purchase",
  },
} satisfies Record<ApprovalPdfLayoutKind, ApprovalPdfLayout>;

export function getApprovalPdfLayout(templateName: string) {
  const normalized = templateName.replace(/\s+/g, "").toLowerCase();

  if (
    normalized.includes("지출") ||
    normalized.includes("비용") ||
    normalized.includes("정산")
  ) {
    return approvalPdfLayouts.expense;
  }

  if (
    normalized.includes("휴가") ||
    normalized.includes("연차") ||
    normalized.includes("반차")
  ) {
    return approvalPdfLayouts.vacation;
  }

  if (
    normalized.includes("구매") ||
    normalized.includes("물품") ||
    normalized.includes("발주")
  ) {
    return approvalPdfLayouts.purchase;
  }

  if (normalized.includes("회의")) {
    return approvalPdfLayouts.meeting;
  }

  return approvalPdfLayouts.general;
}
