import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { getReadableDocumentWhere } from "@/lib/approval-permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  const where = {
    userId: session.userId,
    document: { is: getReadableDocumentWhere(session.userId, "USER") },
  };
  const [unreadCount, notifications] = await Promise.all([
    prisma.notification.count({ where: { ...where, readAt: null } }),
    prisma.notification.findMany({
      where,
      select: {
        id: true, title: true, message: true, documentId: true, readAt: true, createdAt: true,
      },
      take: 30,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return mobileJson({
    unreadCount,
    notifications: notifications.map((notification) => ({
      id: notification.id,
      title: notification.title,
      message: notification.message,
      documentId: notification.documentId,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt,
    })),
  });
}
