export type DraftUpdateAuditApprover = {
  id: string;
  name: string;
};

export type DraftUpdateAuditDocument = {
  title: string;
  category: string;
  content: string;
  templateId: string;
  status: string;
  documentNo: string | null;
  approvers: DraftUpdateAuditApprover[];
};

export type DraftUpdateAuditAttachment = {
  id: string;
  originalName: string;
};

type DraftUpdateAuditChange =
  | {
      field: "title" | "template" | "status" | "documentNo";
      label: string;
      before: string | null;
      after: string | null;
    }
  | {
      field: "content";
      label: string;
      beforeLength: number;
      afterLength: number;
    }
  | {
      field: "approvalLine";
      label: string;
      before: DraftUpdateAuditApprover[];
      after: DraftUpdateAuditApprover[];
    }
  | {
      field: "attachments";
      label: string;
      added: string[];
      removed: DraftUpdateAuditAttachment[];
    };

export type DraftUpdateAuditDetails = {
  summary: string;
  changes: DraftUpdateAuditChange[];
};

type CreateDraftUpdateAuditDetailsInput = {
  before: DraftUpdateAuditDocument;
  after: DraftUpdateAuditDocument;
  addedAttachmentNames?: string[];
  removedAttachments?: DraftUpdateAuditAttachment[];
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "임시저장",
  SUBMITTED: "결재요청",
  IN_PROGRESS: "결재진행",
  APPROVED: "승인완료",
  REJECTED: "반려",
  RECALLED: "회수",
};

export function createDraftUpdateAuditDetails({
  before,
  after,
  addedAttachmentNames = [],
  removedAttachments = [],
}: CreateDraftUpdateAuditDetailsInput): DraftUpdateAuditDetails {
  const changes: DraftUpdateAuditChange[] = [];
  const summaryParts: string[] = [];

  if (before.title !== after.title) {
    changes.push({
      field: "title",
      label: "제목",
      before: before.title,
      after: after.title,
    });
    summaryParts.push(
      `제목 ${quoteAuditValue(before.title)} -> ${quoteAuditValue(after.title)}`,
    );
  }

  if (
    before.templateId !== after.templateId ||
    before.category !== after.category
  ) {
    changes.push({
      field: "template",
      label: "문서양식",
      before: before.category,
      after: after.category,
    });
    summaryParts.push(
      `문서양식 ${quoteAuditValue(before.category)} -> ${quoteAuditValue(after.category)}`,
    );
  }

  if (before.content !== after.content) {
    changes.push({
      field: "content",
      label: "본문",
      beforeLength: before.content.length,
      afterLength: after.content.length,
    });
    summaryParts.push("본문 변경");
  }

  if (!areApprovalLinesEqual(before.approvers, after.approvers)) {
    changes.push({
      field: "approvalLine",
      label: "결재선",
      before: before.approvers,
      after: after.approvers,
    });
    summaryParts.push(
      `결재선 ${formatApprovalLine(before.approvers)} -> ${formatApprovalLine(after.approvers)}`,
    );
  }

  if (addedAttachmentNames.length > 0 || removedAttachments.length > 0) {
    changes.push({
      field: "attachments",
      label: "첨부파일",
      added: addedAttachmentNames,
      removed: removedAttachments,
    });

    if (addedAttachmentNames.length > 0) {
      summaryParts.push(
        `첨부파일 추가 ${addedAttachmentNames.length}개${formatNamePreview(addedAttachmentNames)}`,
      );
    }

    if (removedAttachments.length > 0) {
      summaryParts.push(
        `첨부파일 삭제 ${removedAttachments.length}개${formatNamePreview(
          removedAttachments.map((attachment) => attachment.originalName),
        )}`,
      );
    }
  }

  if (before.status !== after.status) {
    changes.push({
      field: "status",
      label: "상태",
      before: formatStatus(before.status),
      after: formatStatus(after.status),
    });
    summaryParts.push(
      `상태 ${formatStatus(before.status)} -> ${formatStatus(after.status)}`,
    );
  }

  if (before.documentNo !== after.documentNo) {
    changes.push({
      field: "documentNo",
      label: "문서번호",
      before: before.documentNo,
      after: after.documentNo,
    });
    summaryParts.push(
      `문서번호 ${formatNullable(before.documentNo)} -> ${formatNullable(
        after.documentNo,
      )}`,
    );
  }

  return {
    summary: summaryParts.length > 0 ? summaryParts.join(", ") : "변경 사항 없음",
    changes,
  };
}

function areApprovalLinesEqual(
  before: DraftUpdateAuditApprover[],
  after: DraftUpdateAuditApprover[],
) {
  if (before.length !== after.length) {
    return false;
  }

  return before.every((approver, index) => {
    const nextApprover = after[index];

    return (
      nextApprover !== undefined &&
      approver.id === nextApprover.id &&
      approver.name === nextApprover.name
    );
  });
}

function formatApprovalLine(approvers: DraftUpdateAuditApprover[]) {
  if (approvers.length === 0) {
    return "없음";
  }

  return approvers.map((approver) => approver.name).join(" -> ");
}

function formatNamePreview(names: string[]) {
  if (names.length === 0) {
    return "";
  }

  const visibleNames = names.slice(0, 3).map((name) => truncateAuditText(name, 24));
  const hiddenCount = names.length - visibleNames.length;
  const suffix = hiddenCount > 0 ? ` 외 ${hiddenCount}개` : "";

  return `(${visibleNames.join(", ")}${suffix})`;
}

function formatNullable(value: string | null) {
  return value === null || value.length === 0 ? "없음" : value;
}

function formatStatus(status: string) {
  return STATUS_LABELS[status] ?? status;
}

function quoteAuditValue(value: string) {
  return `"${truncateAuditText(value)}"`;
}

function truncateAuditText(value: string, maxLength = 40) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}
