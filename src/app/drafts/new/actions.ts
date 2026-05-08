"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserStatus } from "@/generated/prisma/client";
import { createApprovalDocument } from "@/lib/approval-mutations";
import { getAttachmentPolicy } from "@/lib/attachment-policy";
import {
  persistAttachmentFiles,
  prepareAttachmentFiles,
  removeStoredAttachmentFiles,
} from "@/lib/attachment-storage";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type DraftFormState = {
  values?: DraftFormValues;
  errors?: {
    title?: string;
    category?: string;
    templateId?: string;
    content?: string;
    approvers?: string;
    form?: string;
  };
};

type DraftFormValues = {
  title: string;
  category: string;
  templateId: string;
  content: string;
  approverIds: string[];
};

export async function createDraftAction(
  _state: DraftFormState,
  formData: FormData,
): Promise<DraftFormState> {
  const intent = formData.get("intent") === "submit" ? "submit" : "draft";
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || "일반";
  const templateId = String(formData.get("templateId") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const approverIds = formData
    .getAll("approverIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const uniqueApproverIds = Array.from(new Set(approverIds));
  const values: DraftFormValues = {
    title,
    category,
    templateId,
    content,
    approverIds: uniqueApproverIds,
  };
  const user = await getCurrentUser();

  if (!user) {
    return {
      values,
      errors: {
        form: "로그인 정보가 만료되었습니다. 다시 로그인한 뒤 기안을 저장하세요.",
      },
    };
  }

  const attachmentPolicy = await getAttachmentPolicy();
  const attachmentResult = await prepareAttachmentFiles(
    formData.getAll("attachments"),
    attachmentPolicy,
  );
  const errors: NonNullable<DraftFormState["errors"]> = {};

  if (title.length < 2) {
    errors.title = "제목은 2자 이상 입력하세요.";
  }

  if (title.length > 120) {
    errors.title = "제목은 120자 이내로 입력하세요.";
  }

  if (category.length > 40) {
    errors.category = "문서 분류는 40자 이내로 입력하세요.";
  }

  if (!templateId) {
    errors.templateId = "문서 양식을 선택하세요.";
  }

  if (content.length < 10) {
    errors.content = "기안 내용은 10자 이상 입력하세요.";
  }

  if (content.length > 5000) {
    errors.content = "기안 내용은 5000자 이내로 입력하세요.";
  }

  if (approverIds.length === 0) {
    errors.approvers = "결재자를 1명 이상 지정하세요.";
  }

  if (uniqueApproverIds.length !== approverIds.length) {
    errors.approvers = "같은 결재자는 한 번만 지정할 수 있습니다.";
  }

  if (uniqueApproverIds.includes(user.id)) {
    errors.approvers = "작성자 본인은 결재자로 지정할 수 없습니다.";
  }

  if (attachmentResult.error) {
    errors.form = attachmentResult.error;
  }

  if (Object.keys(errors).length > 0) {
    return { values, errors };
  }

  const template = await prisma.documentTemplate.findFirst({
    where: {
      id: templateId,
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
        in: uniqueApproverIds,
      },
      status: UserStatus.ACTIVE,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (approvers.length !== uniqueApproverIds.length) {
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
  const orderedApprovers = uniqueApproverIds
    .map((approverId) => approverById.get(approverId))
    .filter(isApprover);
  const attachments = attachmentResult.files.map((file) => ({
    originalName: file.originalName,
    storageProvider: file.storageProvider,
    storageKey: file.storageKey,
    mimeType: file.mimeType,
    size: file.size,
  }));

  try {
    await persistAttachmentFiles(attachmentResult.files);

    const document = await createApprovalDocument({
      drafterId: user.id,
      title,
      category,
      content,
      templateId,
      approvers: orderedApprovers,
      attachments,
      submitImmediately: intent === "submit",
    });

    revalidatePath("/");
    revalidatePath("/inbox");
    revalidatePath("/sent");
    redirect(`/documents/${document.id}`);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

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
}

function isApprover(
  approver: { id: string; name: string } | undefined,
): approver is { id: string; name: string } {
  return Boolean(approver);
}

function isNextRedirectError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const digest =
    "digest" in error ? String((error as { digest?: unknown }).digest) : "";

  return error.message === "NEXT_REDIRECT" || digest.startsWith("NEXT_REDIRECT");
}
