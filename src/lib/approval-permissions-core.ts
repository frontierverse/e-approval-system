export type ApprovalPermissionRole = "USER" | "ADMIN";

export type ReadableDocumentShape = {
  drafterId: string;
  status?: string;
  approvalSteps: {
    approverId: string;
  }[];
};

export function canReadApprovalDocument(
  userId: string,
  role: ApprovalPermissionRole,
  document: ReadableDocumentShape,
) {
  if (role === "ADMIN" || document.drafterId === userId) {
    return true;
  }

  if (isPrivateDraftStatus(document.status)) {
    return false;
  }

  return document.approvalSteps.some((step) => step.approverId === userId);
}

export function getReadableDocumentWhere(
  userId: string,
  role: ApprovalPermissionRole,
) {
  if (role === "ADMIN") {
    return {};
  }

  return {
    OR: [
      {
        drafterId: userId,
      },
      {
        AND: [
          {
            status: {
              notIn: ["DRAFT", "RECALLED"],
            },
          },
          {
            approvalSteps: {
              some: {
                approverId: userId,
              },
            },
          },
        ],
      },
    ],
  };
}

function isPrivateDraftStatus(status: string | undefined) {
  return status === "DRAFT" || status === "RECALLED";
}
