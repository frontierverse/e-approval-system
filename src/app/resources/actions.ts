"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditAction } from "@/generated/prisma/client";
import { getAttachmentPolicy } from "@/lib/attachment-policy";
import {
  persistAttachmentFiles,
  prepareAttachmentFiles,
  removeStoredAttachmentFiles,
} from "@/lib/attachment-storage";
import type { AttachmentStorageProvider } from "@/lib/attachment-storage-core";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getResourceFormValues,
  hasResourceFormErrors,
  type ResourceFormState,
  validateResourceFormValues,
} from "@/lib/resource-form-state";
import { canManageResourcePost } from "@/lib/resource-library";

export async function createResourceAction(
  _state: ResourceFormState,
  formData: FormData,
): Promise<ResourceFormState> {
  const values = getResourceFormValues(formData);
  const user = await requireUser();
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
      {
        storageKeyPrefix: "resources/",
      },
    );
  }
  const errors = validateResourceFormValues(values, {
    attachmentError: attachmentResult.error ?? undefined,
  });

  if (hasResourceFormErrors(errors)) {
    return { values, errors };
  }

  try {
    if (!isClientUploaded) {
      await persistAttachmentFiles(attachmentResult.files);
    }

    await prisma.$transaction(async (tx) => {
      const resource = await tx.resourcePost.create({
        data: {
          title: values.title,
          summary: values.summary,
          category: values.category,
          authorId: user.id,
          attachments: {
            create: attachmentResult.files.map((file) => ({
              originalName: file.originalName,
              storageProvider: file.storageProvider,
              storageKey: file.storageKey,
              mimeType: file.mimeType,
              size: file.size,
              uploaderId: user.id,
            })),
          },
        },
        select: {
          id: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.CREATE_RESOURCE,
          actorId: user.id,
          targetType: "ResourcePost",
          targetId: resource.id,
          message: `${user.name}님이 "${values.title}" 자료를 업로드했습니다.`,
        },
      });
    });
  } catch {
    await removePreparedAttachments(attachmentResult.files);

    return {
      values,
      errors: {
        form: "자료 업로드 중 문제가 발생했습니다. 다시 시도하세요.",
      },
    };
  }

  revalidatePath("/resources");
  redirect(getResourceCategoryHref(values.category));
}

export async function updateResourceAction(
  resourceId: string,
  _state: ResourceFormState,
  formData: FormData,
): Promise<ResourceFormState> {
  const values = getResourceFormValues(formData);
  const user = await requireUser();
  const attachmentPolicy = await getAttachmentPolicy();
  const existingResource = await prisma.resourcePost.findUnique({
    where: {
      id: resourceId,
    },
    include: {
      attachments: true,
    },
  });

  if (
    !existingResource ||
    !canManageResourcePost(user.id, user.role, existingResource.authorId)
  ) {
    return {
      values,
      errors: {
        form: "수정할 수 있는 자료를 찾을 수 없습니다.",
      },
    };
  }

  const requestedRemoveIds = new Set(
    formData
      .getAll("removeAttachmentIds")
      .map((value) => String(value).trim())
      .filter(Boolean),
  );
  const removableAttachments = existingResource.attachments.filter((attachment) =>
    requestedRemoveIds.has(attachment.id),
  );
  const retainedAttachmentCount =
    existingResource.attachments.length - removableAttachments.length;
  const uploadedAttachmentsJson = formData.get("uploadedAttachmentsJson");
  const isClientUploaded = Boolean(uploadedAttachmentsJson);
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
      {
        storageKeyPrefix: "resources/",
      },
    );
  }
  const totalAttachmentCount =
    retainedAttachmentCount + attachmentResult.files.length;
  const attachmentError =
    (attachmentResult.error ?? undefined) ??
    (totalAttachmentCount > attachmentPolicy.maxFileCount
      ? `첨부파일은 최대 ${attachmentPolicy.maxFileCount}개까지 등록할 수 있습니다.`
      : undefined);
  const errors = validateResourceFormValues(values, {
    attachmentError,
  });

  if (hasResourceFormErrors(errors)) {
    return { values, errors };
  }

  try {
    if (!isClientUploaded) {
      await persistAttachmentFiles(attachmentResult.files);
    }

    await prisma.$transaction(async (tx) => {
      await tx.resourcePost.update({
        where: {
          id: resourceId,
        },
        data: {
          title: values.title,
          summary: values.summary,
          category: values.category,
          attachments: {
            deleteMany:
              removableAttachments.length > 0
                ? {
                    id: {
                      in: removableAttachments.map((attachment) => attachment.id),
                    },
                  }
                : undefined,
            create: attachmentResult.files.map((file) => ({
              originalName: file.originalName,
              storageProvider: file.storageProvider,
              storageKey: file.storageKey,
              mimeType: file.mimeType,
              size: file.size,
              uploaderId: user.id,
            })),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.UPDATE_RESOURCE,
          actorId: user.id,
          targetType: "ResourcePost",
          targetId: resourceId,
          message: `${user.name}님이 "${values.title}" 자료를 수정했습니다.`,
        },
      });
    });
  } catch {
    await removePreparedAttachments(attachmentResult.files);

    return {
      values,
      errors: {
        form: "자료 수정 중 문제가 발생했습니다. 다시 시도하세요.",
      },
    };
  }

  await removeStoredAttachmentFiles(
    removableAttachments.map((attachment) => ({
      storageProvider: attachment.storageProvider,
      storageKey: attachment.storageKey,
    })),
  );

  revalidatePath("/resources");
  redirect(getResourceCategoryHref(values.category));
}

export async function deleteResourceAction(formData: FormData) {
  const resourceId = String(formData.get("resourceId") ?? "").trim();
  const user = await requireUser();
  const resource = await prisma.resourcePost.findUnique({
    where: {
      id: resourceId,
    },
    include: {
      attachments: true,
    },
  });

  if (!resource || !canManageResourcePost(user.id, user.role, resource.authorId)) {
    redirect("/resources");
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        action: AuditAction.DELETE_RESOURCE,
        actorId: user.id,
        targetType: "ResourcePost",
        targetId: resource.id,
        message: `${user.name}님이 "${resource.title}" 자료를 삭제했습니다.`,
      },
    });

    await tx.resourcePost.delete({
      where: {
        id: resource.id,
      },
    });
  });

  await removeStoredAttachmentFiles(
    resource.attachments.map((attachment) => ({
      storageProvider: attachment.storageProvider,
      storageKey: attachment.storageKey,
    })),
  );

  revalidatePath("/resources");
  redirect(getResourceCategoryHref(resource.category));
}

function getResourceCategoryHref(category: string) {
  return `/resources?category=${encodeURIComponent(category)}`;
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
