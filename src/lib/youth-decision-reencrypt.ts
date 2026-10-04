import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { AuditAction, Prisma } from "@/generated/prisma/client";
import { YouthError, nextYouthTimestamp, youthId } from "@/lib/mobile-youth-core";
import { youthTransaction, youthPayloadHash, lockYouthRequest } from "@/lib/youth-mobile-context";
import { type YouthDecisionContext } from "@/lib/youth-decision-uploads";
import { enqueueYouthDecisionFileCleanup, queueYouthDecisionUploadFiles, reconcileYouthDecisionFileQueue } from "@/lib/youth-decision-file-cleanup";
import { isAttachmentEncryptionEnabled } from "@/lib/attachment-encryption-core";

type Snapshot = { id: string; youthId: string; updatedAt: Date; originalName: string; storageProvider: string; storageKey: string; mimeType: string; size: number; parentUpdatedAt: Date };
async function adminTransaction<T>(context: YouthDecisionContext, callback: (tx: Prisma.TransactionClient, now: Date) => Promise<T>) {
  return youthTransaction(context, async (tx, actor, _today, now) => { if (actor.role !== "ADMIN") throw new YouthError("관리자만 재암호화할 수 있습니다.", "FORBIDDEN", 403); return callback(tx, now); }, { write: true });
}
async function snapshot(tx: Prisma.TransactionClient, id: string, expected?: Snapshot): Promise<Snapshot> {
  const candidate = await tx.youthDecisionDocument.findUnique({ where: { id } }); if (!candidate) throw new YouthError("결정문을 찾을 수 없습니다.", "NOT_FOUND", 404);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Youth" WHERE "id" = ${candidate.youthId} FOR UPDATE`);
  const parent = await tx.youth.findUnique({ where: { id: candidate.youthId }, select: { updatedAt: true, purgeStartedAt: true, purgedAt: true } });
  if (!parent || parent.purgeStartedAt || parent.purgedAt) throw new YouthError("정리 중인 기록에는 파일을 추가할 수 없습니다.", "NOT_FOUND", 404);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "YouthDecisionDocument" WHERE "id" = ${id} FOR UPDATE`);
  const row = await tx.youthDecisionDocument.findUnique({ where: { id } }); if (!row || row.youthId !== candidate.youthId) throw new YouthError("결정문이 변경됐습니다.", "YOUTH_CONFLICT", 409);
  const result = { ...row, parentUpdatedAt: parent.updatedAt };
  if (expected && (result.updatedAt.getTime() !== expected.updatedAt.getTime() || result.parentUpdatedAt.getTime() !== expected.parentUpdatedAt.getTime() || result.storageProvider !== expected.storageProvider || result.storageKey !== expected.storageKey || result.size !== expected.size)) throw new YouthError("결정문이 변경됐습니다.", "YOUTH_CONFLICT", 409);
  return result;
}
async function reencryptOne(context: YouthDecisionContext, id: string) {
  const before = await adminTransaction(context, tx => snapshot(tx, id));
  const storage = context.storage ?? await import("@/lib/resource-file-storage");
  const read = await storage.readResourceStoredFile(before, { expectedSize: before.size, signal: AbortSignal.timeout(20000), beforeExpose: () => adminTransaction(context, async tx => { await snapshot(tx, id, before); }) });
  await read.body.cancel();
  if (read.encrypted) return "alreadyEncrypted" as const;
  const hash = youthPayloadHash({ documentId: id, sourceUpdatedAt: before.updatedAt.toISOString(), sourceYouthUpdatedAt: before.parentUpdatedAt.toISOString(), sourceProvider: before.storageProvider, sourceKey: before.storageKey, size: before.size, wholeSha256: read.verifiedSha256 });
  const requestId = `reencrypt_${hash.slice(0, 48)}`;
  const claim = await adminTransaction(context, async (tx, now) => {
    await snapshot(tx, id, before); await lockYouthRequest(tx, context.actorId, requestId, "youth-decision-upload");
    const old = await tx.youthDecisionUpload.findUnique({ where: { actorId_startRequestId: { actorId: context.actorId, startRequestId: requestId } } });
    if (old) {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "YouthDecisionUpload" WHERE "id" = ${old.id} FOR UPDATE`);
      if (old.sourceKind !== "legacy-reencrypt" || old.startPayloadHash !== hash || !["uploading", "finalizing"].includes(old.state)) throw new YouthError("재암호화 요청을 다시 확인하세요.", "UPLOAD_CONFLICT", 409);
      if (old.finalizeLeaseUntil && old.finalizeLeaseUntil > now) return null;
      return tx.youthDecisionUpload.update({ where: { id: old.id }, data: { state: "finalizing", finalizeClaimId: randomUUID(), finalizeLeaseUntil: new Date(now.getTime() + 90000), finalizeWriteEvidence: "pending", hadUnknownWrite: old.hadUnknownWrite || old.finalizeWriteEvidence === "pending" || old.finalizeWriteEvidence === "unknown" } });
    }
    return tx.youthDecisionUpload.create({ data: { id: randomUUID(), actorId: context.actorId, startRequestId: requestId, startPayloadHash: hash, sourceKind: "legacy-reencrypt", targetYouthId: before.youthId, originalName: before.originalName, mimeType: before.mimeType, size: before.size, expectedSha256: read.verifiedSha256, storageProvider: before.storageProvider, finalKey: `youth-decision-documents/final/${randomUUID()}`, state: "finalizing", expiresAt: new Date(now.getTime() + 7200000), finalizeClaimId: randomUUID(), finalizeLeaseUntil: new Date(now.getTime() + 90000), finalizeIv: randomBytes(12).toString("base64"), finalizeWriteEvidence: "pending", sourceDocumentId: id, sourceFileUpdatedAt: before.updatedAt, sourceStorageProvider: before.storageProvider, sourceStorageKey: before.storageKey, sourceYouthUpdatedAt: before.parentUpdatedAt, createdAt: now } });
  });
  if (!claim) return "pending" as const;
  let evidence;
  try { evidence = await storage.reencryptResourceStoredFile({ source: before, final: { storageProvider: claim.storageProvider, storageKey: claim.finalKey! }, size: before.size, wholeSha256: read.verifiedSha256, ivBase64: claim.finalizeIv!, signal: AbortSignal.timeout(20000) }); }
  catch (error) {
    const unknown = !(error && typeof error === "object" && "writeEvidence" in error && error.writeEvidence === "none");
    const retryable = await (context.db ?? (await import("@/lib/prisma")).prisma).$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "YouthDecisionUpload" WHERE "id" = ${claim.id} FOR UPDATE`);
      const current = await tx.youthDecisionUpload.findUnique({ where: { id: claim.id } });
      if (!current || current.state === "purged") return false;
      if (unknown) await tx.youthDecisionUpload.update({ where: { id: current.id }, data: { hadUnknownWrite: true } });
      if (current.state !== "finalizing" || current.finalizeClaimId !== claim.finalizeClaimId) return false;
      if (!unknown && !current.hadUnknownWrite) {
        // Proven no-write failures keep this immutable attempt available for an
        // explicit retry, which still rechecks the source and current administrator.
        await tx.youthDecisionUpload.update({ where: { id: current.id }, data: { state: "uploading", terminalReason: null, finalizeWriteEvidence: "none", finalizeClaimId: null, finalizeLeaseUntil: null } });
        return true;
      }
      await tx.youthDecisionUpload.update({ where: { id: current.id }, data: { state: "deleting", terminalReason: "reencrypt-failed", originalName: null, mimeType: null, size: null, expectedSha256: null, plaintextSha256: null, storedSha256: null, storedSize: null, finalizeWriteEvidence: "unknown", finalizeClaimId: null, finalizeLeaseUntil: null } });
      await queueYouthDecisionUploadFiles(tx, current, new Date(), undefined, before.youthId);
      return false;
    });
    return retryable ? "failed" as const : "pending" as const;
  }
  try {
    return await adminTransaction(context, async (tx, now) => {
      await snapshot(tx, id, before); await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "YouthDecisionUpload" WHERE "id" = ${claim.id} FOR UPDATE`);
      const current = await tx.youthDecisionUpload.findUnique({ where: { id: claim.id } });
      if (!current || current.state !== "finalizing" || current.finalizeClaimId !== claim.finalizeClaimId) throw new YouthError("재암호화 상태가 변경됐습니다.", "UPLOAD_CONFLICT", 409);
      if (evidence.alreadyEncrypted || evidence.writeEvidence !== "confirmed" || evidence.wholeSha256 !== read.verifiedSha256 || evidence.size !== before.size || evidence.storedSize !== before.size + 32 || evidence.encryptionIvBase64 !== claim.finalizeIv) throw new YouthError("암호화 결과를 확인하지 못했습니다.", "UPLOAD_CONFLICT", 409);
      const receiptId = randomUUID(), parentUpdatedAt = nextYouthTimestamp(before.parentUpdatedAt, now), fileUpdatedAt = nextYouthTimestamp(before.updatedAt, now);
      await tx.youthDecisionDocument.update({ where: { id }, data: { storageProvider: claim.storageProvider, storageKey: claim.finalKey!, updatedAt: fileUpdatedAt } });
      await tx.youth.update({ where: { id: before.youthId }, data: { updatedAt: parentUpdatedAt } });
      await tx.youthDecisionUpload.update({ where: { id: claim.id }, data: { state: "consumed", plaintextSha256: evidence.wholeSha256, storedSha256: evidence.storedSha256, storedSize: evidence.storedSize, completedAt: now, consumedYouthId: before.youthId, consumedDocumentId: id, consumedMutationId: receiptId, finalizeClaimId: null, finalizeLeaseUntil: null, finalizeWriteEvidence: "confirmed" } });
      await tx.youthMutationReceipt.create({ data: { id: receiptId, actorId: context.actorId, requestId, operation: "document.attach", targetType: "YouthDecisionDocument", targetId: id, youthId: before.youthId, payloadHash: hash, committedUpdatedAt: fileUpdatedAt, committedAt: now } });
      const cleanupId = await enqueueYouthDecisionFileCleanup(tx, { ref: before, objectKind: "legacy", sourceMutationId: receiptId, youthId: before.youthId }, now);
      await tx.youthDecisionUpload.update({ where: { id: claim.id }, data: { sourceCleanupId: cleanupId } });
      await tx.auditLog.create({ data: { actorId: context.actorId, ...context.requestData, action: AuditAction.UPDATE_YOUTH, targetType: "Youth", targetId: before.youthId, message: "결정문 파일을 재암호화했습니다.", metadata: { youthId: before.youthId, documentId: id, changeType: "youth.documents.reencrypt", decisionDocumentCount: 1 } } });
      return "encrypted" as const;
    });
  } catch {
    // The immutable object is still owned by its durable pre-write claim. A
    // suspended actor or purge race cannot attach it or erase its uncertainty.
    await (context.db ?? (await import("@/lib/prisma")).prisma).$transaction(async tx => {
      const changed = await tx.youthDecisionUpload.updateMany({ where: { id: claim.id, state: "finalizing", finalizeClaimId: claim.finalizeClaimId }, data: { state: "deleting", terminalReason: "reencrypt-conflict", originalName: null, mimeType: null, size: null, expectedSha256: null, plaintextSha256: null, storedSha256: null, storedSize: null, finalizeWriteEvidence: "confirmed", finalizeClaimId: null, finalizeLeaseUntil: null } });
      if (changed.count) await queueYouthDecisionUploadFiles(tx, claim, new Date(), undefined, before.youthId);
    });
    return "pending" as const;
  }
}
export async function reencryptYouthDecisionDocuments(context: YouthDecisionContext, input: { afterId?: string } = {}) {
  await adminTransaction(context, async () => undefined);
  if (!isAttachmentEncryptionEnabled()) throw new YouthError("파일 암호화 설정이 필요합니다.", "ENCRYPTION_DISABLED", 400);
  const afterId = input.afterId ? youthId(input.afterId) : undefined;
  const candidates = await adminTransaction(context, tx => tx.youthDecisionDocument.findMany({ where: { youth: { is: { purgeStartedAt: null, purgedAt: null } }, ...(afterId ? { id: { gt: afterId } } : {}) }, select: { id: true }, orderBy: { id: "asc" }, take: 11 }));
  const summary = { scanned: 0, encrypted: 0, alreadyEncrypted: 0, pending: 0, failed: 0 }; let lastId: string | null = null; const deadline = Date.now() + 40000;
  for (const item of candidates.slice(0, 10)) {
    if (Date.now() >= deadline) break;
    try { summary[await reencryptOne(context, item.id)]++; } catch (error) { if (error instanceof YouthError && [401,403].includes(error.status)) throw error; summary.failed++; }
    summary.scanned++; lastId = item.id;
  }
  if (Date.now() < deadline) {
    try {
      const own = await adminTransaction(context, tx => tx.youthDecisionUpload.findMany({ where: { actorId: context.actorId, sourceKind: "legacy-reencrypt", state: "consumed", sourceCleanupId: { not: null } }, select: { sourceCleanupId: true }, orderBy: { createdAt: "desc" }, take: 10 }));
      const cleanupIds = own.flatMap(row => row.sourceCleanupId ? [row.sourceCleanupId] : []);
      if (cleanupIds.length) await reconcileYouthDecisionFileQueue(context, { cleanupIds, limit: 3, budgetMs: Math.max(1, Math.min(2000, deadline - Date.now())) });
    } catch { /* Replacement proof survives a postcommit cleanup/authorization failure. */ }
  }
  const remaining = candidates.length > summary.scanned;
  return { ok: summary.failed === 0, summary, replacementBatchComplete: !remaining && summary.pending === 0 && summary.failed === 0, physicalCleanupComplete: false, nextCursor: remaining ? lastId ?? afterId ?? null : null };
}
