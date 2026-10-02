import "server-only";
import { AuditAction, Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { removeStoredAttachmentFiles } from "@/lib/attachment-storage";
import { prisma } from "@/lib/prisma";
import { mapYouthProfile } from "@/lib/youth-management";
import { getYouthLearningScheduleToday } from "@/lib/youth-management-core";
import { readYouthReports } from "@/lib/daily-report-core";
import {
  getYouthRetentionState, getYouthRetentionUntil, validateRetentionInput, youthRetentionBasis,
  type RetentionInput, type YouthRetentionRecord,
} from "@/lib/youth-retention-core";

const select = {
  id: true, name: true, admissionDate: true, dischargeDate: true,
  actualDischargeDate: true, caseClosedDate: true, retentionUntil: true, retentionBasis: true,
  retentionHoldReason: true, retentionVersion: true, purgeStartedAt: true, purgedAt: true,
  _count: { select: { decisionDocuments: true } },
} as const satisfies Prisma.YouthSelect;

export async function getYouthRetentionRecords() {
  await requireAdmin();
  const records = await prisma.youth.findMany({ select, orderBy: [{ name: "asc" }, { id: "asc" }] });
  return records.map(({ _count, ...row }): YouthRetentionRecord => ({
    ...row, purgeStartedAt: row.purgeStartedAt?.toISOString() ?? null,
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

export type YouthPurgeInput = { version: number; confirmationName: string; reviewedCopies: boolean };

export async function purgeYouthRecord(youthId: string, input: YouthPurgeInput) {
  const user = await requireAdmin();
  const today = getYouthLearningScheduleToday();
  if (input.reviewedCopies !== true) throw new Error("자유서술 기록·외부 사본·백업의 개인정보 점검을 확인하세요.");
  const attempt = await prisma.$transaction(async tx => {
    const record = await tx.youth.findUnique({ where: { id: youthId }, include: {
      decisionDocuments: { select: { id: true, storageKey: true, storageProvider: true } },
      notes: { select: { id: true } }, rules: { select: { id: true } },
      personalSchedules: { select: { id: true } }, learningSchedules: { select: { id: true } },
      academySchedules: { select: { id: true } }, dischargeExtensions: { select: { id: true } },
      mathSettlement: true, _count: { select: { mathResults: true } },
    } });
    if (!record || record.purgedAt) throw new Error("이미 파기했거나 존재하지 않는 기록입니다.");
    if (typeof input.confirmationName !== "string" || input.confirmationName.trim() !== record.name) throw new Error("파기할 청소년 이름을 정확히 입력하세요.");
    if (!Number.isSafeInteger(input.version) || input.version !== record.retentionVersion) throw new Error("기록이 변경되었습니다. 새로고침 후 파기 대상을 다시 확인하세요.");
    const state = getYouthRetentionState({ ...record, purgeStartedAt: record.purgeStartedAt?.toISOString() ?? null, purgedAt: null }, today);
    if (state !== "due" && state !== "purging") throw new Error("실제 퇴소와 상담·사후관리 완료 후 보존기간이 끝나고, 보존 보류가 없는 기록만 파기할 수 있습니다.");
    if (record.purgeLeaseUntil && record.purgeLeaseUntil > new Date()) throw new Error("파기를 처리 중입니다. 잠시 후 상태를 확인하세요.");
    if (record._count.mathResults && (!record.mathSettlement || record.mathSettlement.reopenedAt)) throw new Error("수학 보상 정산을 먼저 확정하세요. 미정산 기록은 파기할 수 없습니다.");
    const changed = await tx.youth.updateMany({ where: { id: youthId, retentionVersion: input.version, purgedAt: null }, data: {
      purgeStartedAt: record.purgeStartedAt ?? new Date(), purgeLeaseUntil: new Date(Date.now() + 5 * 60 * 1000), retentionVersion: { increment: 1 },
    } });
    if (changed.count !== 1) throw new Error("다른 관리자가 처리 중입니다. 상태를 새로고침하세요.");
    await audit(tx, user.id, youthId, "youth.retention.purgeStarted");
    return { files: record.decisionDocuments, version: input.version + 1,
      linkedIds: [youthId, ...[record.decisionDocuments, record.notes, record.rules, record.personalSchedules, record.learningSchedules, record.academySchedules, record.dischargeExtensions].flatMap(rows => rows.map(row => row.id))],
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  try {
    // Keep storage references until deletion succeeds. Failed deletion is retryable.
    await removeStoredAttachmentFiles(attempt.files);
    await prisma.$transaction(async tx => {
      const changed = await tx.youth.updateMany({ where: { id: youthId, retentionVersion: attempt.version, purgedAt: null }, data: {
        name: `파기된 기록 ${youthId}`, admissionDate: null, birthDate: null, age: null,
        initialDischargeDate: null, dischargeDate: null, phone: null,
        familyContact: null, familyRelationship: null, familyPhone: null,
        actualDischargeDate: null, caseClosedDate: null, retentionUntil: null,
        retentionBasis: null, retentionHoldReason: null, purgedAt: new Date(), purgeLeaseUntil: null,
        retentionVersion: { increment: 1 },
      } });
      if (changed.count !== 1) throw new Error("파기 상태가 변경되었습니다. 다시 확인하세요.");
      await tx.youthDecisionDocument.deleteMany({ where: { youthId } });
      await tx.youthFamilyContact.deleteMany({ where: { youthId } });
      await tx.youthSpecialNote.deleteMany({ where: { youthId } });
      await tx.youthDischargeExtension.deleteMany({ where: { youthId } });
      await tx.youthAcademySchedule.deleteMany({ where: { youthId } });
      await tx.youthPersonalSchedule.deleteMany({ where: { youthId } });
      await tx.youthLearningSchedule.deleteMany({ where: { youthId } });
      await tx.studyConceptCheck.deleteMany({ where: { youthId } });
      // Delete personal rules before any relation can become a common rule.
      await tx.youthRule.deleteMany({ where: { targetYouthId: youthId } });
      // Preserve the settled financial ledger, removing identifying free text.
      await tx.mathResult.updateMany({ where: { studentId: youthId }, data: { memo: null } });
      await tx.mathVaultLog.updateMany({ where: { studentId: youthId }, data: { memo: null } });

      const reports = await tx.$queryRaw<Array<{ id: string; youthReports: Prisma.JsonValue }>>`
        SELECT "id", "youthReports" FROM "DailyWorkReport"
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof("youthReports") = 'array' THEN "youthReports" ELSE '[]'::jsonb END) item WHERE item->>'youthId' = ${youthId})
        FOR UPDATE
      `;
      for (const report of reports) {
        await tx.dailyWorkReport.update({ where: { id: report.id }, data: {
          youthReports: readYouthReports(report.youthReports).filter(note => note.youthId !== youthId), version: { increment: 1 },
        } });
      }
      // The actor/action/time remain; linked personal payloads and filenames are removed.
      await tx.$executeRaw`
        UPDATE "AuditLog" SET "message" = '보존기간 종료로 청소년 개인정보를 파기한 이력입니다.', "metadata" = '{"personalDataPurged":true}'::jsonb
        WHERE ("targetType" IN ('Youth','YouthSpecialNote','YouthRule','YouthPersonalSchedule','YouthLearningSchedule','YouthAcademySchedule','YouthDischargeExtension','YouthDecisionDocument') AND "targetId" = ANY(${attempt.linkedIds}::text[]))
          OR strpos("metadata"::text, ${JSON.stringify(youthId)}) > 0
      `;
      await audit(tx, user.id, youthId, "youth.retention.purged", { decisionDocumentCount: attempt.files.length, reportCount: reports.length, copiesReviewed: true });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
  } catch (error) {
    await prisma.youth.updateMany({ where: { id: youthId, retentionVersion: attempt.version, purgedAt: null }, data: { purgeLeaseUntil: null } });
    console.error("Youth record purge requires retry", error);
    throw new Error("파기를 완료하지 못했습니다. 기록 접근은 차단되어 있으며, 같은 대상의 파기를 다시 실행할 수 있습니다.");
  }
}
