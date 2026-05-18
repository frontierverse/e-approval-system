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
  recallSubmittedDocument,
  rejectCurrentApprovalStep,
  submitDraftDocument,
} from "@/lib/approval-mutations";
import { removeStoredAttachmentFiles } from "@/lib/attachment-storage";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type ApprovalDecisionState = {
  error?: string;
  values?: {
    comment: string;
  };
};

export async function submitDocumentAction(documentId: string) {
  const user = await requireUser();
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
