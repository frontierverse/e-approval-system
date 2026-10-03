import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getStaffChatToday, isStaffChatEmployeeActive, StaffChatError } from "@/lib/staff-chat-core";

export type StaffChatContext = { db?: PrismaClient; today?: string };
export async function readActiveStaffChatActor(db: Pick<Prisma.TransactionClient, "user">, actorId: string, today = getStaffChatToday()) {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { id: true, status: true, resignationDate: true } });
  if (!actor || !isStaffChatEmployeeActive(actor, today)) throw new StaffChatError("인증이 필요합니다.", 401);
  return actor;
}
export async function lockActiveParticipants(tx: Prisma.TransactionClient, actorId: string, peerId?: string, today = getStaffChatToday()): Promise<void> {
  const participants = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "User"
    WHERE "id" IN (${actorId}, ${peerId ?? actorId}) AND "status" = 'ACTIVE'
      AND ("resignationDate" IS NULL OR "resignationDate" = '' OR "resignationDate" > ${today})
    ORDER BY "id" FOR SHARE
  `);
  if (!participants.some(participant => participant.id === actorId)) throw new StaffChatError("인증이 필요합니다.", 401);
  if (peerId && !participants.some(participant => participant.id === peerId)) throw new StaffChatError("현재 메시지를 받을 수 없는 직원입니다.", 404);
}
