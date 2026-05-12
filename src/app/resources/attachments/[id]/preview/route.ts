import { getCurrentUser } from "@/lib/auth";
import {
  getAttachmentPreviewContentType,
  isPreviewableAttachmentFile,
} from "@/lib/attachment-preview";
import { readStoredAttachmentFile } from "@/lib/attachment-storage";
import { prisma } from "@/lib/prisma";

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

  const attachment = await prisma.resourceAttachment.findUnique({
    where: {
      id,
    },
    select: {
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

  if (
    !isPreviewableAttachmentFile(attachment.originalName, attachment.mimeType)
  ) {
    return new Response("미리보기를 지원하지 않는 파일입니다.", { status: 415 });
  }

  try {
    const storedFile = await readStoredAttachmentFile({
      storageProvider: attachment.storageProvider,
      storageKey: attachment.storageKey,
    });
    const contentType =
      getAttachmentPreviewContentType(
        attachment.originalName,
        attachment.mimeType,
      ) ??
      getAttachmentPreviewContentType(
        attachment.originalName,
        storedFile.mimeType,
      ) ??
      storedFile.mimeType ??
      attachment.mimeType ??
      "application/octet-stream";

    return new Response(storedFile.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": contentType,
        "Content-Length": String(storedFile.size ?? attachment.size),
        "Content-Disposition": getContentDisposition(
          attachment.originalName,
          "inline",
        ),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("파일을 찾을 수 없습니다.", { status: 404 });
  }
}

function getContentDisposition(
  filename: string,
  disposition: "attachment" | "inline",
) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  const encoded = encodeURIComponent(filename);

  return `${disposition}; filename="${fallback || "attachment"}"; filename*=UTF-8''${encoded}`;
}
