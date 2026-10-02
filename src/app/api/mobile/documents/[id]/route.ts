import { getReadableDocumentById } from "@/lib/approval-queries";
import { getAttachmentPreviewKind } from "@/lib/attachment-preview";
import { getCurrentApprovalStep } from "@/lib/mock-data";
import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { isApprovalAuthorityPosition } from "@/lib/approval-authority";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  const { id } = await params;
  const document = await getReadableDocumentById(id, session.userId, session.user.role);
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
      submittedAt: document.submittedAt,
      drafterName: document.drafter.name,
      approvalSteps: document.approvalSteps.map((step) => ({
        id: step.id,
        order: step.order,
        name: step.approver.name,
        status: step.status,
        actedAt: step.actedAt,
        comment: step.comment,
      })),
      attachments: document.attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.originalName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        previewKind: getAttachmentPreviewKind(attachment.originalName, attachment.mimeType),
      })),
      canDecide,
      decisionBlockedReason: isCurrentApprover && unsupportedAttachments.length > 0
        ? "미리보기를 지원하지 않는 첨부파일이 있어 웹에서 확인 후 결재해야 합니다."
        : null,
    },
  });
}
