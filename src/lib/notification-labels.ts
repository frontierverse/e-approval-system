export function getNotificationTypeLabel(type: string) {
  const labels: Record<string, string> = {
    APPROVAL_REQUESTED: "결재 요청",
    APPROVAL_APPROVED: "승인",
    APPROVAL_REJECTED: "반려",
    APPROVAL_COMPLETED: "승인완료",
  };

  return labels[type] ?? "알림";
}
