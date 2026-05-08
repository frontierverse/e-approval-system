import "server-only";

import { NotificationType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppNotification } from "@/lib/notification-types";

type CreateDocumentNotificationInput = {
  userId: string;
  documentId: string;
  type: NotificationType;
  title: string;
  message: string;
};

const notificationInclude = {
  document: {
    select: {
      id: true,
      title: true,
      documentNo: true,
    },
  },
} satisfies Prisma.NotificationInclude;

type NotificationRecord = Prisma.NotificationGetPayload<{
  include: typeof notificationInclude;
}>;

export async function createDocumentNotification(
  tx: Prisma.TransactionClient,
  input: CreateDocumentNotificationInput,
) {
  await tx.notification.create({
    data: input,
  });
}

export async function getNotificationSummary(userId: string, limit = 6) {
  const [unreadCount, notifications] = await Promise.all([
    prisma.notification.count({
      where: {
        userId,
        readAt: null,
      },
    }),
    prisma.notification.findMany({
      where: {
        userId,
      },
      include: notificationInclude,
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    }),
  ]);

  return {
    unreadCount,
    notifications: notifications.map(toAppNotification),
  };
}

export async function getNotifications(userId: string, limit = 30) {
  const notifications = await prisma.notification.findMany({
    where: {
      userId,
    },
    include: notificationInclude,
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });

  return notifications.map(toAppNotification);
}

export async function markNotificationRead(userId: string, notificationId: string) {
  await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });
}

export async function markDocumentNotificationsRead(
  userId: string,
  documentId: string,
) {
  await prisma.notification.updateMany({
    where: {
      userId,
      documentId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });
}

function toAppNotification(record: NotificationRecord): AppNotification {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    message: record.message,
    documentId: record.documentId,
    documentTitle: record.document.title,
    documentNo: record.document.documentNo,
    readAt: record.readAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}
