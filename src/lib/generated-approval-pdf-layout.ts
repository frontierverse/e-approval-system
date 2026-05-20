export type ApprovalPdfLayoutKind =
  | "expense"
  | "general"
  | "purchase"
  | "vacation";

export type ApprovalPdfLayout = {
  accentFill: string;
  badgeLabel: string;
  bodyTitle: string;
  focusFill: string;
  focusTitle: string;
  headerFill: string;
  headerTitle: string;
  heroFill: string;
  heroStroke: string;
  infoLabelFill: string;
  kind: ApprovalPdfLayoutKind;
  notesLines: [string, string];
  notesTitle: string;
  pageFill: string;
  reviewLabel: string;
  reviewValue: string;
  subtitleFill: string;
};

const approvalPdfLayouts = {
  general: {
    accentFill: "#1f3347",
    badgeLabel: "일반 기안",
    bodyTitle: "기안 내용",
    focusFill: "#f8fafc",
    focusTitle: "기안 검토 기준",
    headerFill: "#1f3347",
    headerTitle: "사내 전자결재 문서",
    heroFill: "#ffffff",
    heroStroke: "#d6dbe3",
    infoLabelFill: "#f3f6f9",
    kind: "general",
    notesLines: [
      "결재자는 문서 내용과 첨부파일을 확인한 후 승인 또는 반려 처리합니다.",
      "최종 승인 완료 후 이 원본문서를 기준으로 보관 및 검증 절차가 진행됩니다.",
    ],
    notesTitle: "결재 유의사항",
    pageFill: "#f5f6f8",
    reviewLabel: "검토항목",
    reviewValue: "본문 확인",
    subtitleFill: "#c8d3df",
  },
  expense: {
    accentFill: "#8a3b12",
    badgeLabel: "지출 결의",
    bodyTitle: "지출/정산 내용",
    focusFill: "#fff7ed",
    focusTitle: "지출 검토 기준",
    headerFill: "#7c2d12",
    headerTitle: "지출결의 전자문서",
    heroFill: "#fffaf5",
    heroStroke: "#f0cfb5",
    infoLabelFill: "#fff1e6",
    kind: "expense",
    notesLines: [
      "결재자는 지출 목적, 금액, 지급처와 증빙 첨부 여부를 함께 확인합니다.",
      "정산 또는 지급 처리 전 예산 기준과 내부 증빙 보관 기준을 검토합니다.",
    ],
    notesTitle: "지출 결재 유의사항",
    pageFill: "#faf7f3",
    reviewLabel: "증빙",
    reviewValue: "첨부 확인",
    subtitleFill: "#f8d8bf",
  },
  vacation: {
    accentFill: "#0f6f8f",
    badgeLabel: "휴가 신청",
    bodyTitle: "휴가 신청 내용",
    focusFill: "#eef7f8",
    focusTitle: "휴가 검토 기준",
    headerFill: "#0f5f7a",
    headerTitle: "휴가신청 전자문서",
    heroFill: "#f6fcfd",
    heroStroke: "#b9dde4",
    infoLabelFill: "#e7f4f7",
    kind: "vacation",
    notesLines: [
      "결재자는 휴가 일정, 업무 인수인계, 복귀 예정 사항을 확인합니다.",
      "근태 기록과 실제 휴가 사용 내역은 담당 부서의 기준에 따라 관리합니다.",
    ],
    notesTitle: "휴가 결재 유의사항",
    pageFill: "#f3f8fa",
    reviewLabel: "근태",
    reviewValue: "기간 확인",
    subtitleFill: "#c8e8ef",
  },
  purchase: {
    accentFill: "#2f6b3f",
    badgeLabel: "구매 요청",
    bodyTitle: "구매 요청 내용",
    focusFill: "#f0f8f1",
    focusTitle: "구매 검토 기준",
    headerFill: "#285b35",
    headerTitle: "구매요청 전자문서",
    heroFill: "#f8fdf8",
    heroStroke: "#c4dfc9",
    infoLabelFill: "#e9f5eb",
    kind: "purchase",
    notesLines: [
      "결재자는 구매 목적, 품목, 수량, 예상 비용과 납품 필요 시점을 확인합니다.",
      "구매 승인 후 발주와 검수 절차는 내부 구매 기준에 따라 진행합니다.",
    ],
    notesTitle: "구매 결재 유의사항",
    pageFill: "#f5faf5",
    reviewLabel: "구매",
    reviewValue: "품목 확인",
    subtitleFill: "#cde8d2",
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

  return approvalPdfLayouts.general;
}
