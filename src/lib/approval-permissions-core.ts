export type ApprovalPermissionRole = "USER" | "ADMIN";

export type ReadableDocumentShape = {
  drafterId: string;
  approvalSteps: {
    approverId: string;
  }[];
};

export function canReadApprovalDocument(
  userId: string,
  role: ApprovalPermissionRole,
  document: ReadableDocumentShape,
) {
  return (
    role === "ADMIN" ||
    document.drafterId === userId ||
    document.approvalSteps.some((step) => step.approverId === userId)
  );
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
        approvalSteps: {
          some: {
            approverId: userId,
          },
        },
      },
    ],
  };
}
