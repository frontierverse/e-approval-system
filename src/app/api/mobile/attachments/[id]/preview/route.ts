import { getReadableDocumentWhere } from "@/lib/approval-permissions";
import { getAttachmentPreviewContentType, isPreviewableAttachmentFile } from "@/lib/attachment-preview";
import { readApprovalAttachmentFile } from "@/lib/approval-attachment-file";
import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  const { id } = await params;
  const attachment = await prisma.attachment.findFirst({
    where: {
      id,
      document: getReadableDocumentWhere(session.userId, session.user.role),
    },
    select: {
      id: true,
      originalName: true,
      storageProvider: true,
      storageKey: true,
      mimeType: true,
      size: true,
      document: { select: { status: true } },
    },
  });
  if (!attachment) return mobileJson({ error: "파일을 찾을 수 없습니다." }, 404);
  if (!isPreviewableAttachmentFile(attachment.originalName, attachment.mimeType)) {
    return mobileJson({ error: "미리보기를 지원하지 않는 파일입니다." }, 415);
  }

  try {
    const file = await readApprovalAttachmentFile(attachment);
    const contentType = getAttachmentPreviewContentType(
      attachment.originalName,
      attachment.mimeType,
    ) ?? getAttachmentPreviewContentType(
      attachment.originalName,
      file.mimeType,
    ) ?? "application/octet-stream";
    return new Response(file.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": contentType,
        "Content-Length": String(file.size ?? attachment.size),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return mobileJson({ error: "파일을 불러올 수 없습니다." }, 404);
  }
}
