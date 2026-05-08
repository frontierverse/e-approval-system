import type { ApprovalDocument, DocumentStatus } from "@/lib/mock-data";

export const documentArchiveRetentionYears = 5;

const archiveReviewStatuses = new Set<DocumentStatus>([
  "approved",
  "rejected",
  "recalled",
]);

export type DocumentArchiveInfo = {
  applies: boolean;
  isReviewDue: boolean;
  baseDate: string | null;
  reviewAt: string | null;
};

export function getDocumentArchiveInfo(
  document: ApprovalDocument,
  now = new Date(),
): DocumentArchiveInfo {
  if (!archiveReviewStatuses.has(document.status)) {
    return {
      applies: false,
      isReviewDue: false,
      baseDate: null,
      reviewAt: null,
    };
  }

  const baseDate = document.completedAt ?? document.submittedAt ?? document.createdAt;
  const reviewAt = addYears(new Date(baseDate), documentArchiveRetentionYears);

  return {
    applies: true,
    isReviewDue: reviewAt.getTime() <= now.getTime(),
    baseDate,
    reviewAt: reviewAt.toISOString(),
  };
}

export function getArchivePolicyText(info: DocumentArchiveInfo) {
  if (!info.applies) {
    return "진행 중인 문서는 보관 검토 대상이 아닙니다.";
  }

  return info.isReviewDue
    ? "보관 검토 대상입니다. 자동 삭제하지 않고 관리자 검토 후 처리합니다."
    : `${documentArchiveRetentionYears}년 보관 후 검토합니다. 자동 삭제하지 않습니다.`;
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);

  return next;
}
