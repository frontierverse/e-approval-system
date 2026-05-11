import "server-only";

import {
  ApprovalStepStatus,
  AuditAction,
  DocumentStatus,
  NotificationType,
  Prisma,
} from "@/generated/prisma/client";
import { getApprovalDecisionPlan } from "@/lib/approval-flow-core";
import { getApprovalLinePolicyError } from "@/lib/approval-line-policy";
import { removeStoredAttachmentFiles } from "@/lib/attachment-storage";
import { createDocumentNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

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
  submitImmediately: boolean;
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
  submitImmediately,
}: UpdateDraftDocumentInput): Promise<DraftMutationResult> {
  return prisma.$transaction(async (tx) => {
    const document = await tx.approvalDocument.findUnique({
      where: {
        id: documentId,
      },
      select: {
        id: true,
        drafterId: true,
        documentNo: true,
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
        message: "작성자만 임시저장 문서를 수정할 수 있습니다.",
      };
    }

    if (
      document.status !== DocumentStatus.DRAFT &&
      document.status !== DocumentStatus.RECALLED
    ) {
      return {
        ok: false,
        message: "임시저장 또는 회수 상태의 문서만 수정할 수 있습니다.",
      };
    }

    const now = new Date();
    const documentNo = submitImmediately
      ? document.documentNo ?? (await getNextDocumentNo(tx, now))
      : document.status === DocumentStatus.RECALLED
        ? null
        : document.documentNo;

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
        status: submitImmediately
          ? DocumentStatus.SUBMITTED
          : DocumentStatus.DRAFT,
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
        attachments:
          attachments.length > 0
            ? {
                create: attachments.map((attachment) => ({
                  originalName: attachment.originalName,
                  storageProvider: attachment.storageProvider,
                  storageKey: attachment.storageKey,
                  mimeType: attachment.mimeType,
                  size: attachment.size,
                  uploaderId: actorId,
                })),
              }
            : undefined,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: submitImmediately
          ? AuditAction.SUBMIT
          : AuditAction.UPDATE_DRAFT,
        targetType: "ApprovalDocument",
        targetId: document.id,
        documentId: document.id,
        message: submitImmediately
          ? getSubmitMessage(approvers)
          : "임시저장 문서를 수정했습니다.",
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
      ok: true,
      documentId: document.id,
    };
  });
}

export async function deleteDraftDocument(
  documentId: string,
  actorId: string,
): Promise<DraftMutationResult> {
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

    if (
      document.status !== DocumentStatus.DRAFT &&
      document.status !== DocumentStatus.RECALLED
    ) {
      return {
        ok: false as const,
        message: "임시저장 또는 회수 상태의 문서만 삭제할 수 있습니다.",
      };
    }

    await tx.auditLog.create({
      data: {
        actorId,
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

export async function recallSubmittedDocument(
  documentId: string,
  actorId: string,
): Promise<DraftMutationResult> {
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
        approvalSteps: {
          orderBy: {
            order: "asc",
          },
          select: {
            id: true,
            status: true,
            actedAt: true,
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
        message: "작성자만 결재 요청을 회수할 수 있습니다.",
      };
    }

    if (document.status !== DocumentStatus.SUBMITTED) {
      return {
        ok: false,
        message: "결재 요청 상태의 문서만 회수할 수 있습니다.",
      };
    }

    if (
      document.approvalSteps.some(
        (step) =>
          step.status === ApprovalStepStatus.APPROVED ||
          step.status === ApprovalStepStatus.REJECTED ||
          step.actedAt,
      )
    ) {
      return {
        ok: false,
        message: "결재자가 처리하기 전 문서만 회수할 수 있습니다.",
      };
    }

    const now = new Date();

    await tx.approvalDocument.update({
      where: {
        id: document.id,
      },
      data: {
        status: DocumentStatus.RECALLED,
        completedAt: now,
      },
    });

    await tx.approvalStep.updateMany({
      where: {
        documentId: document.id,
      },
      data: {
        status: ApprovalStepStatus.WAITING,
        actedAt: null,
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
        comment: comment || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: AuditAction.APPROVE,
        targetType: "ApprovalStep",
        targetId: currentStep.id,
        documentId: decisionDocument.id,
        message: `${currentStep.order}차 결재자가 승인했습니다.`,
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
          action: AuditAction.COMPLETE,
          targetType: "ApprovalDocument",
          targetId: decisionDocument.id,
          documentId: decisionDocument.id,
          message: "최종 결재가 완료되었습니다.",
        },
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
        action: AuditAction.REJECT,
        targetType: "ApprovalStep",
        targetId: currentStep.id,
        documentId: decisionDocument.id,
        message: comment
          ? `문서를 반려했습니다. 사유: ${comment}`
          : "문서를 반려했습니다.",
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
      drafterId: true,
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
          order: true,
          approverId: true,
          status: true,
          approver: {
            select: {
              id: true,
              name: true,
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
