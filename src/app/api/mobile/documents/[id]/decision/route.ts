import { revalidatePath } from "next/cache";
import { getReadableDocumentById } from "@/lib/approval-queries";
import { getAttachmentPreviewKind } from "@/lib/attachment-preview";
import { approveCurrentApprovalStep, rejectCurrentApprovalStep } from "@/lib/approval-mutations";
import { attachStampedApprovalPdfToDocument } from "@/lib/generated-approval-pdf";
import { getMobileSession, mobileJson } from "@/lib/mobile-auth";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);
  const decision = typeof body === "object" && body !== null && "decision" in body
    ? body.decision : null;
  const comment = typeof body === "object" && body !== null && "comment" in body
    ? String(body.comment).trim() : "";
  if (decision !== "approve" && decision !== "reject") {
    return mobileJson({ error: "처리할 결재 액션을 선택하세요." }, 400);
  }
  if (comment.length > 2000 || (decision === "reject" && comment.length < 2)) {
    return mobileJson({ error: "반려 사유는 2자 이상, 의견은 2000자 이하로 입력하세요." }, 400);
  }

  const document = await getReadableDocumentById(id, session.userId, session.user.role);
  if (!document) return mobileJson({ error: "문서를 찾을 수 없습니다." }, 404);
  if (document.attachments.some((attachment) =>
    !getAttachmentPreviewKind(attachment.originalName, attachment.mimeType)
  )) {
    return mobileJson({ error: "이 문서는 웹에서 첨부파일을 확인하고 결재해야 합니다." }, 409);
  }

  const result = decision === "approve"
    ? await approveCurrentApprovalStep(id, session.userId, comment)
    : await rejectCurrentApprovalStep(id, session.userId, comment);
  if (!result.ok) return mobileJson({ error: result.message }, 409);

  if (decision === "approve") {
    await attachStampedApprovalPdfToDocument(result.documentId, session.userId).catch((error) => {
      console.error("Failed to attach stamped approval PDF", error);
    });
  }
  for (const path of ["/", "/inbox", "/sent", "/completed", `/documents/${id}`]) {
    revalidatePath(path);
  }
  return mobileJson({ ok: true, documentId: result.documentId });
}
