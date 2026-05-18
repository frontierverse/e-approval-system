import { UserRole } from "@/generated/prisma/client";
import { readStoredAttachmentFile } from "@/lib/attachment-storage";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const viewer = await getCurrentUser();

  if (!viewer) {
    return new Response("인증이 필요합니다.", { status: 401 });
  }

  if (viewer.id !== id && viewer.role !== UserRole.ADMIN) {
    return new Response("권한이 없습니다.", { status: 403 });
  }

  const signatureUser = await prisma.user.findFirst({
    where: {
      id,
      signatureImageStorageKey: {
        not: null,
      },
    },
    select: {
      signatureImageStorageProvider: true,
      signatureImageStorageKey: true,
      signatureImageMimeType: true,
      signatureImageSize: true,
    },
  });

  if (!signatureUser?.signatureImageStorageKey) {
    return new Response("결재 도장/서명 이미지를 찾을 수 없습니다.", {
      status: 404,
    });
  }

  try {
    const storedFile = await readStoredAttachmentFile({
      storageProvider: signatureUser.signatureImageStorageProvider,
      storageKey: signatureUser.signatureImageStorageKey,
    });
    const contentLength = storedFile.size ?? signatureUser.signatureImageSize;

    return new Response(storedFile.body, {
      headers: {
        "Cache-Control": "private, max-age=0, must-revalidate",
        "Content-Type":
          storedFile.mimeType ||
          signatureUser.signatureImageMimeType ||
          "application/octet-stream",
        ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
      },
    });
  } catch {
    return new Response("결재 도장/서명 이미지를 찾을 수 없습니다.", {
      status: 404,
    });
  }
}
