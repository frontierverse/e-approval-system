export type ApprovalPermissionRole = "USER" | "ADMIN";

export type ReadableDocumentShape = {
  drafterId: string;
  status?: string;
  approvalSteps: {
    approverId: string;
  }[];
};

export type DocumentActionPolicyShape = {
  drafterId: string;
  status?: string | null;
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

export function canDeleteDraftDocumentByPolicy(
  userId: string,
  document: DocumentActionPolicyShape,
) {
  return (
    document.drafterId === userId &&
    normalizeDocumentStatus(document.status) === "DRAFT"
  );
}

export function canRecallDocumentByPolicy(
  userId: string,
  document: DocumentActionPolicyShape,
) {
  const status = normalizeDocumentStatus(document.status);

  return (
    document.drafterId === userId &&
    (status === "SUBMITTED" || status === "IN_PROGRESS")
  );
}

export function canManageDraftDocumentAttachmentsByPolicy(
  userId: string,
  document: DocumentActionPolicyShape,
) {
  const status = normalizeDocumentStatus(document.status);

  return (
    document.drafterId === userId &&
    (status === "DRAFT" || status === "RECALLED")
  );
}

export function canDeleteSignedAttachmentByPolicy({
  actorId,
  actorRole,
  document,
  isCurrentApprover,
  signedById,
}: {
  actorId: string;
  actorRole: ApprovalPermissionRole;
  document: DocumentActionPolicyShape;
  isCurrentApprover: boolean;
  signedById?: string | null;
}) {
  if (actorRole === "ADMIN") {
    return true;
  }

  if (canManageDraftDocumentAttachmentsByPolicy(actorId, document)) {
    return true;
  }

  const status = normalizeDocumentStatus(document.status);

  return (
    signedById === actorId &&
    isCurrentApprover &&
    (status === "SUBMITTED" || status === "IN_PROGRESS")
  );
}

function isPrivateDraftStatus(status: string | undefined) {
  return status === "DRAFT" || status === "RECALLED";
}

function normalizeDocumentStatus(status: string | null | undefined) {
  return status?.trim().toUpperCase();
}
