import "server-only";

import { Prisma, UserStatus } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getStaffChatToday,
  isStaffChatEmployeeActive,
  parseStaffChatId,
  parseStaffChatPeerId,
  parseStaffChatRead,
  parseStaffChatSend,
  StaffChatError,
  staffChatPageSize,
} from "@/lib/staff-chat-core";
import { publishStaffChatChange } from "@/lib/staff-chat-events";
import type { ChatEmployee, ChatMessage, ChatMessagePage, ChatSummary } from "@/lib/staff-chat-types";

const messageSelect = {
  id: true, sequence: true, senderId: true, recipientId: true,
  body: true, createdAt: true, readAt: true,
} satisfies Prisma.StaffChatMessageSelect;

type MessageRecord = Prisma.StaffChatMessageGetPayload<{ select: typeof messageSelect }>;

function mapMessage(message: MessageRecord): ChatMessage {
  return {
    id: message.id,
    sequence: message.sequence.toString(),
    senderId: message.senderId,
    recipientId: message.recipientId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    readAt: message.readAt?.toISOString() ?? null,
  };
}

// Every caller is authenticated by withStaffChatUser. The actor id is always
// supplied by the session, never by a request body or an administrator override.
export async function getStaffChatSummary(userId: string): Promise<ChatSummary> {
  const today = getStaffChatToday();
  const users = await prisma.user.findMany({
    where: {
      id: { not: userId },
      OR: [
        { status: UserStatus.ACTIVE, OR: [{ resignationDate: null }, { resignationDate: { gt: today } }] },
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
}

function conversationWhere(userId: string, peerId: string): Prisma.StaffChatMessageWhereInput {
  return { OR: [{ senderId: userId, recipientId: peerId }, { senderId: peerId, recipientId: userId }] };
}

export async function getStaffChatMessages(userId: string, requestedPeerId: unknown, before?: unknown): Promise<ChatMessagePage> {
  const peerId = parseStaffChatPeerId(requestedPeerId, userId);
  const where = conversationWhere(userId, peerId);
  let beforeSequence: bigint | undefined;
  if (before !== undefined && before !== null) {
    const cursor = await prisma.staffChatMessage.findFirst({
      where: { AND: [where, { id: parseStaffChatId(before) }] }, select: { sequence: true },
    });
    if (!cursor) throw new StaffChatError("메시지를 찾을 수 없습니다.", 404);
    beforeSequence = cursor.sequence;
  }
  const messages = await prisma.staffChatMessage.findMany({
    where: { AND: [where, ...(beforeSequence === undefined ? [] : [{ sequence: { lt: beforeSequence } }])] },
    orderBy: { sequence: "desc" }, take: staffChatPageSize + 1, select: messageSelect,
  });
  return {
    messages: messages.slice(0, staffChatPageSize).reverse().map(mapMessage),
    hasMore: messages.length > staffChatPageSize,
  };
}

export async function sendStaffChatMessage(userId: string, value: unknown): Promise<ChatMessage> {
  const { peerId, body, requestId } = parseStaffChatSend(value, userId);
  const uniqueRequest = { senderId_requestId: { senderId: userId, requestId } };
  const existing = await prisma.staffChatMessage.findUnique({ where: uniqueRequest, select: messageSelect });
  if (existing) return reuseMessage(existing, peerId, body);

  let message: MessageRecord;
  try {
    message = await prisma.$transaction(async (tx) => {
      // Hold both eligibility checks through the insert. Deactivation or a
      // resignation-date edit must wait until this send has committed.
      const participants = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "User"
        WHERE "id" IN (${userId}, ${peerId}) AND "status" = 'ACTIVE'
          AND ("resignationDate" IS NULL OR "resignationDate" > ${getStaffChatToday()})
        ORDER BY "id" FOR SHARE
      `);
      if (!participants.some((participant) => participant.id === userId)) {
        throw new StaffChatError("인증이 필요합니다.", 401);
      }
      if (!participants.some((participant) => participant.id === peerId)) {
        throw new StaffChatError("현재 메시지를 받을 수 없는 직원입니다.", 404);
      }
      return tx.staffChatMessage.create({
        data: { senderId: userId, recipientId: peerId, body, requestId }, select: messageSelect,
      });
    });
  } catch (error) {
    // A retry can arrive before the original request has returned. The database
    // uniqueness constraint serializes those writes without duplicate messages.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const racedMessage = await prisma.staffChatMessage.findUnique({ where: uniqueRequest, select: messageSelect });
    if (!racedMessage) throw error;
    return reuseMessage(racedMessage, peerId, body);
  }
  await publishStaffChatChange([userId, peerId]);
  return mapMessage(message);
}

function reuseMessage(existing: MessageRecord, peerId: string, body: string): ChatMessage {
  if (existing.recipientId !== peerId || existing.body !== body) {
    throw new StaffChatError("전송 요청이 다른 메시지에 이미 사용되었습니다. 다시 전송해 주세요.", 409);
  }
  return mapMessage(existing);
}

export async function markStaffChatRead(userId: string, value: unknown): Promise<void> {
  const { peerId, messageId } = parseStaffChatRead(value, userId);
  const viewedMessage = await prisma.staffChatMessage.findFirst({
    where: { id: messageId, senderId: peerId, recipientId: userId }, select: { sequence: true },
  });
  if (!viewedMessage) throw new StaffChatError("메시지를 찾을 수 없습니다.", 404);
  const changed = await prisma.staffChatMessage.updateMany({
    where: {
      senderId: peerId, recipientId: userId, readAt: null,
      sequence: { lte: viewedMessage.sequence },
    },
    data: { readAt: new Date() },
  });
  if (changed.count) await publishStaffChatChange([userId, peerId]);
}

export async function withStaffChatUser(handler: (userId: string) => Promise<unknown>): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user || !isStaffChatEmployeeActive(user)) throw new StaffChatError("인증이 필요합니다.", 401);
    return staffChatJson(await handler(user.id));
  } catch (error) {
    if (error instanceof StaffChatError) return staffChatJson({ error: error.message }, error.status);
    console.error("Staff chat request failed", error instanceof Error ? error.name : "UnknownError");
    return staffChatJson({ error: "채팅을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
}

function staffChatJson(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
}
