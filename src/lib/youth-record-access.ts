import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getYouthLearningScheduleToday } from "@/lib/youth-management-core";
import { isRestrictedYouth, youthOperationalWhere } from "@/lib/youth-retention-core";

export async function requireYouthNotPurging(youthId: string, db: Pick<Prisma.TransactionClient, "youth" | "$queryRaw"> = prisma) {
  // Mutations pass their transaction: serialize writes with discharge and purge.
  if (db !== prisma) await db.$queryRaw`SELECT "id" FROM "Youth" WHERE "id" = ${youthId} FOR UPDATE`;
  const youth = await db.youth.findUnique({ where: { id: youthId }, select: {
    id: true, dischargeDate: true, actualDischargeDate: true, purgeStartedAt: true, purgedAt: true,
  } });
  if (!youth || youth.purgeStartedAt || youth.purgedAt) throw new Error("파기를 시작하거나 완료한 기록은 변경할 수 없습니다.");
  return youth;
}

export async function requireOperationalYouth(youthId: string, db: Pick<Prisma.TransactionClient, "youth" | "$queryRaw"> = prisma) {
  const youth = await requireYouthNotPurging(youthId, db);
  if (isRestrictedYouth(youth, getYouthLearningScheduleToday())) {
    throw new Error("퇴소 기록은 관리자 전용 퇴소기록 관리에서 확인하세요.");
  }
}

export async function getOperationalYouthIds(db: Pick<Prisma.TransactionClient, "youth"> = prisma) {
  const records = await db.youth.findMany({ where: youthOperationalWhere(getYouthLearningScheduleToday()), select: { id: true } });
  return records.map(record => record.id);
}

export async function operationalYouthAuditWhere(): Promise<Prisma.AuditLogWhereInput> {
  const ids = await getOperationalYouthIds();
  return { OR: [
    { targetType: "StudyConcept" },
    { targetType: "Youth", targetId: { in: ids } },
    ...ids.flatMap(id => ["youthId", "targetYouthId", "studentId"].map(key => ({ metadata: { path: [key], equals: id } }))),
    { AND: [{ metadata: { path: ["source"], equals: "youth-rules" } }, { metadata: { path: ["targetYouthId"], equals: Prisma.JsonNull } }] },
  ] };
}
