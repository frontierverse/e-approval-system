import "server-only";

import { UserStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const sendUrl = "https://exp.host/--/api/v2/push/send";
const receiptUrl = "https://exp.host/--/api/v2/push/getReceipts";
const maxAttempts = 5;
const receiptDelayMs = 15 * 60_000;
const receiptExpiryMs = 24 * 60 * 60_000;

type ExpoResult = {
  status: "ok" | "error";
  id?: string;
  details?: { error?: string };
};

type ClaimedDelivery = {
  id: string;
  subscriptionId: string;
  token: string;
  documentId: string;
  attempts: number;
};

function expoHeaders() {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(process.env.EXPO_ACCESS_TOKEN
      ? { Authorization: "Bearer " + process.env.EXPO_ACCESS_TOKEN }
      : {}),
  };
}

async function expoPost(url: string, payload: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: expoHeaders(),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Expo push HTTP " + response.status);
  return response.json();
}

function expoData(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("data" in value)) {
    throw new Error("Expo push response is invalid");
  }
  return value.data;
}

async function retryOrFail(delivery: ClaimedDelivery, reason: string) {
  const now = new Date();
  const exhausted = delivery.attempts >= maxAttempts;
  await prisma.mobilePushDelivery.updateMany({
    where: { id: delivery.id },
    data: {
      failedAt: exhausted ? now : null,
      nextAttemptAt: new Date(now.getTime() + Math.min(60, 2 ** delivery.attempts) * 60_000),
      lastError: reason.slice(0, 200),
    },
  });
}

async function sendPending(notificationId: string | undefined, limit: number) {
  const now = new Date();
  const candidates = await prisma.mobilePushDelivery.findMany({
    where: {
      ...(notificationId ? { notificationId } : {}),
      sentAt: null,
      failedAt: null,
      attempts: { lt: maxAttempts },
      nextAttemptAt: { lte: now },
    },
    take: Math.min(limit, 100),
    orderBy: { createdAt: "asc" },
    include: {
      notification: { select: { documentId: true } },
      subscription: {
        select: {
          id: true,
          expoToken: true,
          session: {
            select: { expiresAt: true, user: { select: { status: true } } },
          },
        },
      },
    },
  });
  const claimed: ClaimedDelivery[] = [];
  for (const row of candidates) {
    const claim = await prisma.mobilePushDelivery.updateMany({
      where: {
        id: row.id,
        attempts: row.attempts,
        sentAt: null,
        failedAt: null,
        nextAttemptAt: { lte: now },
      },
      data: {
        attempts: { increment: 1 },
        nextAttemptAt: new Date(Date.now() + 2 * 60_000),
      },
    });
    if (!claim.count) continue;
    if (
      row.subscription.session.expiresAt <= now ||
      row.subscription.session.user.status !== UserStatus.ACTIVE
    ) {
      await prisma.mobilePushDelivery.updateMany({
        where: { id: row.id },
        data: { failedAt: new Date(), lastError: "session_inactive" },
      });
      continue;
    }
    claimed.push({
      id: row.id,
      subscriptionId: row.subscription.id,
      token: row.subscription.expoToken,
      documentId: row.notification.documentId,
      attempts: row.attempts + 1,
    });
  }
  if (!claimed.length) return { sent: 0, failed: 0 };

  let tickets: ExpoResult[];
  try {
    const payload = claimed.map(({ token, documentId }) => ({
      to: token,
      title: "바자울",
      body: "확인할 결재 알림이 있습니다.",
      data: { documentId },
      channelId: "approvals",
      priority: "high",
      sound: "default",
    }));
    const data = expoData(await expoPost(sendUrl, payload));
    if (!Array.isArray(data) || data.length !== claimed.length) {
      throw new Error("Expo push ticket count differs");
    }
    tickets = data as ExpoResult[];
  } catch (error) {
    const reason = error instanceof Error ? error.message : "send_failed";
    await Promise.all(claimed.map((delivery) => retryOrFail(delivery, reason)));
    return { sent: 0, failed: claimed.length };
  }

  let sent = 0;
  let failed = 0;
  const invalidSubscriptions: string[] = [];
  for (let index = 0; index < claimed.length; index++) {
    const delivery = claimed[index]!;
    const ticket = tickets[index]!;
    if (ticket?.status === "ok" && typeof ticket.id === "string") {
      await prisma.mobilePushDelivery.updateMany({
        where: { id: delivery.id },
        data: { ticketId: ticket.id, sentAt: new Date(), lastError: null },
      });
      sent++;
    } else if (ticket?.details?.error === "DeviceNotRegistered") {
      invalidSubscriptions.push(delivery.subscriptionId);
      failed++;
    } else if (ticket?.details?.error === "TOO_MANY_REQUESTS") {
      await retryOrFail(delivery, "TOO_MANY_REQUESTS");
      failed++;
    } else {
      const reason = ticket?.details?.error ?? "push_ticket_error";
      await prisma.mobilePushDelivery.updateMany({
        where: { id: delivery.id },
        data: { failedAt: new Date(), lastError: reason.slice(0, 200) },
      });
      failed++;
    }
  }
  if (invalidSubscriptions.length) {
    await prisma.mobilePushSubscription.deleteMany({
      where: { id: { in: invalidSubscriptions } },
    });
  }
  return { sent, failed };
}

async function checkPendingReceipts(limit: number) {
  const now = new Date();
  const rows = await prisma.mobilePushDelivery.findMany({
    where: {
      ticketId: { not: null },
      receiptCheckedAt: null,
      sentAt: { lte: new Date(now.getTime() - receiptDelayMs) },
    },
    take: Math.min(limit, 100),
    orderBy: { sentAt: "asc" },
    select: {
      id: true,
      subscriptionId: true,
      ticketId: true,
      sentAt: true,
      attempts: true,
    },
  });
  if (!rows.length) return { checked: 0, failed: 0 };
  const data = expoData(await expoPost(receiptUrl, {
    ids: rows.map((row) => row.ticketId),
  }));
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Expo push receipts are invalid");
  }
  const receipts = data as Record<string, ExpoResult>;
  let checked = 0;
  let failed = 0;
  const invalidSubscriptions: string[] = [];
  for (const row of rows) {
    const receipt = receipts[row.ticketId!];
    if (!receipt) {
      if (row.sentAt && now.getTime() - row.sentAt.getTime() > receiptExpiryMs) {
        await prisma.mobilePushDelivery.updateMany({
          where: { id: row.id },
          data: { receiptCheckedAt: now, failedAt: now, lastError: "receipt_missing" },
        });
        failed++;
      }
      continue;
    }
    if (receipt && typeof receipt === "object" && receipt.status === "ok") {
      await prisma.mobilePushDelivery.updateMany({
        where: { id: row.id },
        data: { receiptCheckedAt: now },
      });
      checked++;
    } else if (receipt && typeof receipt === "object" && receipt.details?.error === "DeviceNotRegistered") {
      invalidSubscriptions.push(row.subscriptionId);
      failed++;
    } else if (receipt && typeof receipt === "object" && receipt.details?.error === "TOO_MANY_REQUESTS" && row.attempts < maxAttempts) {
      await prisma.mobilePushDelivery.updateMany({
        where: { id: row.id },
        data: {
          ticketId: null,
          sentAt: null,
          nextAttemptAt: new Date(now.getTime() + Math.min(60, 2 ** row.attempts) * 60_000),
          lastError: "TOO_MANY_REQUESTS",
        },
      });
      failed++;
    } else {
      await prisma.mobilePushDelivery.updateMany({
        where: { id: row.id },
        data: {
          receiptCheckedAt: now,
          failedAt: now,
          lastError: ((receipt && typeof receipt === "object" ? receipt.details?.error : null) ?? "push_receipt_error").slice(0, 200),
        },
      });
      failed++;
    }
  }
  if (invalidSubscriptions.length) {
    await prisma.mobilePushSubscription.deleteMany({
      where: { id: { in: invalidSubscriptions } },
    });
  }
  return { checked, failed };
}

export async function dispatchMobilePushDeliveries(options: {
  notificationId?: string;
  limit?: number;
  checkReceipts?: boolean;
} = {}) {
  const send = await sendPending(options.notificationId, options.limit ?? 40);
  const receipts = options.checkReceipts === false
    ? { checked: 0, failed: 0 }
    : await checkPendingReceipts(100);
  return {
    sent: send.sent,
    checked: receipts.checked,
    failed: send.failed + receipts.failed,
  };
}
