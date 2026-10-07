import "server-only";
import { queueChatPush } from "@/lib/mobile-push-events";

import { Prisma, UserStatus } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getStaffChatToday,
  getStaffChatAttachmentStatus,
  isStaffChatEmployeeActive,
  parseStaffChatId,
  parseStaffChatPeerId,
  parseStaffChatRead,
  parseStaffChatSend,
  StaffChatError,
  staffChatPageSize,
} from "@/lib/staff-chat-core";
import { lockActiveParticipants, readActiveStaffChatActor, type StaffChatContext } from "@/lib/staff-chat-actor";
import { publishStaffChatChange } from "@/lib/staff-chat-events";
import type { ChatEmployee, ChatMessage, ChatMessagePage, ChatSummary } from "@/lib/staff-chat-types";

export const messageSelect = {
  id: true, sequence: true, senderId: true, recipientId: true,
  body: true, createdAt: true, readAt: true,
  attachment: { select: {
    id: true, originalName: true, size: true,
    downloadExpiresAt: true, deletionRequestedAt: true, deletedAt: true,
  } },
} satisfies Prisma.StaffChatMessageSelect;

type MessageRecord = Prisma.StaffChatMessageGetPayload<{ select: typeof messageSelect }>;

export function mapMessage(message: MessageRecord): ChatMessage {
  return {
    id: message.id,
    sequence: message.sequence.toString(),
    senderId: message.senderId,
    recipientId: message.recipientId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    readAt: message.readAt?.toISOString() ?? null,
    attachment: message.attachment ? {
      id: message.attachment.id,
      originalName: message.attachment.originalName,
      size: message.attachment.size,
      status: getStaffChatAttachmentStatus(message.attachment),
    } : null,
  };
}

// Web and mobile callers supply the authenticated session actor, never a request
// body identity or an administrator override. Shared queries recheck that actor.
export async function getStaffChatSummary(userId: string, context: StaffChatContext = {}): Promise<ChatSummary> {
  const db = context.db ?? prisma, today = context.today ?? getStaffChatToday();
  await readActiveStaffChatActor(db, userId, today);
  await retryPendingFileDeletes(userId, { ...context, db, today });
  return db.$transaction(async tx => {
    await lockActiveParticipants(tx, userId, undefined, today);
    const users = await tx.user.findMany({
      where: {
        id: { not: userId },
        OR: [
          { status: UserStatus.ACTIVE, OR: [{ resignationDate: null }, { resignationDate: "" }, { resignationDate: { gt: today } }] },
          { sentChatMessages: { some: { recipientId: userId } } },
          { receivedChatMessages: { some: { senderId: userId } } },
        ],
      },
      orderBy: [{ department: { sortOrder: "asc" } }, { name: "asc" }, { id: "asc" }],
      select: {
        id: true, name: true, status: true, resignationDate: true,
        department: { select: { name: true } },
        position: { select: { name: true } },
        sentChatMessages: {
          where: { recipientId: userId }, orderBy: { sequence: "desc" }, take: 1, select: messageSelect,
        },
        receivedChatMessages: {
          where: { senderId: userId }, orderBy: { sequence: "desc" }, take: 1, select: messageSelect,
        },
        _count: { select: { sentChatMessages: { where: { recipientId: userId, readAt: null } } } },
      },
    });
    const employees: ChatEmployee[] = [];
    const orderedConversations = [];
    let unreadCount = 0;
    for (const user of users) {
      const peer: ChatEmployee = {
        id: user.id, name: user.name, departmentName: user.department.name,
        positionName: user.position.name, active: isStaffChatEmployeeActive(user, today),
      };
      if (peer.active) employees.push(peer);
      const incoming = user.sentChatMessages[0];
      const outgoing = user.receivedChatMessages[0];
      const lastMessage = incoming && outgoing
        ? (incoming.sequence > outgoing.sequence ? incoming : outgoing)
        : incoming ?? outgoing;
      if (!lastMessage) continue;
      const peerUnreadCount = user._count.sentChatMessages;
      unreadCount += peerUnreadCount;
      orderedConversations.push({
        sequence: lastMessage.sequence,
        conversation: { peer, lastMessage: mapMessage(lastMessage), unreadCount: peerUnreadCount },
      });
    }
    orderedConversations.sort((left, right) => left.sequence > right.sequence ? -1 : left.sequence < right.sequence ? 1 : 0);
    return { employees, conversations: orderedConversations.map((row) => row.conversation), unreadCount };
  }, { isolationLevel: "RepeatableRead" });
}

function conversationWhere(userId: string, peerId: string): Prisma.StaffChatMessageWhereInput {
  return { OR: [{ senderId: userId, recipientId: peerId }, { senderId: peerId, recipientId: userId }] };
}

export async function getStaffChatMessages(userId: string, requestedPeerId: unknown, before?: unknown, context: StaffChatContext = {}): Promise<ChatMessagePage> {
  const db = context.db ?? prisma, today = context.today ?? getStaffChatToday();
  await readActiveStaffChatActor(db, userId, today);
  const peerId = parseStaffChatPeerId(requestedPeerId, userId);
  await retryPendingFileDeletes(userId, { ...context, db, today });
  return db.$transaction(async tx => {
    await lockActiveParticipants(tx, userId, undefined, today);
    const where = conversationWhere(userId, peerId);
    let beforeSequence: bigint | undefined;
    if (before !== undefined && before !== null) {
      const cursor = await tx.staffChatMessage.findFirst({
        where: { AND: [where, { id: parseStaffChatId(before) }] }, select: { sequence: true },
      });
      if (!cursor) throw new StaffChatError("메시지를 찾을 수 없습니다.", 404);
      beforeSequence = cursor.sequence;
    }
    const messages = await tx.staffChatMessage.findMany({
      where: { AND: [where, ...(beforeSequence === undefined ? [] : [{ sequence: { lt: beforeSequence } }])] },
      orderBy: { sequence: "desc" }, take: staffChatPageSize + 1, select: messageSelect,
    });
    return {
      messages: messages.slice(0, staffChatPageSize).reverse().map(mapMessage),
      hasMore: messages.length > staffChatPageSize,
    };
  }, { isolationLevel: "RepeatableRead" });
}

export async function sendStaffChatMessage(userId: string, value: unknown, context: StaffChatContext = {}): Promise<ChatMessage> {
  const db = context.db ?? prisma, today = context.today ?? getStaffChatToday();
  const { peerId, body, requestId } = parseStaffChatSend(value, userId);
  const uniqueRequest = { senderId_requestId: { senderId: userId, requestId } };
  let result: { message: MessageRecord; replay: boolean };
  try {
    result = await db.$transaction(async tx => {
      await lockActiveParticipants(tx, userId, undefined, today);
      const existing = await tx.staffChatMessage.findUnique({ where: uniqueRequest, select: messageSelect });
      if (existing) { reuseMessage(existing, peerId, body); return { message: existing, replay: true }; }
      await lockActiveParticipants(tx, userId, peerId, today);
      const message = await tx.staffChatMessage.create({ data: { senderId: userId, recipientId: peerId, body, requestId }, select: messageSelect });
      await queueChatPush(tx, message);
      return { message, replay: false };
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return db.$transaction(async tx => {
      await lockActiveParticipants(tx, userId, undefined, today);
      const raced = await tx.staffChatMessage.findUnique({ where: uniqueRequest, select: messageSelect });
      if (!raced) throw error;
      return reuseMessage(raced, peerId, body);
    });
  }
  if (!result.replay) await publishStaffChatChange([userId, peerId]);
  return mapMessage(result.message);
}

function reuseMessage(existing: MessageRecord, peerId: string, body: string): ChatMessage {
  if (existing.recipientId !== peerId || existing.body !== body || existing.attachment) {
    throw new StaffChatError("전송 요청이 다른 메시지에 이미 사용되었습니다. 다시 전송해 주세요.", 409);
  }
  return mapMessage(existing);
}

export async function markStaffChatRead(userId: string, value: unknown, context: StaffChatContext = {}): Promise<void> {
  const db = context.db ?? prisma, today = context.today ?? getStaffChatToday();
  const { peerId, messageId } = parseStaffChatRead(value, userId);
  const changed = await db.$transaction(async tx => {
    await lockActiveParticipants(tx, userId, undefined, today);
    const viewed = await tx.staffChatMessage.findFirst({ where: { id: messageId, senderId: peerId, recipientId: userId }, select: { sequence: true } });
    if (!viewed) throw new StaffChatError("메시지를 찾을 수 없습니다.", 404);
    return tx.staffChatMessage.updateMany({ where: { senderId: peerId, recipientId: userId, readAt: null, sequence: { lte: viewed.sequence } }, data: { readAt: new Date() } });
  });
  if (changed.count) await publishStaffChatChange([userId, peerId]);
}

export async function withStaffChatUser(handler: (userId: string) => Promise<unknown>): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user || !isStaffChatEmployeeActive(user)) throw new StaffChatError("인증이 필요합니다.", 401);
    const result = await handler(user.id);
    return result instanceof Response ? result : staffChatJson(result);
  } catch (error) {
    if (error instanceof StaffChatError) return staffChatJson({ error: error.message }, error.status);
    console.error("Staff chat request failed", error instanceof Error ? error.name : "UnknownError");
    return staffChatJson({ error: "채팅을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
}

function staffChatJson(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
}

async function retryPendingFileDeletes(userId: string, context: StaffChatContext): Promise<void> {
  // A completed download remains unavailable while storage deletion is pending.
  // Reconcile it on later personal chat reads even if the original tab closed.
  try {
    const { retryPendingStaffChatFileDeletes } = await import("@/lib/staff-chat-files");
    await retryPendingStaffChatFileDeletes(userId, context);
  } catch {
    console.error("Staff chat pending file cleanup failed");
  }
}
