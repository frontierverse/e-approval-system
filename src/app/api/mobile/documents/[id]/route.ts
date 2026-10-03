import { getReadableDocumentById } from "@/lib/approval-queries";
import { getAttachmentPreviewKind } from "@/lib/attachment-preview";
import { getCurrentApprovalStep } from "@/lib/mock-data";
import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { isApprovalAuthorityPosition } from "@/lib/approval-authority";
import { canManageDraftDocumentAttachmentsByPolicy, canRecallDocumentByPolicy } from "@/lib/approval-permissions-core";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  const { id } = await params;
  const document = await getReadableDocumentById(id, session.userId, "USER");
  if (!document) return mobileJson({ error: "문서를 찾을 수 없습니다." }, 404);

  const currentStep = getCurrentApprovalStep(document);
  const unsupportedAttachments = document.attachments.filter(
    (attachment) => !getAttachmentPreviewKind(attachment.originalName, attachment.mimeType),
  );
  const isCurrentApprover = isApprovalAuthorityPosition(session.user.position.name) &&
    currentStep?.approverId === session.userId &&
    (document.status === "submitted" || document.status === "in_progress");
  const canDecide = isCurrentApprover && unsupportedAttachments.length === 0;

  return mobileJson({
    document: {
      id: document.id,
      documentNo: document.documentNo,
      title: document.title,
      status: document.status,
      category: document.category,
      templateName: document.templateName,
      content: document.content,
      createdAt: document.createdAt,
      submittedAt: document.submittedAt,
      completedAt: document.completedAt,
      updatedAt: document.updatedAt ?? null,
      drafterName: document.drafter.name,
      approvalSteps: document.approvalSteps.map((step) => ({
        id: step.id,
        order: step.order,
        name: step.approver.name,
        status: step.status,
        actedAt: step.actedAt,
        comment: step.comment,
        actedByName: step.actedBy?.name ?? null,
        proxyApprovedByName: step.proxyApprovedBy?.name ?? null,
        decisionType: step.decisionType ?? "NORMAL",
      })),
      // The mobile timeline needs the work record, not audit metadata or device/location data.
      histories: document.histories.map((history) => ({
        id: history.id,
        action: history.action,
        actorName: history.actor?.name || history.actorName || "시스템",
        createdAt: history.createdAt,
        description: history.description,
      })),
      attachments: document.attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.originalName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        isSigned: Boolean(attachment.signedSourceAttachmentId),
        signedAt: attachment.signedAt ?? null,
        previewKind: getAttachmentPreviewKind(attachment.originalName, attachment.mimeType),
      })),
      canDecide,
      canRecall: canRecallDocumentByPolicy(session.userId, document),
      canEdit: canManageDraftDocumentAttachmentsByPolicy(session.userId, document),
      decisionBlockedReason: isCurrentApprover && unsupportedAttachments.length > 0
        ? "미리보기를 지원하지 않는 첨부파일이 있어 웹에서 확인 후 결재해야 합니다."
        : null,
    },
  });
}
