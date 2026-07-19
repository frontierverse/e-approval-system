import "server-only";

import {
  ApprovalStepStatus,
  AuditAction,
  DocumentStatus,
  NotificationType,
  Prisma,
  UserRole,
} from "@/generated/prisma/client";
import {
  getApprovalDecisionPlan,
  getProxyApprovalDecisionPlan,
} from "@/lib/approval-flow-core";
import {
  createApprovalApprovedAuditMessage,
  createApprovalRejectedAuditMessage,
  createProxyApprovedAuditMessage,
  createProxyRejectedAuditMessage,
} from "@/lib/approval-audit-messages";
import { createDraftUpdateAuditDetails } from "@/lib/draft-update-audit";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { getApprovalAuthorityLineError } from "@/lib/approval-authority";
import { getApprovalLinePolicyError } from "@/lib/approval-line-policy";
import {
  canDeleteDraftDocumentByPolicy,
  canManageDraftDocumentAttachmentsByPolicy,
  canRecallDocumentByPolicy,
} from "@/lib/approval-permissions-core";
import { removeStoredAttachmentFiles } from "@/lib/attachment-storage";
import { createDocumentNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { recordApprovedVacationLeaveDeduction } from "@/lib/staff-leave";

type OrderedApprover = {
  id: string;
  name: string;
};

type AttachmentInput = {
  originalName: string;
  storageProvider: string;
  storageKey: string;
  mimeType: string;
  size: number;
};

type CreateApprovalDocumentInput = {
  drafterId: string;
  title: string;
  category: string;
  content: string;
  templateId: string;
  approvers: OrderedApprover[];
  attachments?: AttachmentInput[];
  submitImmediately: boolean;
};

type UpdateDraftDocumentInput = {
  documentId: string;
  actorId: string;
  title: string;
  category: string;
  content: string;
  templateId: string;
  approvers: OrderedApprover[];
  attachments?: AttachmentInput[];
  removeAttachmentIds?: string[];
  submitImmediately: boolean;
};

type AttachmentRemovalRef = {
  id: string;
  originalName: string;
  storageProvider: string;
  storageKey: string;
};

type SubmitDraftResult =
  | {
      ok: true;
      documentId: string;
    }
  | {
      ok: false;
      message: string;
    };

type ApprovalDecisionResult = SubmitDraftResult;
type DraftMutationResult = SubmitDraftResult;

export async function createApprovalDocument({
  drafterId,
  title,
  category,
  content,
  templateId,
  approvers,
  attachments = [],
  submitImmediately,
}: CreateApprovalDocumentInput) {
  const now = new Date();
  const auditRequestData = await getCurrentAuditLogRequestData();

  return prisma.$transaction(async (tx) => {
    const documentNo = submitImmediately
      ? await getNextDocumentNo(tx, now)
      : undefined;
    const document = await tx.approvalDocument.create({
      data: {
        documentNo,
        title,
        category,
        content,
        status: submitImmediately
          ? DocumentStatus.SUBMITTED
          : DocumentStatus.DRAFT,
        submittedAt: submitImmediately ? now : undefined,
        templateId,
        drafterId,
        approvalSteps: {
          create: approvers.map((approver, index) => ({
            approverId: approver.id,
            order: index + 1,
            status:
              submitImmediately && index === 0
                ? ApprovalStepStatus.PENDING
              : ApprovalStepStatus.WAITING,
          })),
        },
        attachments:
          attachments.length > 0
            ? {
                create: attachments.map((attachment) => ({
                  originalName: attachment.originalName,
                  storageProvider: attachment.storageProvider,
                  storageKey: attachment.storageKey,
                  mimeType: attachment.mimeType,
                  size: attachment.size,
                  uploaderId: drafterId,
                })),
              }
            : undefined,
      },
      select: {
        id: true,
      },
    });
    const firstApprover = approvers[0];

    await tx.auditLog.create({
      data: {
        actorId: drafterId,
        ...auditRequestData,
        action: submitImmediately
          ? AuditAction.SUBMIT
          : AuditAction.CREATE_DRAFT,
        targetType: "ApprovalDocument",
        targetId: document.id,
        documentId: document.id,
        message: submitImmediately
          ? getSubmitMessage(approvers)
          : "문서를 임시저장했습니다.",
      },
    });

    if (submitImmediately && firstApprover) {
      const drafter = await tx.user.findUnique({
        where: {
          id: drafterId,
        },
        select: {
          name: true,
        },
      });

      await createDocumentNotification(tx, {
        userId: firstApprover.id,
        documentId: document.id,
        type: NotificationType.APPROVAL_REQUESTED,
        title: "결재 요청 도착",
        message: `${drafter?.name ?? "작성자"}님이 "${title}" 결재를 요청했습니다.`,
      });
    }

    return document;
  });
}

export async function submitDraftDocument(
  documentId: string,
  actorId: string,
): Promise<SubmitDraftResult> {
  const auditRequestData = await getCurrentAuditLogRequestData();

  return prisma.$transaction(async (tx) => {
    const document = await tx.approvalDocument.findUnique({
      where: {
        id: documentId,
      },
      select: {
        id: true,
        drafterId: true,
        title: true,
        documentNo: true,
        status: true,
        drafter: {
          select: {
            name: true,
          },
        },
        approvalSteps: {
          orderBy: {
            order: "asc",
          },
          select: {
            id: true,
            approver: {
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
            },
          },
        },
      },
    });

    if (!document) {
      return {
        ok: false,
        message: "문서를 찾을 수 없습니다.",
      };
    }

    if (document.drafterId !== actorId) {
      return {
        ok: false,
        message: "작성자만 문서를 결재 요청할 수 있습니다.",
      };
    }

    if (document.status !== DocumentStatus.DRAFT) {
      return {
        ok: false,
        message: "임시저장 상태의 문서만 결재 요청할 수 있습니다.",
      };
    }

    const firstStep = document.approvalSteps[0];

    if (!firstStep) {
      return {
        ok: false,
        message: "결재자를 1명 이상 지정해야 결재 요청할 수 있습니다.",
      };
    }

    const approvalLineError = getApprovalLinePolicyError(
      document.approvalSteps.map((step) => ({
        name: step.approver.name,
        positionName: step.approver.position.name,
        positionLevel: step.approver.position.level,
      })),
    );

    if (approvalLineError) {
      return {
        ok: false,
        message: approvalLineError,
      };
    }

    const approvalAuthorityError = getApprovalAuthorityLineError(
      document.approvalSteps.map((step) => ({
        positionName: step.approver.position.name,
      })),
    );

    if (approvalAuthorityError) {
      return {
        ok: false,
        message: approvalAuthorityError,
      };
    }

    const now = new Date();
    const documentNo = document.documentNo ?? (await getNextDocumentNo(tx, now));

    await tx.approvalDocument.update({
      where: {
        id: document.id,
      },
      data: {
        documentNo,
        status: DocumentStatus.SUBMITTED,
        submittedAt: now,
      },
    });

    await tx.approvalStep.updateMany({
      where: {
        documentId: document.id,
      },
      data: {
        status: ApprovalStepStatus.WAITING,
        actedAt: null,
        actedById: null,
        proxyApprovedById: null,
        decisionType: "NORMAL",
        comment: null,
      },
    });

    await tx.approvalStep.update({
      where: {
        id: firstStep.id,
      },
      data: {
        status: ApprovalStepStatus.PENDING,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        ...auditRequestData,
        action: AuditAction.SUBMIT,
        targetType: "ApprovalDocument",
        targetId: document.id,
        documentId: document.id,
        message: getSubmitMessage(
          document.approvalSteps.map((step) => step.approver),
        ),
      },
    });

    await createDocumentNotification(tx, {
      userId: firstStep.approver.id,
      documentId: document.id,
      type: NotificationType.APPROVAL_REQUESTED,
      title: "결재 요청 도착",
      message: `${document.drafter.name}님이 "${document.title}" 결재를 요청했습니다.`,
    });

    return {
      ok: true,
      documentId: document.id,
    };
  });
}

export async function updateDraftDocument({
  documentId,
  actorId,
  title,
  category,
  content,
  templateId,
  approvers,
  attachments = [],
  removeAttachmentIds = [],
  submitImmediately,
}: UpdateDraftDocumentInput): Promise<DraftMutationResult> {
  const auditRequestData = await getCurrentAuditLogRequestData();

  const result = await prisma.$transaction(async (tx) => {
    const document = await tx.approvalDocument.findUnique({
      where: {
        id: documentId,
      },
      select: {
        id: true,
        drafterId: true,
        documentNo: true,
        title: true,
        category: true,
        content: true,
        status: true,
        templateId: true,
        approvalSteps: {
          orderBy: {
            order: "asc",
          },
          select: {
            approverId: true,
            approver: {
              select: {
                name: true,
              },
            },
          },
        },
        attachments: {
          select: {
            id: true,
            originalName: true,
            storageProvider: true,
            storageKey: true,
            signedSourceAttachmentId: true,
            signedCopies: {
              select: {
                id: true,
                originalName: true,
                storageProvider: true,
                storageKey: true,
              },
            },
            convertedCopies: {
              select: {
                id: true,
                originalName: true,
                storageProvider: true,
                storageKey: true,
              },
            },
          },
        },
      },
    });

    if (!document) {
      return {
        ok: false as const,
        message: "문서를 찾을 수 없습니다.",
      };
    }

    if (document.drafterId !== actorId) {
      return {
        ok: false as const,
        message: "작성자만 임시저장 문서를 수정할 수 있습니다.",
      };
    }

    if (
      document.status !== DocumentStatus.DRAFT &&
      document.status !== DocumentStatus.RECALLED
    ) {
      return {
        ok: false as const,
        message: "임시저장 또는 회수 상태의 문서만 수정할 수 있습니다.",
      };
    }

    const blockedAttachment = getSourceAttachmentWithSignedCopies(
      document.attachments,
      removeAttachmentIds,
    );

    if (blockedAttachment) {
      return {
        ok: false as const,
        message: `"${blockedAttachment.originalName}" 첨부파일에는 서명본이 있어 삭제할 수 없습니다. 삭제 가능한 서명본을 먼저 정리하세요.`,
      };
    }

    const attachmentsToRemove = getDocumentAttachmentsToRemove(
      document.attachments,
      removeAttachmentIds,
    );
    const now = new Date();
    const documentNo = submitImmediately
      ? document.documentNo ?? (await getNextDocumentNo(tx, now))
      : document.status === DocumentStatus.RECALLED
        ? null
        : document.documentNo;
    const nextStatus = submitImmediately
      ? DocumentStatus.SUBMITTED
      : DocumentStatus.DRAFT;
    const auditDetails = createDraftUpdateAuditDetails({
      before: {
        title: document.title,
        category: document.category,
        content: document.content,
        templateId: document.templateId,
        status: document.status,
        documentNo: document.documentNo,
        approvers: document.approvalSteps.map((step) => ({
          id: step.approverId,
          name: step.approver.name,
        })),
      },
      after: {
        title,
        category,
        content,
        templateId,
        status: nextStatus,
        documentNo,
        approvers,
      },
      addedAttachmentNames: attachments.map((attachment) => attachment.originalName),
      removedAttachments: attachmentsToRemove.map((attachment) => ({
        id: attachment.id,
        originalName: attachment.originalName,
      })),
    });

    await tx.approvalStep.deleteMany({
      where: {
        documentId: document.id,
      },
    });

    await tx.approvalDocument.update({
      where: {
        id: document.id,
      },
      data: {
        documentNo,
        title,
        category,
        content,
        status: nextStatus,
        submittedAt: submitImmediately ? now : null,
        completedAt: null,
        templateId,
        approvalSteps: {
          create: approvers.map((approver, index) => ({
            approverId: approver.id,
            order: index + 1,
            status:
              submitImmediately && index === 0
                ? ApprovalStepStatus.PENDING
                : ApprovalStepStatus.WAITING,
          })),
        },
        attachments: {
          deleteMany:
            attachmentsToRemove.length > 0
              ? {
                  id: {
                    in: attachmentsToRemove.map((attachment) => attachment.id),
                  },
                }
              : undefined,
          create: attachments.map((attachment) => ({
            originalName: attachment.originalName,
            storageProvider: attachment.storageProvider,
            storageKey: attachment.storageKey,
            mimeType: attachment.mimeType,
            size: attachment.size,
            uploaderId: actorId,
          })),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        ...auditRequestData,
        action: submitImmediately
          ? AuditAction.SUBMIT
          : AuditAction.UPDATE_DRAFT,
        targetType: "ApprovalDocument",
        targetId: document.id,
        documentId: document.id,
        message: `${
          submitImmediately
            ? getSubmitMessage(approvers)
            : "임시저장 문서를 수정했습니다."
        } 변경: ${auditDetails.summary}`,
        metadata: {
          changes: auditDetails.changes,
          addedAttachmentNames: attachments.map(
            (attachment) => attachment.originalName,
          ),
          removedAttachmentIds: attachmentsToRemove.map(
            (attachment) => attachment.id,
          ),
          removedAttachmentNames: attachmentsToRemove.map(
            (attachment) => attachment.originalName,
          ),
        },
      },
    });

    const firstApprover = approvers[0];

    if (submitImmediately && firstApprover) {
      const drafter = await tx.user.findUnique({
        where: {
          id: actorId,
        },
        select: {
          name: true,
        },
      });

      await createDocumentNotification(tx, {
        userId: firstApprover.id,
        documentId: document.id,
        type: NotificationType.APPROVAL_REQUESTED,
        title: "결재 요청 도착",
        message: `${drafter?.name ?? "작성자"}님이 "${title}" 결재를 요청했습니다.`,
      });
    }

    return {
      ok: true as const,
      documentId: document.id,
      attachmentsToRemove,
    };
  });

  if (!result.ok) {
    return result;
  }

  try {
    await removeStoredAttachmentFiles(result.attachmentsToRemove);
  } catch (error) {
    console.error("Failed to remove draft attachment files", error);
  }

  return {
    ok: true,
    documentId: result.documentId,
  };
}

export async function deleteDraftDocument(
  documentId: string,
  actorId: string,
): Promise<DraftMutationResult> {
  const auditRequestData = await getCurrentAuditLogRequestData();
  const attachmentsToRemove = await prisma.$transaction(async (tx) => {
    const document = await tx.approvalDocument.findUnique({
      where: {
        id: documentId,
      },
      select: {
        id: true,
        title: true,
        drafterId: true,
        status: true,
        attachments: {
          select: {
            storageProvider: true,
            storageKey: true,
          },
        },
      },
    });

    if (!document) {
      return {
        ok: false as const,
        message: "문서를 찾을 수 없습니다.",
      };
    }

    if (document.drafterId !== actorId) {
      return {
        ok: false as const,
        message: "작성자만 임시저장 문서를 삭제할 수 있습니다.",
      };
    }

    if (!canDeleteDraftDocumentByPolicy(actorId, document)) {
      return {
        ok: false as const,
        message: "임시저장 상태의 문서만 삭제할 수 있습니다.",
      };
    }

    await tx.auditLog.create({
      data: {
        actorId,
        ...auditRequestData,
        action: AuditAction.DELETE_DRAFT,
        targetType: "ApprovalDocument",
        targetId: document.id,
        documentId: document.id,
        message: `"${document.title}" 임시저장 문서를 삭제했습니다.`,
      },
    });

    await tx.approvalDocument.delete({
      where: {
        id: document.id,
      },
    });

    return {
      ok: true as const,
      documentId: document.id,
      attachments: document.attachments,
    };
  });

  if (!attachmentsToRemove.ok) {
    return attachmentsToRemove;
  }

  try {
    await removeStoredAttachmentFiles(attachmentsToRemove.attachments);
  } catch (error) {
    console.error("Failed to remove deleted draft attachments", error);
  }

  return {
    ok: true,
    documentId: attachmentsToRemove.documentId,
  };
}

export async function deleteDocumentAttachment(
  documentId: string,
  attachmentId: string,
  actorId: string,
): Promise<DraftMutationResult> {
  const auditRequestData = await getCurrentAuditLogRequestData();
  const result = await prisma.$transaction(async (tx) => {
    const attachment = await tx.attachment.findFirst({
      where: {
        id: attachmentId,
        documentId,
        signedSourceAttachmentId: null,
      },
      select: {
        id: true,
        originalName: true,
        storageProvider: true,
        storageKey: true,
        document: {
          select: {
            id: true,
            title: true,
            drafterId: true,
            status: true,
          },
        },
        signedCopies: {
          select: {
            id: true,
            originalName: true,
            storageProvider: true,
            storageKey: true,
          },
        },
        convertedCopies: {
          select: {
            id: true,
            originalName: true,
            storageProvider: true,
            storageKey: true,
          },
        },
      },
    });

    if (!attachment) {
      return {
        ok: false as const,
        message: "첨부파일을 찾을 수 없습니다.",
      };
    }

    if (
      !canManageDraftDocumentAttachmentsByPolicy(actorId, attachment.document)
    ) {
      return {
        ok: false as const,
        message: "임시저장 또는 회수 상태의 작성자만 첨부파일을 삭제할 수 있습니다.",
      };
    }

    if (attachment.signedCopies.length > 0) {
      return {
        ok: false as const,
        message: `"${attachment.originalName}" 첨부파일에는 서명본이 있어 삭제할 수 없습니다. 삭제 가능한 서명본을 먼저 정리하세요.`,
      };
    }

    const attachmentsToRemove = getDocumentAttachmentsToRemove(
      [attachment],
      [attachment.id],
    );

    await tx.auditLog.create({
      data: {
        actorId,
        ...auditRequestData,
        action: AuditAction.UPDATE_DRAFT,
        targetType: "Attachment",
        targetId: attachment.id,
        documentId: attachment.document.id,
        message: `"${attachment.originalName}" 첨부파일을 삭제했습니다.`,
        metadata:
          attachmentsToRemove.length > 1
            ? {
                removedAttachmentIds: attachmentsToRemove.map(
                  (removedAttachment) => removedAttachment.id,
                ),
              }
            : undefined,
      },
    });

    await tx.attachment.deleteMany({
      where: {
        id: {
          in: attachmentsToRemove.map((removedAttachment) => removedAttachment.id),
        },
      },
    });

    return {
      ok: true as const,
      documentId: attachment.document.id,
      attachmentsToRemove,
    };
  });

  if (!result.ok) {
    return result;
  }

  try {
    await removeStoredAttachmentFiles(result.attachmentsToRemove);
  } catch (error) {
    console.error("Failed to remove document attachment files", error);
  }

  return {
    ok: true,
    documentId: result.documentId,
  };
}

export async function recallSubmittedDocument(
  documentId: string,
  actorId: string,
): Promise<DraftMutationResult> {
  const auditRequestData = await getCurrentAuditLogRequestData();

  return prisma.$transaction(async (tx) => {
    const document = await tx.approvalDocument.findUnique({
      where: {
        id: documentId,
      },
      select: {
        id: true,
        title: true,
        drafterId: true,
        status: true,
      },
    });

    if (!document) {
      return {
        ok: false,
        message: "문서를 찾을 수 없습니다.",
      };
    }

    if (document.drafterId !== actorId) {
      return {
        ok: false,
        message: "작성자만 결재 요청을 회수할 수 있습니다.",
      };
    }

    if (!canRecallDocumentByPolicy(actorId, document)) {
      return {
        ok: false,
        message: "결재 요청 또는 진행중 상태의 문서만 회수할 수 있습니다.",
      };
    }

    const now = new Date();

    const recallResult = await tx.approvalDocument.updateMany({
      where: {
        id: document.id,
        status: {
          in: [DocumentStatus.SUBMITTED, DocumentStatus.IN_PROGRESS],
        },
      },
      data: {
        status: DocumentStatus.RECALLED,
        completedAt: now,
      },
    });

    if (recallResult.count === 0) {
      return {
        ok: false,
        message: "이미 완료되었거나 회수할 수 없는 문서입니다.",
      };
    }

    await tx.approvalStep.updateMany({
      where: {
        documentId: document.id,
        status: {
          in: [ApprovalStepStatus.WAITING, ApprovalStepStatus.PENDING],
        },
      },
      data: {
        status: ApprovalStepStatus.WAITING,
        actedAt: null,
        actedById: null,
        proxyApprovedById: null,
        decisionType: "NORMAL",
        comment: null,
      },
    });

    await tx.notification.deleteMany({
      where: {
        documentId: document.id,
        type: NotificationType.APPROVAL_REQUESTED,
        readAt: null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        ...auditRequestData,
        action: AuditAction.RECALL,
        targetType: "ApprovalDocument",
        targetId: document.id,
        documentId: document.id,
        message: `"${document.title}" 결재 요청을 회수했습니다.`,
      },
    });

    return {
      ok: true,
      documentId: document.id,
    };
  });
}

export async function approveCurrentApprovalStep(
  documentId: string,
  actorId: string,
  comment: string,
): Promise<ApprovalDecisionResult> {
  const auditRequestData = await getCurrentAuditLogRequestData();

  return prisma.$transaction(async (tx) => {
    const document = await getDocumentForDecision(tx, documentId);
    const decisionPlan = getApprovalDecisionPlan(
      document,
      actorId,
      "approve",
    );

    if (!decisionPlan.ok) {
      return decisionPlan;
    }

    const {
      currentStep,
      document: decisionDocument,
      nextStep,
    } = decisionPlan;
    const now = new Date();

    await tx.approvalStep.update({
      where: {
        id: currentStep.id,
      },
      data: {
        status: ApprovalStepStatus.APPROVED,
        actedAt: now,
        actedById: actorId,
        proxyApprovedById: null,
        decisionType: "NORMAL",
        comment: comment || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        ...auditRequestData,
        action: AuditAction.APPROVE,
        targetType: "ApprovalStep",
        targetId: currentStep.id,
        documentId: decisionDocument.id,
        message: createApprovalApprovedAuditMessage({
          approver: currentStep.approver,
          drafter: decisionDocument.drafter,
        }),
      },
    });

    if (nextStep) {
      await tx.approvalStep.update({
        where: {
          id: nextStep.id,
        },
        data: {
          status: ApprovalStepStatus.PENDING,
        },
      });

      await tx.approvalDocument.update({
        where: {
          id: decisionDocument.id,
        },
        data: {
          status: decisionPlan.finalDocumentStatus,
        },
      });

      await createDocumentNotification(tx, {
        userId: nextStep.approverId,
        documentId: decisionDocument.id,
        type: NotificationType.APPROVAL_REQUESTED,
        title: "내 결재 차례",
        message: `${currentStep.order}차 결재가 승인되어 "${decisionDocument.title}" 결재 순서가 도착했습니다.`,
      });

      if (decisionDocument.drafterId !== actorId) {
        await createDocumentNotification(tx, {
          userId: decisionDocument.drafterId,
          documentId: decisionDocument.id,
          type: NotificationType.APPROVAL_APPROVED,
          title: "결재 진행 알림",
          message: `"${decisionDocument.title}" ${currentStep.order}차 결재가 승인되었습니다.`,
        });
      }
    } else {
      await tx.approvalDocument.update({
        where: {
          id: decisionDocument.id,
        },
        data: {
          status: decisionPlan.finalDocumentStatus,
          completedAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          ...auditRequestData,
          action: AuditAction.COMPLETE,
          targetType: "ApprovalDocument",
          targetId: decisionDocument.id,
          documentId: decisionDocument.id,
          message: "최종 결재가 완료되었습니다.",
        },
      });

      await recordApprovedVacationLeaveDeduction(tx, {
        actorId,
        document: decisionDocument,
      });

      if (decisionDocument.drafterId !== actorId) {
        await createDocumentNotification(tx, {
          userId: decisionDocument.drafterId,
          documentId: decisionDocument.id,
          type: NotificationType.APPROVAL_COMPLETED,
          title: "최종 승인 완료",
          message: `"${decisionDocument.title}" 문서가 최종 승인되었습니다.`,
        });
      }
    }

    return {
      ok: true,
      documentId: decisionDocument.id,
    };
  });
}

export async function rejectCurrentApprovalStep(
  documentId: string,
  actorId: string,
  comment: string,
): Promise<ApprovalDecisionResult> {
  const auditRequestData = await getCurrentAuditLogRequestData();

  return prisma.$transaction(async (tx) => {
    const document = await getDocumentForDecision(tx, documentId);
    const decisionPlan = getApprovalDecisionPlan(document, actorId, "reject");

    if (!decisionPlan.ok) {
      return decisionPlan;
    }

    const { currentStep, document: decisionDocument } = decisionPlan;
    const now = new Date();

    await tx.approvalStep.update({
      where: {
        id: currentStep.id,
      },
      data: {
        status: ApprovalStepStatus.REJECTED,
        actedAt: now,
        actedById: actorId,
        proxyApprovedById: null,
        decisionType: "NORMAL",
        comment: comment || null,
      },
    });

    await tx.approvalDocument.update({
      where: {
        id: decisionDocument.id,
      },
      data: {
        status: decisionPlan.finalDocumentStatus,
        completedAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        ...auditRequestData,
        action: AuditAction.REJECT,
        targetType: "ApprovalStep",
        targetId: currentStep.id,
        documentId: decisionDocument.id,
        message: createApprovalRejectedAuditMessage({
          approver: currentStep.approver,
          drafter: decisionDocument.drafter,
          comment,
        }),
      },
    });

    if (decisionDocument.drafterId !== actorId) {
      await createDocumentNotification(tx, {
        userId: decisionDocument.drafterId,
        documentId: decisionDocument.id,
        type: NotificationType.APPROVAL_REJECTED,
        title: "문서 반려",
        message: comment
          ? `"${decisionDocument.title}" 문서가 반려되었습니다. 사유: ${comment}`
          : `"${decisionDocument.title}" 문서가 반려되었습니다.`,
      });
    }

    return {
      ok: true,
      documentId: decisionDocument.id,
    };
  });
}

export async function proxyApproveApprovalStepsThrough(
  documentId: string,
  actorId: string,
  targetStepId: string,
  comment: string,
): Promise<ApprovalDecisionResult> {
  const auditRequestData = await getCurrentAuditLogRequestData();

  return prisma.$transaction(async (tx) => {
    const [actor, document] = await Promise.all([
      tx.user.findUnique({
        where: {
          id: actorId,
        },
        select: {
          name: true,
          role: true,
          position: {
            select: {
              name: true,
            },
          },
        },
      }),
      getDocumentForDecision(tx, documentId),
    ]);
    const decisionPlan = getProxyApprovalDecisionPlan(
      document,
      actorId,
      targetStepId,
    );

    if (!decisionPlan.ok) {
      return decisionPlan;
    }

    if (!actor) {
      return {
        ok: false,
        message: "사용자를 찾을 수 없습니다.",
      };
    }

    const {
      document: decisionDocument,
      nextStep,
      stepsToApprove,
      targetStep,
    } = decisionPlan;

    if (!canProxyApproveDocument(actorId, actor.role, decisionDocument)) {
      return {
        ok: false,
        message: "결재선 참여자 또는 관리자만 대리결재할 수 있습니다.",
      };
    }

    const now = new Date();

    for (const step of stepsToApprove) {
      const isOwnApproval = step.approverId === actorId;

      await tx.approvalStep.update({
        where: {
          id: step.id,
        },
        data: {
          status: ApprovalStepStatus.APPROVED,
          actedAt: now,
          actedById: actorId,
          proxyApprovedById: isOwnApproval ? null : actorId,
          decisionType: isOwnApproval ? "NORMAL" : "PROXY",
          comment: comment || null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          ...auditRequestData,
          action: isOwnApproval
            ? AuditAction.APPROVE
            : AuditAction.PROXY_APPROVE,
          targetType: "ApprovalStep",
          targetId: step.id,
          documentId: decisionDocument.id,
          message: isOwnApproval
            ? createApprovalApprovedAuditMessage({
                approver: step.approver,
                drafter: decisionDocument.drafter,
              })
            : createProxyApprovedAuditMessage({
                actor,
                approver: step.approver,
              }),
          metadata: isOwnApproval
            ? {
                decisionType: "NORMAL",
              }
            : {
                proxiedApproverId: step.approverId,
                proxyActorId: actorId,
                decisionType: "PROXY",
              },
        },
      });
    }

    if (nextStep) {
      await tx.approvalStep.update({
        where: {
          id: nextStep.id,
        },
        data: {
          status: ApprovalStepStatus.PENDING,
        },
      });

      await tx.approvalDocument.update({
        where: {
          id: decisionDocument.id,
        },
        data: {
          status: decisionPlan.finalDocumentStatus,
        },
      });

      await createDocumentNotification(tx, {
        userId: nextStep.approverId,
        documentId: decisionDocument.id,
        type: NotificationType.APPROVAL_REQUESTED,
        title: "내 결재 차례",
        message: `${targetStep.order}차까지 결재가 처리되어 "${decisionDocument.title}" 결재 순서가 도착했습니다.`,
      });

      await notifyProxyApprovalParticipants(tx, {
        actorId,
        document: decisionDocument,
        actorName: actor.name,
        proxiedSteps: stepsToApprove.filter(
          (step) => step.approverId !== actorId,
        ),
        targetStep,
      });
    } else {
      await tx.approvalDocument.update({
        where: {
          id: decisionDocument.id,
        },
        data: {
          status: decisionPlan.finalDocumentStatus,
          completedAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          ...auditRequestData,
          action: AuditAction.COMPLETE,
          targetType: "ApprovalDocument",
          targetId: decisionDocument.id,
          documentId: decisionDocument.id,
          message: "최종 결재가 대리결재를 포함하여 완료되었습니다.",
        },
      });

      await recordApprovedVacationLeaveDeduction(tx, {
        actorId,
        document: decisionDocument,
      });

      await notifyProxyApprovalParticipants(tx, {
        actorId,
        document: decisionDocument,
        actorName: actor.name,
        proxiedSteps: stepsToApprove.filter(
          (step) => step.approverId !== actorId,
        ),
        targetStep,
      });
    }

    return {
      ok: true,
      documentId: decisionDocument.id,
    };
  });
}

export async function rejectProxyApprovedStep(
  documentId: string,
  stepId: string,
  actorId: string,
  comment: string,
): Promise<ApprovalDecisionResult> {
  const auditRequestData = await getCurrentAuditLogRequestData();

  return prisma.$transaction(async (tx) => {
    const [actor, document] = await Promise.all([
      tx.user.findUnique({
        where: {
          id: actorId,
        },
        select: {
          name: true,
          role: true,
          position: {
            select: {
              name: true,
            },
          },
        },
      }),
      getDocumentForDecision(tx, documentId),
    ]);

    if (!actor) {
      return {
        ok: false,
        message: "사용자를 찾을 수 없습니다.",
      };
    }

    if (!document) {
      return {
        ok: false,
        message: "문서를 찾을 수 없습니다.",
      };
    }

    if (
      document.status !== DocumentStatus.SUBMITTED &&
      document.status !== DocumentStatus.IN_PROGRESS &&
      document.status !== DocumentStatus.APPROVED
    ) {
      return {
        ok: false,
        message: "진행 중이거나 승인 완료된 문서의 대리결재만 반려할 수 있습니다.",
      };
    }

    const targetStep = document.approvalSteps.find((step) => step.id === stepId);

    if (!targetStep) {
      return {
        ok: false,
        message: "대리결재 단계를 찾을 수 없습니다.",
      };
    }

    if (
      targetStep.status !== ApprovalStepStatus.APPROVED ||
      targetStep.decisionType !== "PROXY" ||
      !targetStep.proxyApprovedById
    ) {
      return {
        ok: false,
        message: "대리결재로 승인된 단계만 반려할 수 있습니다.",
      };
    }

    if (!canRejectProxyApproval(actorId, actor.role, document, targetStep)) {
      return {
        ok: false,
        message: "대리결재 처리자, 원 결재자, 상위 결재자 또는 관리자만 반려할 수 있습니다.",
      };
    }

    const now = new Date();

    await tx.approvalStep.update({
      where: {
        id: targetStep.id,
      },
      data: {
        status: ApprovalStepStatus.REJECTED,
        actedAt: now,
        actedById: actorId,
        decisionType: "PROXY_REJECT",
        comment: comment || null,
      },
    });

    await tx.approvalDocument.update({
      where: {
        id: document.id,
      },
      data: {
        status: DocumentStatus.REJECTED,
        completedAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        ...auditRequestData,
        action: AuditAction.PROXY_REJECT,
        targetType: "ApprovalStep",
        targetId: targetStep.id,
        documentId: document.id,
        message: createProxyRejectedAuditMessage({
          actor,
          actorId,
          step: targetStep,
          comment,
        }),
        metadata: {
          proxiedApproverId: targetStep.approverId,
          proxyActorId: targetStep.proxyApprovedById,
          rejectedById: actorId,
          decisionType: "PROXY_REJECT",
        },
      },
    });

    if (document.drafterId !== actorId) {
      await createDocumentNotification(tx, {
        userId: document.drafterId,
        documentId: document.id,
        type: NotificationType.APPROVAL_REJECTED,
        title: "대리결재 반려",
        message: comment
          ? `"${document.title}" 문서의 대리결재가 반려되었습니다. 사유: ${comment}`
          : `"${document.title}" 문서의 대리결재가 반려되었습니다.`,
      });
    }

    return {
      ok: true,
      documentId: document.id,
    };
  });
}

type DecisionDocument = NonNullable<
  Awaited<ReturnType<typeof getDocumentForDecision>>
>;
type DecisionStep = DecisionDocument["approvalSteps"][number];

type AttachmentRemovalCandidate = AttachmentRemovalRef & {
  signedSourceAttachmentId?: string | null;
  signedCopies?: AttachmentRemovalRef[];
  convertedCopies?: AttachmentRemovalRef[];
};

function canProxyApproveDocument(
  actorId: string,
  actorRole: UserRole,
  document: DecisionDocument,
) {
  return (
    actorRole === UserRole.ADMIN ||
    document.drafterId === actorId ||
    document.approvalSteps.some((step) => step.approverId === actorId)
  );
}

function canRejectProxyApproval(
  actorId: string,
  actorRole: UserRole,
  document: DecisionDocument,
  targetStep: DecisionStep,
) {
  if (actorRole === UserRole.ADMIN) {
    return true;
  }

  if (
    targetStep.approverId === actorId ||
    targetStep.proxyApprovedById === actorId
  ) {
    return true;
  }

  return document.approvalSteps.some(
    (step) => step.order > targetStep.order && step.approverId === actorId,
  );
}

function getDocumentAttachmentsToRemove(
  attachments: readonly AttachmentRemovalCandidate[],
  removeAttachmentIds: readonly string[],
) {
  const requestedIds = new Set(removeAttachmentIds.filter(Boolean));
  const removalById = new Map<string, AttachmentRemovalRef>();

  for (const attachment of attachments) {
    if (!requestedIds.has(attachment.id)) {
      continue;
    }

    addAttachmentRemovalRef(removalById, attachment);

    if (!attachment.signedSourceAttachmentId) {
      for (const signedCopy of attachment.signedCopies ?? []) {
        addAttachmentRemovalRef(removalById, signedCopy);
      }

      for (const convertedCopy of attachment.convertedCopies ?? []) {
        addAttachmentRemovalRef(removalById, convertedCopy);
      }
    }
  }

  return Array.from(removalById.values());
}

function getSourceAttachmentWithSignedCopies(
  attachments: readonly AttachmentRemovalCandidate[],
  removeAttachmentIds: readonly string[],
) {
  const requestedIds = new Set(removeAttachmentIds.filter(Boolean));

  return attachments.find(
    (attachment) =>
      requestedIds.has(attachment.id) &&
      !attachment.signedSourceAttachmentId &&
      (attachment.signedCopies?.length ?? 0) > 0,
  );
}

function addAttachmentRemovalRef(
  removalById: Map<string, AttachmentRemovalRef>,
  attachment: AttachmentRemovalRef,
) {
  removalById.set(attachment.id, {
    id: attachment.id,
    originalName: attachment.originalName,
    storageProvider: attachment.storageProvider,
    storageKey: attachment.storageKey,
  });
}

async function notifyProxyApprovalParticipants(
  tx: Prisma.TransactionClient,
  {
    actorId,
    actorName,
    document,
    proxiedSteps,
    targetStep,
  }: {
    actorId: string;
    actorName: string;
    document: DecisionDocument;
    proxiedSteps: DecisionStep[];
    targetStep: DecisionStep;
  },
) {
  if (proxiedSteps.length === 0) {
    return;
  }

  if (document.drafterId !== actorId) {
    await createDocumentNotification(tx, {
      userId: document.drafterId,
      documentId: document.id,
      type: NotificationType.APPROVAL_APPROVED,
      title: "결재 진행 알림",
      message: `"${document.title}" 문서가 ${targetStep.order}차까지 대리 승인되었습니다.`,
    });
  }

  for (const step of proxiedSteps) {
    await createDocumentNotification(tx, {
      userId: step.approverId,
      documentId: document.id,
      type: NotificationType.APPROVAL_APPROVED,
      title: "대리결재 처리됨",
      message: `${actorName}님이 "${document.title}" ${step.order}차 결재를 대리 승인했습니다.`,
    });
  }
}

async function getDocumentForDecision(
  tx: Prisma.TransactionClient,
  documentId: string,
) {
  return tx.approvalDocument.findUnique({
    where: {
      id: documentId,
    },
    select: {
      id: true,
      title: true,
      content: true,
      drafterId: true,
      templateId: true,
      status: true,
      template: {
        select: {
          name: true,
          schema: true,
        },
      },
      drafter: {
        select: {
          name: true,
          position: {
            select: {
              name: true,
            },
          },
        },
      },
      approvalSteps: {
        orderBy: {
          order: "asc",
        },
        select: {
          id: true,
          order: true,
          approverId: true,
          actedById: true,
          proxyApprovedById: true,
          decisionType: true,
          status: true,
          approver: {
            select: {
              id: true,
              name: true,
              position: {
                select: {
                  name: true,
                },
              },
            },
          },
          proxyApprovedBy: {
            select: {
              id: true,
              name: true,
              position: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

async function getNextDocumentNo(
  tx: Prisma.TransactionClient,
  issuedAt: Date,
) {
  const prefix = `EA-${issuedAt.getFullYear()}-`;
  const latest = await tx.approvalDocument.findFirst({
    where: {
      documentNo: {
        startsWith: prefix,
      },
    },
    orderBy: {
      documentNo: "desc",
    },
    select: {
      documentNo: true,
    },
  });
  const latestSequence = Number(latest?.documentNo?.slice(prefix.length) ?? 0);
  const nextSequence = Number.isFinite(latestSequence)
    ? latestSequence + 1
    : 1;

  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

function getSubmitMessage(approvers: OrderedApprover[]) {
  if (approvers.length === 0) {
    return "결재를 요청했습니다.";
  }

  return `${approvers.map((approver) => approver.name).join(", ")} 순서로 결재를 요청했습니다.`;
}
