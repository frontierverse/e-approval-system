"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserStatus } from "@/generated/prisma/client";
import { createApprovalDocument } from "@/lib/approval-mutations";
import { getApprovalLinePolicyError } from "@/lib/approval-line-policy";
import { getAttachmentPolicy } from "@/lib/attachment-policy";
import {
  persistAttachmentFiles,
  prepareAttachmentFiles,
  removeStoredAttachmentFiles,
} from "@/lib/attachment-storage";
import type { AttachmentStorageProvider } from "@/lib/attachment-storage-core";
import { getCurrentUser } from "@/lib/auth";
import {
  compileDocumentTemplateContentFromSchema,
  validateDocumentTemplateContentValues,
} from "@/lib/draft-template-content";
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

export async function createDraftAction(
  _state: DraftFormState,
  formData: FormData,
): Promise<DraftFormState> {
  const intent = getDraftFormIntent(formData);
  const submittedApproverIds = formData
    .getAll("approverIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const values = getDraftFormValues(formData);
  const user = await getCurrentUser();

  if (!user) {
    return {
      values,
      errors: {
        form: "로그인 정보가 만료되었습니다. 다시 로그인한 뒤 기안을 저장하세요.",
      },
    };
  }

  const uploadedAttachmentsJson = formData.get("uploadedAttachmentsJson");
  const isClientUploaded = Boolean(uploadedAttachmentsJson);
  const attachmentPolicy = await getAttachmentPolicy();
  let attachmentResult: {
    files: Array<{
      originalName: string;
      storageProvider: AttachmentStorageProvider;
      storageKey: string;
      mimeType: string;
      size: number;
      buffer: Buffer;
    }>;
    error?: string | null;
  };
  if (uploadedAttachmentsJson) {
    const uploadedFiles = JSON.parse(String(uploadedAttachmentsJson)) as Array<{
      originalName: string;
      storageProvider: string;
      storageKey: string;
      mimeType: string;
      size: number;
    }>;
    attachmentResult = {
      files: uploadedFiles.map((file) => ({
        originalName: file.originalName,
        storageProvider: file.storageProvider as AttachmentStorageProvider,
        storageKey: file.storageKey,
        mimeType: file.mimeType,
        size: file.size,
        buffer: Buffer.alloc(0),
      })),
      error: null,
    };
  } else {
    attachmentResult = await prepareAttachmentFiles(
      formData.getAll("attachments"),
      attachmentPolicy,
    );
  }
  const template = await prisma.documentTemplate.findFirst({
    where: {
      id: values.templateId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      schema: true,
    },
  });
  const contentValues = template
    ? {
        ...values,
        content: compileDocumentTemplateContentFromSchema(
          template.schema,
          values.templateFieldValues,
          values.content,
        ),
      }
    : values;
  const generatedPdfStorageError =
    intent === "submit" ? getGeneratedApprovalPdfStorageError() : null;
  const errors = validateDraftFormValues(contentValues, {
    currentUserId: user.id,
    submittedApproverIds,
    attachmentError:
      attachmentResult.error ?? generatedPdfStorageError ?? undefined,
  });

  if (!template) {
    errors.templateId = "사용 가능한 문서 양식이 아닙니다.";
  } else {
    const templateErrors = validateDocumentTemplateContentValues(
      template.schema,
      values.templateFieldValues,
    );

    if (templateErrors.length > 0) {
      errors.content = templateErrors[0];
    }
  }

  if (hasDraftFormErrors(errors)) {
    return { values: contentValues, errors };
  }

  if (!template) {
    return {
      values: contentValues,
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
  let createdDocumentId = "";

  try {
    if (!isClientUploaded) {
      await persistAttachmentFiles(attachmentResult.files);
    }

    const document = await createApprovalDocument({
      drafterId: user.id,
      title: contentValues.title,
      category: template.name,
      content: contentValues.content,
      templateId: contentValues.templateId,
      approvers: orderedApprovers,
      attachments,
      submitImmediately: intent === "submit",
    });

    createdDocumentId = document.id;

    if (intent === "submit") {
      await attachGeneratedApprovalPdfToDocument(
        createdDocumentId,
        user.id,
      ).catch((error) => {
        console.error("Failed to attach generated approval PDF", error);
      });
    }
  } catch {
    await removeStoredAttachmentFiles(
      attachmentResult.files.map((file) => ({
        storageProvider: file.storageProvider,
        storageKey: file.storageKey,
      })),
    );

    return {
      values,
      errors: {
        form: "첨부파일 저장 중 문제가 발생했습니다. 다시 시도하세요.",
      },
    };
  }

  revalidatePath("/");
  revalidatePath("/drafts");
  revalidatePath("/inbox");
  revalidatePath("/sent");
  redirect(`/documents/${createdDocumentId}`);
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
