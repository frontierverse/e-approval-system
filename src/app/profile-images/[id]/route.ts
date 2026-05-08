import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readStoredAttachmentFile } from "@/lib/attachment-storage";

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

  const profileUser = await prisma.user.findFirst({
    where: {
      id,
      profileImageStorageKey: {
        not: null,
      },
    },
    select: {
      profileImageStorageProvider: true,
      profileImageStorageKey: true,
      profileImageMimeType: true,
      profileImageSize: true,
    },
  });

  if (!profileUser?.profileImageStorageKey) {
    return new Response("프로필 이미지를 찾을 수 없습니다.", { status: 404 });
  }

  try {
    const storedFile = await readStoredAttachmentFile({
      storageProvider: profileUser.profileImageStorageProvider,
      storageKey: profileUser.profileImageStorageKey,
    });

    const contentLength = storedFile.size ?? profileUser.profileImageSize;

    return new Response(storedFile.body, {
      headers: {
        "Cache-Control": "private, max-age=0, must-revalidate",
        "Content-Type":
          storedFile.mimeType ||
          profileUser.profileImageMimeType ||
          "application/octet-stream",
        ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
      },
    });
  } catch {
    return new Response("프로필 이미지를 찾을 수 없습니다.", { status: 404 });
  }
}
