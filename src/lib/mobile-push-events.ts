import "server-only";
import type { MobilePushEvent, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { dispatchMobilePushDeliveries } from "@/lib/mobile-push";
import { getReadableDocumentWhere } from "@/lib/approval-permissions";
import { getWorkLogReminderDecision } from "@/lib/work-log-reminder-core";
import { isPushEventKind, koreanPushClock, pushEventId, scheduleStart, type PushEventKind } from "@/lib/mobile-push-events-core";

export function activePushUserWhere(now = new Date()): Prisma.UserWhereInput {
  return { status: "ACTIVE", OR: [{ resignationDate: null }, { resignationDate: "" }, { resignationDate: { gt: koreanPushClock(now).date } }] };
}
type EventInput = { eventKey: string; kind: PushEventKind; targetId: string; userIds?: string[]; actorId?: string; targetVersion?: string; expiresAt?: Date; now?: Date; deferDispatch?: boolean };
// Called inside the business transaction: a rollback cannot leave an orphan push.
// Recipients are selected here, never supplied by an unauthenticated endpoint.
export async function queueStaffPushEvent(tx: Prisma.TransactionClient, input: EventInput) {
  const now = input.now ?? new Date();
  const users = await tx.user.findMany({ where: { ...activePushUserWhere(now),
    ...(input.userIds ? { id: { in: [...new Set(input.userIds)], ...(input.actorId ? { not: input.actorId } : {}) } } : input.actorId ? { id: { not: input.actorId } } : {}),
  }, select: { id: true } });
  if (!users.length) return;
  await tx.mobilePushEvent.createMany({ data: users.map(({ id }) => ({
    eventKey: input.eventKey, kind: input.kind, targetId: input.targetId,
    targetVersion: input.targetVersion ?? null, userId: id, createdAt: now,
    expiresAt: input.expiresAt ?? new Date(now.getTime() + 24 * 60 * 60_000),
  })), skipDuplicates: true });
  const events = await tx.mobilePushEvent.findMany({ where: { eventKey: input.eventKey, userId: { in: users.map(({ id }) => id) } }, select: { id: true, userId: true } });
  const subscriptions = await tx.mobilePushSubscription.findMany({ where: { session: { userId: { in: users.map(({ id }) => id) }, expiresAt: { gt: now } } }, select: { id: true, session: { select: { userId: true } } } });
  const deliveries = events.flatMap(event => subscriptions.filter(sub => sub.session.userId === event.userId).map(sub => ({ eventId: event.id, subscriptionId: sub.id })));
  if (!deliveries.length) return;
  await tx.mobilePushDelivery.createMany({ data: deliveries, skipDuplicates: true });
  if (input.deferDispatch) return;
  try {
    const { after } = await import("next/server");
    after(async () => {
      try { await dispatchMobilePushDeliveries({ eventIds: events.map(event => event.id), limit: 100, checkReceipts: false }); }
      catch { console.error("Immediate staff push dispatch failed; durable queue retained"); }
    });
  } catch {
    // Non-HTTP callers (the scheduler, migrations and isolated tests) retain the
    // durable queue. Their dispatcher drains it after the transaction commits.
  }
}
export function queueChatPush(tx: Prisma.TransactionClient, message: { id: string; senderId: string; recipientId: string; attachment?: unknown }) {
  return queueStaffPushEvent(tx, { eventKey: `chat:${message.id}`, kind: message.attachment ? "CHAT_FILE" : "CHAT_MESSAGE", targetId: message.id, userIds: [message.recipientId], actorId: message.senderId });
}

// Validate current access and current business state immediately before send or
// navigation. Stored IDs are not permission grants and are never external URLs.
export async function resolveStaffPushTarget(db: Prisma.TransactionClient, event: MobilePushEvent, user: { id: string; role: string }, forDelivery = false, now = new Date()): Promise<string | null> {
  if (event.userId !== user.id || !isPushEventKind(event.kind) || !pushEventId(event.targetId)) return null;
  if (forDelivery && event.expiresAt <= now) return null;
  const kind = event.kind;
  if (kind === "WORK_LOG_REMINDER") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event.targetId)) return null;
    if (forDelivery) {
      const decision = getWorkLogReminderDecision(now);
      if (!decision.shouldSend || event.targetId !== decision.date) return null;
    }
    return "/work-logs";
  }
  if (kind === "CHAT_MESSAGE" || kind === "CHAT_FILE") {
    const message = await db.staffChatMessage.findFirst({ where: { id: event.targetId, recipientId: user.id }, select: { senderId: true, readAt: true } });
    return message && (!forDelivery || !message.readAt) ? `/chat/${message.senderId}` : null;
  }
  if (kind.startsWith("TASK_")) {
    if (kind === "TASK_DUE" || kind === "TASK_OVERDUE") {
      const date = koreanPushClock(now).date;
      const task = await db.staffTask.findFirst({ where: { assigneeId: user.id, deletedAt: null, completedAt: null, dueDate: kind === "TASK_DUE" ? date : { lt: date } }, select: { id: true } });
      return task ? `/tasks${kind === "TASK_OVERDUE" ? "?status=overdue" : ""}` : null;
    }
    const task = await db.staffTask.findUnique({ where: { id: event.targetId }, select: { assigneeId: true, createdById: true, deletedAt: true, completedAt: true, version: true } });
    if (kind === "TASK_UNASSIGNED") return task && task.assigneeId !== user.id ? "/tasks" : null;
    if (!task || (task.assigneeId !== user.id && !(user.role === "ADMIN" && task.createdById === user.id))) return null;
    if (forDelivery && event.targetVersion && String(task.version) !== event.targetVersion) return null;
    if (forDelivery && ((["TASK_ASSIGNED", "TASK_UPDATED"].includes(kind) && task.completedAt) || (kind === "TASK_COMPLETED" && !task.completedAt) || (kind === "TASK_REOPENED" && task.completedAt) || (kind === "TASK_DELETED" ? !task.deletedAt : task.deletedAt))) return null;
    return `/tasks/${event.targetId}${task.assigneeId !== user.id ? "?assigned=1" : ""}`;
  }
  if (kind.startsWith("RESOURCE_")) {
    const resource = await db.resourcePost.findUnique({ where: { id: event.targetId }, select: { id: true, updatedAt: true } });
    return resource && (!forDelivery || !event.targetVersion || resource.updatedAt.toISOString() === event.targetVersion) ? `/resources/${resource.id}` : null;
  }
  if (kind.startsWith("WORK_SCHEDULE_")) {
    if (kind === "WORK_SCHEDULE_CANCELLED") return "/work-schedules";
    const schedule = await db.workSchedule.findUnique({ where: { id: event.targetId }, select: { id: true, scheduleDate: true, startMinute: true, updatedAt: true } });
    if (!schedule || forDelivery && event.targetVersion && schedule.updatedAt.toISOString() !== event.targetVersion) return null;
    if (forDelivery && kind === "WORK_SCHEDULE_REMINDER" && scheduleStart(schedule.scheduleDate, schedule.startMinute) <= now) return null;
    return `/work-schedules/${schedule.id}`;
  }
  if (kind === "FEATURE_UPDATE") return await db.workFeatureUpdate.findUnique({ where: { id: event.targetId }, select: { id: true } }) ? "/app-updates" : null;
  if (kind === "APPROVAL_RECALLED") {
    const recalled = await db.approvalDocument.findUnique({ where: { id: event.targetId }, select: { status: true } });
    return recalled?.status === "RECALLED" ? "/inbox" : null;
  }
  if (kind === "APPROVAL_REMINDER") {
    const pending = await db.approvalDocument.findFirst({ where: { ...getReadableDocumentWhere(user.id, "USER"), status: { in: ["SUBMITTED", "IN_PROGRESS"] }, approvalSteps: { some: { approverId: user.id, status: "PENDING", updatedAt: { lte: new Date(now.getTime() - 24 * 60 * 60_000) } } } }, select: { id: true } });
    return pending ? `/documents/${pending.id}` : null;
  }
  return null;
}
export async function openStaffPushEvent(user: { id: string; role: string }, eventId: string) {
  return prisma.$transaction(async tx => {
    if (!await tx.user.findFirst({ where: { id: user.id, ...activePushUserWhere() }, select: { id: true } })) return null;
    const event = await tx.mobilePushEvent.findFirst({ where: { id: eventId, userId: user.id } });
    return event ? resolveStaffPushTarget(tx, event, user) : null;
  });
}
