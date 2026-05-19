"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ApprovalStepStatus,
  AuditAction,
  DocumentStatus,
  UserRole,
} from "@/generated/prisma/client";
import {
  approveCurrentApprovalStep,
  deleteDraftDocument,
  proxyApproveApprovalStepsThrough,
  recallSubmittedDocument,
  rejectCurrentApprovalStep,
  rejectProxyApprovedStep,
  submitDraftDocument,
} from "@/lib/approval-mutations";
import {
  defaultAttachmentPolicy,
  persistAttachmentFiles,
  prepareAttachmentFiles,
  removeStoredAttachmentFiles,
} from "@/lib/attachment-storage";
import { requireUser } from "@/lib/auth";
import {
  attachGeneratedApprovalPdfToDocument,
  attachStampedApprovalPdfToDocument,
  getGeneratedApprovalPdfStorageError,
} from "@/lib/generated-approval-pdf";
import { prisma } from "@/lib/prisma";

export type ApprovalDecisionState = {
  error?: string;
  values?: {
    comment: string;
  };
};

export async function submitDocumentAction(documentId: string) {
  const user = await requireUser();
  const generatedPdfStorageError = getGeneratedApprovalPdfStorageError();

  if (generatedPdfStorageError) {
    redirect(
      `/documents/${documentId}?submitError=${encodeURIComponent(generatedPdfStorageError)}`,
    );
  }

  const result = await submitDraftDocument(documentId, user.id);

  revalidatePath("/");
  revalidatePath("/drafts");
  revalidatePath("/inbox");
  revalidatePath("/sent");
  revalidatePath(`/documents/${documentId}`);

  if (!result.ok) {
    redirect(
      `/documents/${documentId}?submitError=${encodeURIComponent(result.message)}`,
    );
  }

  await attachGeneratedApprovalPdfToDocument(result.documentId, user.id).catch(
    (error) => {
      console.error("Failed to attach generated approval PDF", error);
    },
  );
  revalidatePath(`/documents/${result.documentId}`);

  redirect(`/documents/${result.documentId}`);
}

export async function deleteDraftDocumentAction(documentId: string) {
  const user = await requireUser();
  const result = await deleteDraftDocument(documentId, user.id);

  revalidatePath("/");
  revalidatePath("/drafts");
  revalidatePath("/sent");
  revalidatePath(`/documents/${documentId}`);

  if (!result.ok) {
    redirect(
      `/documents/${documentId}?actionError=${encodeURIComponent(result.message)}`,
    );
  }

  redirect("/drafts");
}

export async function uploadSignedAttachmentAction(
  documentId: string,
  attachmentId: string,
  formData: FormData,
) {
  const user = await requireUser();
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      documentId,
      signedSourceAttachmentId: null,
    },
    select: {
      id: true,
      originalName: true,
      document: {
        select: {
          id: true,
          status: true,
          approvalSteps: {
            select: {
              approverId: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!attachment) {
    redirectWithDocumentError(documentId, "첨부파일을 찾을 수 없습니다.");
  }

  const isActiveDocument =
    attachment.document.status === DocumentStatus.SUBMITTED ||
    attachment.document.status === DocumentStatus.IN_PROGRESS;
  const isCurrentApprover = attachment.document.approvalSteps.some(
    (step) =>
      step.approverId === user.id && step.status === ApprovalStepStatus.PENDING,
  );

  if (!isCurrentApprover || !isActiveDocument) {
    redirectWithDocumentError(
      documentId,
      "현재 결재 차례에서만 서명본을 업로드할 수 있습니다.",
    );
  }

  const preparedResult = await prepareAttachmentFiles(
    [formData.get("signedAttachment") ?? ""],
    {
      ...defaultAttachmentPolicy,
      maxFileCount: 1,
    },
  );

  if (preparedResult.error || preparedResult.files.length !== 1) {
    redirectWithDocumentError(
      documentId,
      preparedResult.error ?? "업로드할 서명본 파일을 선택하세요.",
    );
  }

  const preparedSignedFile = preparedResult.files[0]!;

  try {
    await persistAttachmentFiles([preparedSignedFile]);
    const createdAttachment = await prisma.$transaction(async (tx) => {
      const signedAttachment = await tx.attachment.create({
        data: {
          documentId: attachment.document.id,
          uploaderId: user.id,
          signedSourceAttachmentId: attachment.id,
          signedById: user.id,
          signedAt: new Date(),
          originalName: preparedSignedFile.originalName,
          storageProvider: preparedSignedFile.storageProvider,
          storageKey: preparedSignedFile.storageKey,
          mimeType: preparedSignedFile.mimeType,
          size: preparedSignedFile.size,
        },
        select: {
          id: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: AuditAction.UPDATE_DRAFT,
          targetType: "Attachment",
          targetId: signedAttachment.id,
          documentId: attachment.document.id,
          message: `"${attachment.originalName}" 첨부파일의 서명본을 업로드했습니다.`,
          metadata: {
            sourceAttachmentId: attachment.id,
            signedAttachmentId: signedAttachment.id,
          },
        },
      });

      return signedAttachment;
    });

    revalidatePath("/");
    revalidatePath("/inbox");
    revalidatePath("/sent");
    revalidatePath(`/documents/${documentId}`);
    redirect(`/documents/${documentId}#signed-${createdAttachment.id}`);
  } catch (error) {
    await removeStoredAttachmentFiles([preparedSignedFile]).catch(
      () => undefined,
    );
    redirectWithDocumentError(
      documentId,
      getSignedUploadErrorMessage(error),
    );
  }
}

export async function recallDocumentAction(documentId: string) {
  const user = await requireUser();
  const result = await recallSubmittedDocument(documentId, user.id);

  revalidatePath("/");
  revalidatePath("/drafts");
  revalidatePath("/inbox");
  revalidatePath("/sent");
  revalidatePath(`/documents/${documentId}`);

  if (!result.ok) {
    redirect(
      `/documents/${documentId}?actionError=${encodeURIComponent(result.message)}`,
    );
  }

  redirect(`/documents/${result.documentId}`);
}

export async function decideDocumentAction(
  documentId: string,
  _state: ApprovalDecisionState,
  formData: FormData,
): Promise<ApprovalDecisionState> {
  const user = await requireUser();
  const decision = formData.get("decision");
  const comment = String(formData.get("comment") ?? "").trim();

  if (decision !== "approve" && decision !== "reject") {
    return {
      error: "처리할 결재 액션을 선택하세요.",
      values: {
        comment,
      },
    };
  }

  if (decision === "reject" && comment.length < 2) {
    return {
      error: "반려할 때는 사유를 2자 이상 입력하세요.",
      values: {
        comment,
      },
    };
  }

  const result =
    decision === "approve"
      ? await approveCurrentApprovalStep(documentId, user.id, comment)
      : await rejectCurrentApprovalStep(documentId, user.id, comment);

  if (!result.ok) {
    return {
      error: result.message,
      values: {
        comment,
      },
    };
  }

  if (decision === "approve") {
    await attachStampedApprovalPdfToDocument(
      result.documentId,
      user.id,
    ).catch((error) => {
      console.error("Failed to attach stamped approval PDF", error);
    });
  }

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/sent");
  revalidatePath("/completed");
  revalidatePath(`/documents/${documentId}`);
  redirect(`/documents/${result.documentId}`);
}

export async function proxyApproveDocumentAction(
  documentId: string,
  targetStepId: string,
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const comment = String(formData.get("comment") ?? "").trim();

  const result = await proxyApproveApprovalStepsThrough(
    documentId,
    user.id,
    targetStepId,
    comment,
  );

  if (!result.ok) {
    redirect(
      `/documents/${documentId}?actionError=${encodeURIComponent(
        result.message,
      )}`,
    );
  }

  await attachStampedApprovalPdfToDocument(
    result.documentId,
    user.id,
  ).catch((error) => {
    console.error("Failed to attach stamped approval PDF", error);
  });

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/sent");
  revalidatePath("/completed");
  revalidatePath(`/documents/${documentId}`);
  redirect(`/documents/${result.documentId}`);
}

export async function rejectProxyApprovalAction(
  documentId: string,
  stepId: string,
  formData: FormData,
) {
  const user = await requireUser();
  const comment = String(formData.get("comment") ?? "").trim();

  if (comment.length < 2) {
    redirect(
      `/documents/${documentId}?actionError=${encodeURIComponent(
        "대리결재를 반려할 때는 사유를 2자 이상 입력하세요.",
      )}`,
    );
  }

  const result = await rejectProxyApprovedStep(
    documentId,
    stepId,
    user.id,
    comment,
  );

  if (!result.ok) {
    redirect(
      `/documents/${documentId}?actionError=${encodeURIComponent(
        result.message,
      )}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/sent");
  revalidatePath("/completed");
  revalidatePath(`/documents/${documentId}`);
  redirect(`/documents/${result.documentId}`);
}

export async function deleteSignedAttachmentAction(
  documentId: string,
  attachmentId: string,
) {
  const user = await requireUser();
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      documentId,
      signedSourceAttachmentId: {
        not: null,
      },
    },
    select: {
      id: true,
      originalName: true,
      storageProvider: true,
      storageKey: true,
      signedById: true,
      document: {
        select: {
          id: true,
          status: true,
          approvalSteps: {
            select: {
              approverId: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!attachment) {
    redirect(
      `/documents/${documentId}?actionError=${encodeURIComponent("서명본 첨부파일을 찾을 수 없습니다.")}`,
    );
  }

  const isActiveDocument =
    attachment.document.status === DocumentStatus.SUBMITTED ||
    attachment.document.status === DocumentStatus.IN_PROGRESS;
  const isCurrentApprover = attachment.document.approvalSteps.some(
    (step) =>
      step.approverId === user.id && step.status === ApprovalStepStatus.PENDING,
  );
  const canDeleteSignedAttachment =
    user.role === UserRole.ADMIN ||
    (attachment.signedById === user.id && isActiveDocument && isCurrentApprover);

  if (!canDeleteSignedAttachment) {
    redirect(
      `/documents/${documentId}?actionError=${encodeURIComponent("현재 결재 차례에서 본인이 만든 서명본만 삭제할 수 있습니다.")}`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: AuditAction.UPDATE_DRAFT,
        targetType: "Attachment",
        targetId: attachment.id,
        documentId: attachment.document.id,
        message: `"${attachment.originalName}" 서명본을 삭제했습니다.`,
      },
    });

    await tx.attachment.delete({
      where: {
        id: attachment.id,
      },
    });
  });

  await removeStoredAttachmentFiles([
    {
      storageProvider: attachment.storageProvider,
      storageKey: attachment.storageKey,
    },
  ]).catch(() => undefined);

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/sent");
  revalidatePath(`/documents/${documentId}`);
  redirect(`/documents/${documentId}`);
}

function redirectWithDocumentError(documentId: string, message: string): never {
  redirect(
    `/documents/${documentId}?actionError=${encodeURIComponent(message)}`,
  );
}

function getSignedUploadErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "서명본 업로드에 실패했습니다.";
}
