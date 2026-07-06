import { getCurrentUser } from "@/lib/auth";
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

  const document = await prisma.youthDecisionDocument.findUnique({
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

  if (!document) {
    return new Response("결정문 파일을 찾을 수 없습니다.", { status: 404 });
  }

  try {
    const storedFile = await readStoredAttachmentFile({
      storageProvider: document.storageProvider,
      storageKey: document.storageKey,
    });

    return new Response(storedFile.body, {
      headers: {
        "Content-Type":
          storedFile.mimeType ||
          document.mimeType ||
          "application/octet-stream",
        "Content-Length": String(storedFile.size ?? document.size),
        "Content-Disposition": getContentDisposition(document.originalName),
      },
    });
  } catch {
    return new Response("결정문 파일을 찾을 수 없습니다.", { status: 404 });
  }
}

function getContentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  const encoded = encodeURIComponent(filename);

  return `attachment; filename="${fallback || "decision-document"}"; filename*=UTF-8''${encoded}`;
}
