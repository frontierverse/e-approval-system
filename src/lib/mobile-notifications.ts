import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getReadableDocumentWhere } from "@/lib/approval-permissions";
import {
  mobileNotificationPageSize,
  type MobileNotificationFilters,
} from "@/lib/mobile-notifications-core";
import { prisma } from "@/lib/prisma";

export function mobileVisibleNotificationWhere(userId: string): Prisma.NotificationWhereInput {
  return { userId, document: { is: getReadableDocumentWhere(userId, "USER") } };
}

async function unreadCount(db: Pick<Prisma.TransactionClient, "notification">, userId: string) {
  return db.notification.count({
    where: { ...mobileVisibleNotificationWhere(userId), readAt: null },
  });
}

export async function getMobileNotificationPage(userId: string, filters: MobileNotificationFilters) {
  // Counts and rows must describe the same snapshot when another device reads an alert.
  return prisma.$transaction(async (tx) => {
    const visible = mobileVisibleNotificationWhere(userId);
    const where = {
      ...visible,
      ...(filters.filter === "unread" ? { readAt: null } : {}),
    };
    const [total, visibleUnreadCount] = await Promise.all([
      tx.notification.count({ where }),
      unreadCount(tx, userId),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / mobileNotificationPageSize));
    const page = Math.min(filters.page, totalPages);
    const records = await tx.notification.findMany({
      where,
      skip: (page - 1) * mobileNotificationPageSize,
      take: mobileNotificationPageSize,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        title: true,
        message: true,
        documentId: true,
        readAt: true,
        createdAt: true,
      },
    });
    return {
      filter: filters.filter,
      total,
      page,
      pageSize: mobileNotificationPageSize,
      totalPages,
      unreadCount: visibleUnreadCount,
      notifications: records.map((record) => ({
        id: record.id,
        title: record.title,
        message: record.message,
        documentId: record.documentId,
        readAt: record.readAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
      })),
    };
  }, { isolationLevel: "RepeatableRead" });
}

export async function markMobileNotificationRead(userId: string, notificationId: string) {
  return prisma.$transaction(async (tx) => {
    const where = { ...mobileVisibleNotificationWhere(userId), id: notificationId };
    const notification = await tx.notification.findFirst({ where, select: { id: true } });
    if (!notification) return null;
    const result = await tx.notification.updateMany({
      where: { ...where, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, updatedCount: result.count, unreadCount: await unreadCount(tx, userId) };
  });
}

export async function markAllMobileNotificationsRead(userId: string) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.notification.updateMany({
      where: { ...mobileVisibleNotificationWhere(userId), readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, updatedCount: result.count, unreadCount: await unreadCount(tx, userId) };
  });
}

export async function markMobileDocumentNotificationsRead(userId: string, documentId: string) {
  return prisma.$transaction(async (tx) => {
    const document = await tx.approvalDocument.findFirst({
      where: { id: documentId, ...getReadableDocumentWhere(userId, "USER") },
      select: { id: true },
    });
    if (!document) return null;
    const result = await tx.notification.updateMany({
      where: { ...mobileVisibleNotificationWhere(userId), documentId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, updatedCount: result.count, unreadCount: await unreadCount(tx, userId) };
  });
}
