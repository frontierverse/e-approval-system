import { getReadableDocumentWhere } from "@/lib/approval-permissions";
import { getAttachmentPreviewKind } from "@/lib/attachment-preview";
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
      document: getReadableDocumentWhere(session.userId, "USER"),
    },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      signedSourceAttachmentId: true,
      signedAt: true,
    },
  });
  if (!attachment) return mobileJson({ error: "파일을 찾을 수 없습니다." }, 404);
  return mobileJson({
    attachment: {
      id: attachment.id,
      name: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      previewKind: getAttachmentPreviewKind(attachment.originalName, attachment.mimeType),
      isSigned: Boolean(attachment.signedSourceAttachmentId),
      signedAt: attachment.signedAt?.toISOString() ?? null,
    },
  });
}
