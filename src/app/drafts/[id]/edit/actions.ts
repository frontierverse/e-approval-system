"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserStatus } from "@/generated/prisma/client";
import { updateDraftDocument } from "@/lib/approval-mutations";
import { getApprovalLinePolicyError } from "@/lib/approval-line-policy";
import { getAttachmentPolicy } from "@/lib/attachment-policy";
import {
  persistAttachmentFiles,
  prepareAttachmentFiles,
  removeStoredAttachmentFiles,
} from "@/lib/attachment-storage";
import { requireUser } from "@/lib/auth";
import {
  getDraftFormIntent,
  getDraftFormValues,
  hasDraftFormErrors,
  type DraftFormState,
  validateDraftFormValues,
} from "@/lib/draft-form-state";
import {
  attachGeneratedApprovalPdfToDocument,
  getGeneratedApprovalPdfStorageError,
} from "@/lib/generated-approval-pdf";
import { prisma } from "@/lib/prisma";

export async function updateDraftAction(
  documentId: string,
  _state: DraftFormState,
  formData: FormData,
): Promise<DraftFormState> {
  const intent = getDraftFormIntent(formData);
  const submittedApproverIds = formData
    .getAll("approverIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const values = getDraftFormValues(formData);
  const user = await requireUser();
  const attachmentPolicy = await getAttachmentPolicy();
  const [existingDocument, attachmentResult] = await Promise.all([
    prisma.approvalDocument.findFirst({
      where: {
        id: documentId,
        drafterId: user.id,
      },
      select: {
        _count: {
          select: {
            attachments: true,
          },
        },
      },
    }),
    prepareAttachmentFiles(formData.getAll("attachments"), attachmentPolicy),
  ]);
  const totalAttachmentCount =
    (existingDocument?._count.attachments ?? 0) + attachmentResult.files.length;
  const attachmentError =
    attachmentResult.error ??
    (totalAttachmentCount > attachmentPolicy.maxFileCount
      ? `첨부파일은 최대 ${attachmentPolicy.maxFileCount}개까지 등록할 수 있습니다.`
      : undefined);
  const generatedPdfStorageError =
    intent === "submit" ? getGeneratedApprovalPdfStorageError() : null;
  const errors = validateDraftFormValues(values, {
    currentUserId: user.id,
    submittedApproverIds,
    attachmentError: attachmentError ?? generatedPdfStorageError ?? undefined,
  });

  if (!existingDocument) {
    errors.form = "수정할 수 있는 임시저장 문서를 찾을 수 없습니다.";
  }

  if (hasDraftFormErrors(errors)) {
    return { values, errors };
  }

  const template = await prisma.documentTemplate.findFirst({
    where: {
      id: values.templateId,
      isActive: true,
    },
  });

  if (!template) {
    return {
      values,
      errors: {
        templateId: "사용 가능한 문서 양식이 아닙니다.",
      },
    };
  }

  const approvers = await prisma.user.findMany({
    where: {
      id: {
        in: values.approverIds,
      },
      status: UserStatus.ACTIVE,
    },
    select: {
      id: true,
      name: true,
      position: {
        select: {
          name: true,
          level: true,
        },
      },
    },
  });

  if (approvers.length !== values.approverIds.length) {
    return {
      values,
      errors: {
        approvers: "사용 가능한 결재자만 지정할 수 있습니다.",
      },
    };
  }

  const approverById = new Map(
    approvers.map((approver) => [approver.id, approver]),
  );
  const orderedApprovers = values.approverIds
    .map((approverId) => approverById.get(approverId))
    .filter(isApprover);
  const approvalLineError = getApprovalLinePolicyError(
    orderedApprovers.map((approver) => ({
      name: approver.name,
      positionName: approver.position.name,
      positionLevel: approver.position.level,
    })),
  );

  if (approvalLineError) {
    return {
      values,
      errors: {
        approvers: approvalLineError,
      },
    };
  }

  const attachments = attachmentResult.files.map((file) => ({
    originalName: file.originalName,
    storageProvider: file.storageProvider,
    storageKey: file.storageKey,
    mimeType: file.mimeType,
    size: file.size,
  }));
  let updatedDocumentId = documentId;

  try {
    await persistAttachmentFiles(attachmentResult.files);

    const result = await updateDraftDocument({
      documentId,
      actorId: user.id,
      title: values.title,
      category: values.category,
      content: values.content,
      templateId: values.templateId,
      approvers: orderedApprovers,
      attachments,
      submitImmediately: intent === "submit",
    });

    if (!result.ok) {
      await removePreparedAttachments(attachmentResult.files);

      return {
        values,
        errors: {
          form: result.message,
        },
      };
    }

    updatedDocumentId = result.documentId;

    if (intent === "submit") {
      await attachGeneratedApprovalPdfToDocument(
        updatedDocumentId,
        user.id,
      ).catch((error) => {
        console.error("Failed to attach generated approval PDF", error);
      });
    }
  } catch {
    await removePreparedAttachments(attachmentResult.files);

    return {
      values,
      errors: {
        form: "임시저장 문서 수정 중 문제가 발생했습니다. 다시 시도하세요.",
      },
    };
  }

  revalidatePath("/");
  revalidatePath("/drafts");
  revalidatePath("/inbox");
  revalidatePath("/sent");
  revalidatePath(`/documents/${updatedDocumentId}`);
  redirect(`/documents/${updatedDocumentId}`);
}

function isApprover(
  approver:
    | {
        id: string;
        name: string;
        position: {
          name: string;
          level: number;
        };
      }
    | undefined,
): approver is {
  id: string;
  name: string;
  position: {
    name: string;
    level: number;
  };
} {
  return Boolean(approver);
}

async function removePreparedAttachments(
  files: Awaited<ReturnType<typeof prepareAttachmentFiles>>["files"],
) {
  await removeStoredAttachmentFiles(
    files.map((file) => ({
      storageProvider: file.storageProvider,
      storageKey: file.storageKey,
    })),
  );
}
