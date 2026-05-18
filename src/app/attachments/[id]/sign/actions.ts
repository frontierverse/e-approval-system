"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AuditAction,
  ApprovalStepStatus,
  DocumentStatus,
} from "@/generated/prisma/client";
import { isSignableAttachmentFile } from "@/lib/attachment-preview";
import {
  persistAttachmentFiles,
  prepareAttachmentFiles,
  readStoredAttachmentFile,
  removeStoredAttachmentFiles,
  type PreparedAttachmentFile,
} from "@/lib/attachment-storage";
import {
  createSignedAttachmentFile,
  parseSignaturePlacements,
} from "@/lib/attachment-signature-core";
import { getReadableDocumentWhere } from "@/lib/approval-permissions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type CreateSignedAttachmentState = {
  error?: string;
};

export async function createSignedAttachmentAction(
  attachmentId: string,
  _state: CreateSignedAttachmentState,
  formData: FormData,
): Promise<CreateSignedAttachmentState> {
  const user = await requireUser();
  const placementsResult = parseSignaturePlacements(formData);

  if (!placementsResult.ok) {
    return {
      error: placementsResult.message,
    };
  }

  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      signedSourceAttachmentId: null,
      document: getReadableDocumentWhere(user.id, user.role),
    },
    select: {
      id: true,
      originalName: true,
      storageProvider: true,
      storageKey: true,
      mimeType: true,
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
    return {
      error: "첨부파일을 찾을 수 없습니다.",
    };
  }

  if (!isSignableAttachmentFile(attachment.originalName, attachment.mimeType)) {
    return {
      error: "도장 찍기를 지원하지 않는 첨부파일입니다.",
    };
  }

  if (!user.signatureImageStorageProvider || !user.signatureImageStorageKey) {
    return {
      error: "등록된 도장/서명 이미지가 없습니다.",
    };
  }

  const isCurrentApprover = attachment.document.approvalSteps.some(
    (step) =>
      step.approverId === user.id && step.status === ApprovalStepStatus.PENDING,
  );
  const isActiveDocument =
    attachment.document.status === DocumentStatus.SUBMITTED ||
    attachment.document.status === DocumentStatus.IN_PROGRESS;

  if (!isCurrentApprover || !isActiveDocument) {
    return {
      error: "현재 결재 차례에서만 도장을 찍을 수 있습니다.",
    };
  }

  let preparedSignedFile: PreparedAttachmentFile;

  try {
    const [sourceFile, signatureFile] = await Promise.all([
      readStoredAttachmentFile({
        storageProvider: attachment.storageProvider,
        storageKey: attachment.storageKey,
      }),
      readStoredAttachmentFile({
        storageProvider: user.signatureImageStorageProvider,
        storageKey: user.signatureImageStorageKey,
      }),
    ]);
    const signedFile = await createSignedAttachmentFile({
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sourceBuffer: await readableStreamToBuffer(sourceFile.body),
      signatureBuffer: await readableStreamToBuffer(signatureFile.body),
      placements: placementsResult.placements,
    });
    const generatedFile = new File(
      [new Uint8Array(signedFile.buffer)],
      signedFile.originalName,
      { type: signedFile.mimeType },
    );
    const preparedResult = await prepareAttachmentFiles([generatedFile]);

    if (preparedResult.error || preparedResult.files.length !== 1) {
      return {
        error:
          preparedResult.error ??
          "서명본 파일을 저장할 준비를 하지 못했습니다.",
      };
    }

    preparedSignedFile = preparedResult.files[0]!;
    await persistAttachmentFiles([preparedSignedFile]);
  } catch (error) {
    return {
      error: getSigningErrorMessage(error),
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const createdAttachment = await tx.attachment.create({
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
          targetId: createdAttachment.id,
          documentId: attachment.document.id,
          message: "첨부파일 서명본을 생성했습니다.",
          metadata: {
            sourceAttachmentId: attachment.id,
            signedAttachmentId: createdAttachment.id,
            placements: placementsResult.placements,
          },
        },
      });
    });
  } catch (error) {
    await removeStoredAttachmentFiles([preparedSignedFile]);

    return {
      error: getSigningErrorMessage(error),
    };
  }

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/sent");
  revalidatePath(`/documents/${attachment.document.id}`);
  revalidatePath(`/attachments/${attachment.id}/sign`);
  redirect(`/documents/${attachment.document.id}`);
}

async function readableStreamToBuffer(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(value);
    totalLength += value.byteLength;
  }

  return Buffer.concat(chunks, totalLength);
}

function getSigningErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "서명본을 생성하지 못했습니다.";
}
