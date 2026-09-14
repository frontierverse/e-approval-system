import { getCurrentUser } from "@/lib/auth";
import { getReadableDocumentWhere } from "@/lib/approval-permissions";
import { prisma } from "@/lib/prisma";
import { readApprovalAttachmentFile } from "@/lib/approval-attachment-file";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return new Response("인증이 필요합니다.", { status: 401 });
  }

  const attachment = await prisma.attachment.findFirst({
    where: {
      id,
      document: getReadableDocumentWhere(user.id, user.role),
    },
    select: {
      id: true,
      document: { select: { status: true } },
      originalName: true,
      storageProvider: true,
      storageKey: true,
      mimeType: true,
      size: true,
    },
  });

  if (!attachment) {
    return new Response("파일을 찾을 수 없습니다.", { status: 404 });
  }

  try {
    const storedFile = await readApprovalAttachmentFile(attachment);

    return new Response(storedFile.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Type":
          storedFile.mimeType || attachment.mimeType || "application/octet-stream",
        "Content-Length": String(storedFile.size ?? attachment.size),
        "Content-Disposition": getContentDisposition(attachment.originalName),
      },
    });
  } catch {
    return new Response("파일을 찾을 수 없습니다.", { status: 404 });
  }
}

function getContentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  const encoded = encodeURIComponent(filename);

  return `attachment; filename="${fallback || "attachment"}"; filename*=UTF-8''${encoded}`;
}
