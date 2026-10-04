import "server-only";
import { AuditAction, Prisma, type PrismaClient, type YouthDecisionUpload } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuditLogRequestData } from "@/lib/audit-log-request";
import { readYouthReports } from "@/lib/daily-report-core";
import { youthTransactionConflict, youthToday } from "@/lib/youth-mobile-context";
import { enqueueYouthDecisionFileCleanup, reconcileYouthDecisionFileQueue } from "@/lib/youth-decision-file-cleanup";
import type { YouthDecisionStorage } from "@/lib/youth-decision-uploads";
import { getYouthPurgeProgress, getYouthRetentionState, type YouthPurgeBlockedReason, type YouthPurgeResult } from "@/lib/youth-retention-core";
export type YouthPurgeContext = { actorId?: string; db?: Pick<PrismaClient, "$transaction">; now?: () => Date; storage?: YouthDecisionStorage; requestData?: AuditLogRequestData; authorize?: () => Promise<void> };
export class YouthPurgeError extends Error {
  constructor(message: string, public readonly code: "FORBIDDEN" | "INVALID_REQUEST" | "PURGE_CONFLICT" | "NOT_FOUND" = "INVALID_REQUEST") { super(message); this.name = "YouthPurgeError"; }
}
export type YouthPurgeInput = { version: number; confirmationName: string; reviewedCopies: boolean };
const include = { decisionDocuments: { select: { id: true, storageKey: true, storageProvider: true } }, notes: { select: { id: true } }, rules: { select: { id: true } }, personalSchedules: { select: { id: true } }, learningSchedules: { select: { id: true } }, academySchedules: { select: { id: true } }, dischargeExtensions: { select: { id: true } }, mathSettlement: true, _count: { select: { mathResults: true } } } as const satisfies Prisma.YouthInclude;
type Record = Prisma.YouthGetPayload<{ include: typeof include }>;
type Claim = { id: string; version: number; cleanupIds: string[] };
const nowOf = (context: YouthPurgeContext) => new Date((context.now?.() ?? new Date()).getTime());
const marker = (id: string, version: number) => `purge:${id}:${version}`;
const leaseMs = 300000, backoffMs = 3600000;
async function transaction<T>(context: YouthPurgeContext, operation: (tx: Prisma.TransactionClient) => Promise<T>, bounds: { signal?: AbortSignal; deadline?: number } = {}) {
  for (let attempt = 0; ; attempt++) try {
    bounds.signal?.throwIfAborted();
    if (bounds.deadline !== undefined && Date.now() >= bounds.deadline) throw new Error("PURGE_DEADLINE");
    await context.authorize?.();
    return await (context.db ?? prisma).$transaction(async tx => {
      if (context.actorId) {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${context.actorId} FOR SHARE`);
        const actor = await tx.user.findUnique({ where: { id: context.actorId }, select: { id: true, role: true, status: true } });
        if (!actor || actor.status !== "ACTIVE" || actor.role !== "ADMIN") throw new YouthPurgeError("권한이 없습니다.", "FORBIDDEN");
      }
      const result = await operation(tx);
      bounds.signal?.throwIfAborted();
      if (bounds.deadline !== undefined && Date.now() >= bounds.deadline) throw new Error("PURGE_DEADLINE");
      return result;
    }, { isolationLevel: "Serializable", maxWait: 10000, timeout: bounds.deadline === undefined ? 15000 : Math.max(1, Math.min(15000, bounds.deadline - Date.now())) });
  } catch (error) { if (attempt >= 2 || !youthTransactionConflict(error)) throw error; }
}
async function lockParent(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Youth" WHERE "id" = ${id} FOR UPDATE`);
  return tx.youth.findUnique({ where: { id }, include });
}
function outcome(row: Record, now: Date): YouthPurgeResult {
  const progress = getYouthPurgeProgress(row, now);
  if (!progress) throw new YouthPurgeError("파기를 요청한 기록만 확인할 수 있습니다.", "NOT_FOUND");
  return { status: row.purgedAt ? "complete" : "pending", youthId: row.id, retentionVersion: row.retentionVersion, progress };
}
async function audit(tx: Prisma.TransactionClient, id: string, context: YouthPurgeContext, now: Date, changeType: string, data: Prisma.InputJsonObject) {
  const actorId = context.actorId ?? (await approved(tx, id))?.actorId;
  if (!actorId) throw new YouthPurgeError("파기 승인 이력을 확인해 주세요.");
  await tx.auditLog.create({ data: { actorId, ...context.requestData, action: AuditAction.UPDATE_YOUTH, targetType: "YouthRetention", targetId: id, message: "청소년 기록의 보존·파기 처리를 수행했습니다.", metadata: { changeType, ...data, ...(context.actorId ? {} : { processedBySystem: true }) }, createdAt: now } });
}
async function approved(tx: Prisma.TransactionClient, id: string) {
  return tx.auditLog.findFirst({ where: { action: AuditAction.UPDATE_YOUTH, targetType: "YouthRetention", targetId: id, AND: [{ metadata: { path: ["changeType"], equals: "youth.retention.purgeStarted" } }, { metadata: { path: ["copiesReviewed"], equals: true } }] }, select: { id: true, actorId: true } });
}
function uploadScope(row: Record): Prisma.YouthDecisionUploadWhereInput { return { OR: [{ targetYouthId: row.id }, { consumedYouthId: row.id }, { sourceDocumentId: { in: row.decisionDocuments.map(file => file.id) } }] }; }
async function queueFile(tx: Prisma.TransactionClient, parent: { id: string; version: number }, ref: { storageProvider: string; storageKey: string }, kind: "staging" | "final" | "legacy", upload: YouthDecisionUpload | undefined, now: Date) {
  const old = await tx.youthDecisionFileCleanup.findUnique({ where: { storageProvider_storageKey: { storageProvider: ref.storageProvider, storageKey: ref.storageKey } } });
  if (old?.youthId && old.youthId !== parent.id) return old.id;
  if (old?.state === "done") { await tx.youthDecisionFileCleanup.update({ where: { id: old.id }, data: { sourceMutationId: marker(parent.id, parent.version), youthId: parent.id } }); return old.id; }
  const notBefore = new Date(Math.max(now.getTime(), upload?.finalizeLeaseUntil?.getTime() ?? 0, kind === "staging" ? upload?.lastGrantExpiresAt?.getTime() ?? 0 : 0));
  return enqueueYouthDecisionFileCleanup(tx, { ref, objectKind: kind, sourceUploadId: upload?.id, sourceMutationId: marker(parent.id, parent.version), youthId: parent.id, notBefore }, now);
}
async function prepareFiles(tx: Prisma.TransactionClient, row: Record, version: number, now: Date) {
  const uploads = await tx.youthDecisionUpload.findMany({ where: uploadScope(row), orderBy: { id: "asc" } }), ids = new Set<string>();
  for (const old of uploads) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "YouthDecisionUpload" WHERE "id" = ${old.id} FOR UPDATE`);
    const upload = await tx.youthDecisionUpload.findUniqueOrThrow({ where: { id: old.id } });
    if (!["consumed", "purged"].includes(upload.state)) await tx.youthDecisionUpload.update({ where: { id: upload.id }, data: { state: "deleting", terminalReason: "purge", originalName: null, mimeType: null, size: null, expectedSha256: null, plaintextSha256: null, storedSha256: null, storedSize: null } });
    if (upload.finalKey) ids.add(await queueFile(tx, { id: row.id, version }, { storageProvider: upload.storageProvider, storageKey: upload.finalKey }, "final", upload, now));
    if (upload.stagingKey) ids.add(await queueFile(tx, { id: row.id, version }, { storageProvider: upload.storageProvider, storageKey: upload.stagingKey }, "staging", upload, now));
  }
  for (const file of row.decisionDocuments) {
    const upload = uploads.find(item => item.consumedYouthId === row.id && item.consumedDocumentId === file.id && item.storageProvider === file.storageProvider && item.finalKey === file.storageKey);
    ids.add(await queueFile(tx, { id: row.id, version }, file, upload ? "final" : "legacy", upload, now));
  }
  for (const queued of await tx.youthDecisionFileCleanup.findMany({ where: { youthId: row.id }, select: { id: true } })) ids.add(queued.id);
  return Array.from(ids);
}
function eligible(row: Record, now: Date) { return !!row.actualDischargeDate && !!row.caseClosedDate && !!row.retentionUntil && row.retentionUntil < youthToday(now) && !row.retentionHoldReason && (!row._count.mathResults || !!row.mathSettlement && !row.mathSettlement.reopenedAt); }
function validate(row: Record, input: YouthPurgeInput, now: Date) {
  if (typeof input.confirmationName !== "string" || input.confirmationName.trim() !== row.name) throw new YouthPurgeError("파기할 청소년 이름을 정확히 입력하세요.");
  if (!Number.isSafeInteger(input.version) || input.version !== row.retentionVersion) throw new YouthPurgeError("기록이 변경되었습니다. 새로고침 후 파기 대상을 다시 확인하세요.", "PURGE_CONFLICT");
  const state = getYouthRetentionState({ ...row, purgeStartedAt: row.purgeStartedAt?.toISOString() ?? null, purgedAt: null }, youthToday(now));
  if (state !== "due" && state !== "purging") throw new YouthPurgeError("실제 퇴소와 상담·사후관리 완료 후 보존기간이 끝나고, 보존 보류가 없는 기록만 파기할 수 있습니다.");
  if (row.purgeLeaseUntil && row.purgeLeaseUntil > now) throw new YouthPurgeError("파기를 처리 중입니다. 잠시 후 상태를 확인하세요.", "PURGE_CONFLICT");
  if (row.purgeStartedAt && row.purgeNextCheckAt && row.purgeNextCheckAt > now) throw new YouthPurgeError("재점검 가능한 시각을 확인하세요.", "PURGE_CONFLICT");
  if (row._count.mathResults && (!row.mathSettlement || row.mathSettlement.reopenedAt)) throw new YouthPurgeError("수학 보상 정산을 먼저 확정하세요. 미정산 기록은 파기할 수 없습니다.");
}
async function claim(tx: Prisma.TransactionClient, row: Record, now: Date): Promise<Claim> {
  const version = row.retentionVersion + 1;
  const changed = await tx.youth.updateMany({ where: { id: row.id, retentionVersion: row.retentionVersion, purgedAt: null, OR: [{ purgeLeaseUntil: null }, { purgeLeaseUntil: { lte: now } }] }, data: { purgeStartedAt: row.purgeStartedAt ?? now, purgeLeaseUntil: new Date(now.getTime() + leaseMs), retentionVersion: version, purgeBlockedReason: null, purgeLastCheckedAt: now, purgeNextCheckAt: null } });
  if (changed.count !== 1) throw new YouthPurgeError("다른 관리자가 처리 중입니다. 상태를 새로고침하세요.", "PURGE_CONFLICT");
  return { id: row.id, version, cleanupIds: await prepareFiles(tx, row, version, now) };
}
async function gate(tx: Prisma.TransactionClient, row: Record, claimed: Claim, now: Date): Promise<YouthPurgeBlockedReason | null> {
  if (!eligible(row, now) || !await approved(tx, row.id)) return "PURGE_RETRY_REQUIRED";
  // Only a committed, canonical, parent-bound tracked creation is cutover proof.
  // Neither a seed/tombstone nor elapsed time proves historical writers settled.
  const creation = await tx.youthMutationReceipt.findFirst({ where: { youthId: row.id, operation: "profile.create", targetType: "Youth", targetId: row.id, state: "committed", payloadHash: { not: null } }, select: { payloadHash: true } });
  if (!creation || !/^[a-f0-9]{64}$/.test(creation.payloadHash ?? "")) return "LEGACY_WRITER_UNTRACKED";
  const uploads = await tx.youthDecisionUpload.findMany({ where: uploadScope(row) });
  if (uploads.some(item => item.lastGrantExpiresAt !== null || item.hadUnknownWrite || item.finalizeWriteEvidence === "pending" || item.finalizeWriteEvidence === "unknown" || !!item.finalizeLeaseUntil && item.finalizeLeaseUntil > now)) return "WRITE_PENDING";
  const queues = await tx.youthDecisionFileCleanup.findMany({ where: { OR: [{ youthId: row.id }, { id: { in: claimed.cleanupIds } }] } });
  if (queues.some(item => item.youthId !== row.id)) return "LIVE_REFERENCE";
  if (queues.some(item => item.objectKind === "legacy" || item.lastErrorCode === "LEGACY_WRITER_UNTRACKED")) return "LEGACY_WRITER_UNTRACKED";
  if (queues.some(item => item.objectKind !== "legacy" && !item.sourceUploadId)) return "WRITE_PENDING";
  if (queues.some(item => item.lastErrorCode === "LIVE_REFERENCE")) return "LIVE_REFERENCE";
  if (queues.some(item => ["WRITE_PENDING", "GRANT_ACTIVE", "LEASE_ACTIVE"].includes(item.lastErrorCode ?? ""))) return "WRITE_PENDING";
  if (queues.some(item => item.state !== "done")) return "FILE_CLEANUP_PENDING";
  for (const file of row.decisionDocuments) {
    const upload = uploads.find(item => item.consumedYouthId === row.id && item.consumedDocumentId === file.id && item.finalKey === file.storageKey && item.storageProvider === file.storageProvider), queued = queues.find(item => item.storageProvider === file.storageProvider && item.storageKey === file.storageKey);
    if (!upload || !queued || queued.state !== "done" || queued.sourceUploadId !== upload.id || queued.sourceMutationId !== marker(row.id, claimed.version)) return "LEGACY_WRITER_UNTRACKED";
  }
  return null;
}
async function scrub(tx: Prisma.TransactionClient, row: Record, context: YouthPurgeContext, now: Date) {
  const linkedIds = [row.id, ...[row.decisionDocuments, row.notes, row.rules, row.personalSchedules, row.learningSchedules, row.academySchedules, row.dischargeExtensions].flatMap(items => items.map(item => item.id))];
  const uploads = await tx.youthDecisionUpload.findMany({ where: uploadScope(row), select: { id: true } });
  await tx.youthMutationReceipt.updateMany({ where: { youthId: row.id }, data: { state: "purged", payloadHash: null, committedUpdatedAt: null, committedTargetsJson: Prisma.DbNull, scrubbedAt: now } });
  await tx.youthViewRequest.updateMany({ where: { youthId: row.id }, data: { state: "purged", sourceUpdatedAt: null, requestHash: null, sourceFileUpdatedAt: null, auditLogId: null, auditedAt: null, disclosureUntil: null, scrubbedAt: now } });
  await tx.youthDecisionUpload.updateMany({ where: { id: { in: uploads.map(item => item.id) } }, data: { state: "purged", originalName: null, mimeType: null, size: null, startPayloadHash: null, expectedSha256: null, plaintextSha256: null, storedSha256: null, storedSize: null, finalizeIv: null, finalizeClaimId: null, finalizeLeaseUntil: null, finalizeWriteEvidence: null, stagingKey: null, finalKey: null, sourceFileUpdatedAt: null, sourceYouthUpdatedAt: null, sourceStorageProvider: null, sourceStorageKey: null, scrubbedAt: now } });
  await tx.youthDecisionDocument.deleteMany({ where: { youthId: row.id } });
  await tx.youthFamilyContact.deleteMany({ where: { youthId: row.id } });
  await tx.youthSpecialNote.deleteMany({ where: { youthId: row.id } });
  await tx.youthDischargeExtension.deleteMany({ where: { youthId: row.id } });
  await tx.youthAcademySchedule.deleteMany({ where: { youthId: row.id } });
  await tx.youthPersonalSchedule.deleteMany({ where: { youthId: row.id } });
  await tx.youthLearningSchedule.deleteMany({ where: { youthId: row.id } });
  await tx.studyConceptCheck.deleteMany({ where: { youthId: row.id } });
  await tx.youthRule.deleteMany({ where: { targetYouthId: row.id } });
  await tx.mathResult.updateMany({ where: { studentId: row.id }, data: { memo: null } });
  await tx.mathVaultLog.updateMany({ where: { studentId: row.id }, data: { memo: null } });
  const reports = await tx.$queryRaw<Array<{ id: string; youthReports: Prisma.JsonValue }>>`SELECT "id", "youthReports" FROM "DailyWorkReport" WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof("youthReports") = 'array' THEN "youthReports" ELSE '[]'::jsonb END) item WHERE item->>'youthId' = ${row.id}) FOR UPDATE`;
  for (const report of reports) await tx.dailyWorkReport.update({ where: { id: report.id }, data: { youthReports: readYouthReports(report.youthReports).filter(item => item.youthId !== row.id), version: { increment: 1 } } });
  await tx.$executeRaw`UPDATE "AuditLog" SET "message" = '보존기간 종료로 청소년 개인정보를 파기한 이력입니다.', "metadata" = '{"personalDataPurged":true}'::jsonb WHERE ("targetType" IN ('Youth','YouthSpecialNote','YouthRule','YouthPersonalSchedule','YouthLearningSchedule','YouthAcademySchedule','YouthDischargeExtension','YouthDecisionDocument') AND "targetId" = ANY(${linkedIds}::text[])) OR strpos("metadata"::text, ${JSON.stringify(row.id)}) > 0`;
  await audit(tx, row.id, context, now, "youth.retention.purged", { decisionDocumentCount: row.decisionDocuments.length, reportCount: reports.length, copiesReviewed: true });
}
async function publishPending(context: YouthPurgeContext, claimed: Claim, reason: YouthPurgeBlockedReason) {
  return transaction(context, async tx => {
    const row = await lockParent(tx, claimed.id), now = nowOf(context);
    if (!row) throw new YouthPurgeError("기록을 찾을 수 없습니다.", "NOT_FOUND");
    if (!row.purgedAt && row.retentionVersion === claimed.version && row.purgeStartedAt) await tx.youth.updateMany({ where: { id: row.id, retentionVersion: claimed.version, purgedAt: null }, data: { purgeLeaseUntil: null, purgeBlockedReason: reason, purgeLastCheckedAt: now, purgeNextCheckAt: new Date(now.getTime() + backoffMs) } });
    return outcome(await tx.youth.findUniqueOrThrow({ where: { id: claimed.id }, include }), now);
  });
}
async function runClaim(context: YouthPurgeContext, claimed: Claim, budgetMs: number, signal?: AbortSignal): Promise<YouthPurgeResult> {
  const deadline = Date.now() + Math.min(10000, Math.max(1, budgetMs));
  try {
    signal?.throwIfAborted();
    const permitted = await transaction(context, async tx => { const row = await lockParent(tx, claimed.id); return !!row?.purgeStartedAt && !row.purgedAt && row.retentionVersion === claimed.version && eligible(row, nowOf(context)) && !!await approved(tx, row.id); }, { signal, deadline });
    if (!permitted) return publishPending(context, claimed, "PURGE_RETRY_REQUIRED");
    if (claimed.cleanupIds.length) await reconcileYouthDecisionFileQueue({ db: context.db, now: context.now, storage: context.storage }, { cleanupIds: claimed.cleanupIds, limit: 10, budgetMs: Math.max(1, deadline - Date.now()), signal });
    signal?.throwIfAborted();
    return await transaction(context, async tx => {
      const row = await lockParent(tx, claimed.id), now = nowOf(context);
      if (!row) throw new YouthPurgeError("기록을 찾을 수 없습니다.", "NOT_FOUND");
      if (row.purgedAt || row.retentionVersion !== claimed.version || !row.purgeStartedAt || !row.purgeLeaseUntil || row.purgeLeaseUntil <= now) return outcome(row, now);
      const reason = await gate(tx, row, claimed, now);
      if (reason) await tx.youth.updateMany({ where: { id: row.id, retentionVersion: claimed.version, purgedAt: null }, data: { purgeLeaseUntil: null, purgeBlockedReason: reason, purgeLastCheckedAt: now, purgeNextCheckAt: new Date(now.getTime() + backoffMs) } });
      else {
        await scrub(tx, row, context, now);
        const changed = await tx.youth.updateMany({ where: { id: row.id, retentionVersion: claimed.version, purgedAt: null, purgeLeaseUntil: { gt: now } }, data: { name: `파기된 기록 ${row.id}`, admissionDate: null, birthDate: null, age: null, initialDischargeDate: null, dischargeDate: null, phone: null, familyContact: null, familyRelationship: null, familyPhone: null, actualDischargeDate: null, caseClosedDate: null, retentionUntil: null, retentionBasis: null, retentionHoldReason: null, purgedAt: now, purgeLeaseUntil: null, retentionVersion: { increment: 1 }, purgeBlockedReason: null, purgeLastCheckedAt: now, purgeNextCheckAt: null } });
        if (changed.count !== 1) throw new YouthPurgeError("파기 상태가 변경되었습니다. 다시 확인하세요.", "PURGE_CONFLICT");
      }
      return outcome(await tx.youth.findUniqueOrThrow({ where: { id: row.id }, include }), now);
    }, { signal, deadline });
  } catch { return publishPending(context, claimed, "PURGE_RETRY_REQUIRED"); }
}
export async function requestYouthPurge(context: YouthPurgeContext, id: string, input: YouthPurgeInput): Promise<YouthPurgeResult> {
  if (!context.actorId) throw new YouthPurgeError("권한이 없습니다.", "FORBIDDEN");
  if (input.reviewedCopies !== true) throw new YouthPurgeError("자유서술 기록·외부 사본·백업의 개인정보 점검을 확인하세요.");
  const now = nowOf(context);
  const prepared = await transaction(context, async tx => {
    const row = await lockParent(tx, id);
    if (!row || row.purgedAt) throw new YouthPurgeError("이미 파기했거나 존재하지 않는 기록입니다.", "NOT_FOUND");
    validate(row, input, now);
    const claimed = await claim(tx, row, now);
    if (!row.purgeStartedAt || !await approved(tx, id)) await audit(tx, id, context, now, "youth.retention.purgeStarted", { copiesReviewed: true, purgeVersion: claimed.version });
    return claimed;
  });
  return runClaim(context, prepared, 2000);
}
export async function getYouthPurgeStatus(context: YouthPurgeContext, id: string): Promise<YouthPurgeResult> {
  if (!context.actorId) throw new YouthPurgeError("권한이 없습니다.", "FORBIDDEN");
  return transaction(context, async tx => { const row = await tx.youth.findUnique({ where: { id }, include }); if (!row) throw new YouthPurgeError("기록을 찾을 수 없습니다.", "NOT_FOUND"); return outcome(row, nowOf(context)); });
}
/** Trusted internal entry: resume only already-started, audited administrator intent. */
export async function reconcileYouthPurgeMaintenance(context: Omit<YouthPurgeContext, "actorId"> = {}, options: { limit?: number; budgetMs?: number; signal?: AbortSignal } = {}) {
  const limit = Math.min(10, Math.max(1, options.limit ?? 3)), deadline = Date.now() + Math.min(10000, Math.max(1, options.budgetMs ?? 2000));
  options.signal?.throwIfAborted();
  const now = nowOf(context);
  const candidates = await transaction(context, tx => tx.youth.findMany({ where: { purgeStartedAt: { not: null }, purgedAt: null, AND: [{ OR: [{ purgeNextCheckAt: null }, { purgeNextCheckAt: { lte: now } }] }, { OR: [{ purgeLeaseUntil: null }, { purgeLeaseUntil: { lte: now } }] }] }, orderBy: [{ purgeLastCheckedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: limit, include }));
  let checked = 0, completed = 0, pending = 0;
  for (const candidate of candidates) {
    if (Date.now() >= deadline || options.signal?.aborted) break;
    const prepared = await transaction(context, async tx => {
      options.signal?.throwIfAborted();
      const row = await lockParent(tx, candidate.id), at = nowOf(context);
      if (!row || !row.purgeStartedAt || row.purgedAt || row.purgeLeaseUntil && row.purgeLeaseUntil > at || row.purgeNextCheckAt && row.purgeNextCheckAt > at) return null;
      if (!eligible(row, at) || !await approved(tx, row.id)) { await tx.youth.updateMany({ where: { id: row.id, retentionVersion: row.retentionVersion }, data: { purgeBlockedReason: "PURGE_RETRY_REQUIRED", purgeLastCheckedAt: at, purgeNextCheckAt: new Date(at.getTime() + backoffMs) } }); return null; }
      return claim(tx, row, at);
    }, { signal: options.signal, deadline });
    checked++;
    if (!prepared) { pending++; continue; }
    const result = await runClaim(context, prepared, Math.max(1, deadline - Date.now()), options.signal);
    if (result.status === "complete") completed++; else pending++;
  }
  return { checked, completed, pending };
}
