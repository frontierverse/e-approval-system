import "server-only";
import { AuditAction, Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { prisma } from "@/lib/prisma";
import { mapYouthProfile } from "@/lib/youth-management";
import { getYouthLearningScheduleToday } from "@/lib/youth-management-core";
import { readYouthReports } from "@/lib/daily-report-core";
import {
  getYouthPurgeProgress, getYouthRetentionUntil, validateRetentionInput, youthRetentionBasis,
  type RetentionInput, type YouthRetentionRecord,
} from "@/lib/youth-retention-core";

const select = {
  id: true, name: true, admissionDate: true, dischargeDate: true,
  actualDischargeDate: true, caseClosedDate: true, retentionUntil: true, retentionBasis: true,
  retentionHoldReason: true, retentionVersion: true, purgeStartedAt: true, purgedAt: true,
  purgeLeaseUntil: true, purgeBlockedReason: true, purgeLastCheckedAt: true, purgeNextCheckAt: true,
  _count: { select: { decisionDocuments: true } },
} as const satisfies Prisma.YouthSelect;

export async function getYouthRetentionRecords() {
  await requireAdmin();
  const records = await prisma.youth.findMany({ select, orderBy: [{ name: "asc" }, { id: "asc" }] });
  return records.map(({ _count, purgeLeaseUntil, purgeBlockedReason, purgeLastCheckedAt, purgeNextCheckAt, ...row }): YouthRetentionRecord => ({
    ...row,
    purgeProgress: getYouthPurgeProgress({ ...row, purgeLeaseUntil, purgeBlockedReason, purgeLastCheckedAt, purgeNextCheckAt }),
    purgeStartedAt: row.purgeStartedAt?.toISOString() ?? null,
    purgedAt: row.purgedAt?.toISOString() ?? null, decisionDocumentCount: _count.decisionDocuments,
  }));
}

async function audit(tx: Prisma.TransactionClient, actorId: string, youthId: string, changeType: string, metadata: Prisma.InputJsonObject = {}) {
  await tx.auditLog.create({ data: {
    actorId, ...(await getCurrentAuditLogRequestData()), action: AuditAction.UPDATE_YOUTH,
    targetType: "YouthRetention", targetId: youthId,
    message: "청소년 기록의 보존·파기 처리를 수행했습니다.", metadata: { changeType, ...metadata },
  } });
}

export async function saveYouthRetention(youthId: string, input: RetentionInput) {
  const user = await requireAdmin();
  const today = getYouthLearningScheduleToday();
  await prisma.$transaction(async tx => {
    const record = await tx.youth.findUnique({ where: { id: youthId }, include: { mathSettlement: { select: { reopenedAt: true } } } });
    if (!record || record.purgeStartedAt || record.purgedAt) throw new Error("파기가 시작되거나 완료된 기록은 변경할 수 없습니다.");
    const error = validateRetentionInput(input, record, today);
    if (error) throw new Error(error);
    if (record.mathSettlement?.reopenedAt === null && (input.correctedDischargeDate !== undefined || (!record.actualDischargeDate && input.actualDischargeDate !== record.dischargeDate))) {
      throw new Error("확정된 수학 보상 정산이 있습니다. 퇴소일을 변경하려면 먼저 관리자 정산 해제를 하세요.");
    }
    if (input.correctedDischargeDate !== undefined) {
      const changed = await tx.youth.updateMany({
        where: { id: youthId, retentionVersion: input.version, actualDischargeDate: null, purgeStartedAt: null, purgedAt: null },
        data: { dischargeDate: input.correctedDischargeDate, retentionVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error("기록이 변경되었습니다. 새로고침 후 다시 확인하세요.");
      await audit(tx, user.id, youthId, "youth.retention.correctPlan", { previousDischargeDate: record.dischargeDate, correctedDischargeDate: input.correctedDischargeDate });
      return;
    }
    const retentionUntil = input.caseClosedDate ? getYouthRetentionUntil(input.caseClosedDate) : null;
    const changed = await tx.youth.updateMany({
      where: { id: youthId, retentionVersion: input.version, purgeStartedAt: null, purgedAt: null },
      data: {
        actualDischargeDate: input.actualDischargeDate, caseClosedDate: input.caseClosedDate || null,
        retentionUntil, retentionBasis: youthRetentionBasis,
        retentionHoldReason: input.holdReason.trim() || null, retentionVersion: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw new Error("다른 관리자가 기록을 변경했습니다. 새로고침 후 다시 확인하세요.");
    await audit(tx, user.id, youthId, "youth.retention.save", { actualDischargeDate: input.actualDischargeDate, caseClosedDate: input.caseClosedDate || null, retentionUntil, held: Boolean(input.holdReason.trim()) });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function readRetainedYouth(youthId: string, reason: string) {
  const user = await requireAdmin();
  if (!["AFTERCARE", "OFFICIAL_REQUEST", "RETENTION_REVIEW"].includes(reason)) throw new Error("보존 기록 열람 사유를 선택하세요.");
  // Audit must succeed before sensitive data is returned.
  return prisma.$transaction(async tx => {
    const record = await tx.youth.findUnique({ where: { id: youthId }, include: {
      familyContacts: true, decisionDocuments: true, notes: true,
      dischargeExtensions: { include: { processedBy: { select: { id: true, name: true } } } },
    } });
    if (!record || !record.actualDischargeDate || record.purgeStartedAt || record.purgedAt) throw new Error("퇴소가 확정된 보존 기록만 열람할 수 있습니다.");
    await audit(tx, user.id, youthId, "youth.retention.view", { reason });
    const reports = await tx.dailyWorkReport.findMany({
      where: { submittedAt: { not: null } },
      select: { workDate: true, youthReports: true, author: { select: { name: true } } },
      orderBy: { workDate: "desc" },
    });
    return { ...mapYouthProfile(record), retainedReports: reports.flatMap(report => readYouthReports(report.youthReports)
      .filter(note => note.youthId === youthId)
      .map(note => ({ workDate: report.workDate.toISOString().slice(0, 10), authorName: report.author.name, content: note.content }))) };
  });
}

export type { YouthPurgeInput } from "@/lib/youth-purge";
export async function purgeYouthRecord(youthId: string, input: import("@/lib/youth-purge").YouthPurgeInput) {
  const user = await requireAdmin();
  const { requestYouthPurge, YouthPurgeError } = await import("@/lib/youth-purge");
  return requestYouthPurge({ actorId: user.id, requestData: await getCurrentAuditLogRequestData(), authorize: async () => { if (await getSessionUserId() !== user.id) throw new YouthPurgeError("인증이 필요합니다.", "FORBIDDEN"); } }, youthId, input);
}
