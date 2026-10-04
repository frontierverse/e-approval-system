import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma, type YouthDecisionUpload } from "@/generated/prisma/client";
import { getAttachmentStorageConfig } from "@/lib/attachment-storage-core";
import type { createResourceFileStorage } from "@/lib/resource-file-storage";
import { YouthError, youthId } from "@/lib/mobile-youth-core";
import { youthTransaction, youthPayloadHash, lockYouthRequest, lockOperationalYouth, assertYouthPermission, type YouthActor, type YouthContext } from "@/lib/youth-mobile-context";
import { parseYouthDecisionUpload, youthDecisionMaxFileSize, type YouthDecisionUploadInput, type YouthDecisionUploadDto } from "@/lib/youth-decision-file-core";
import { queueYouthDecisionUploadFiles, safelyReconcileYouthDecisionFiles } from "@/lib/youth-decision-file-cleanup";
export type YouthDecisionStorage = ReturnType<typeof createResourceFileStorage>;
export type YouthDecisionContext = YouthContext & { storage?: YouthDecisionStorage };
export type YouthDecisionUploadGrant = { upload: YouthDecisionUploadDto; grant: { method: "PUT"; url: string; headers: { "Content-Type": string }; signedExpiresAt: string } };
const lifetime = 7200000;
async function youthUploadTransaction<T>(context: YouthDecisionContext, callback: (tx: Prisma.TransactionClient, actor: YouthActor, today: string, now: Date) => Promise<T>, _isolation?: string) {
  return youthTransaction(context, async (tx, actor, today, now) => { assertYouthPermission(actor, "canManageYouth"); return callback(tx, actor, today, now); }, { write: _isolation === "Serializable" });
}
async function lockUpload(tx: Prisma.TransactionClient, id: string) { await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "YouthDecisionUpload" WHERE "id" = ${id} FOR UPDATE`); }
async function ownUpload(tx: Prisma.TransactionClient, actor: YouthActor, id: string, lock = false) { if (lock) await lockUpload(tx, id); const row = await tx.youthDecisionUpload.findUnique({ where: { id } }); if (!row || row.actorId !== actor.id || row.purpose !== "youth-decision" || row.sourceKind !== "client-file") throw new YouthError("결정문 업로드 요청을 찾을 수 없습니다.", "NOT_FOUND", 404); return row; }
async function targetScope(tx: Prisma.TransactionClient, _actor: YouthActor, row: Pick<YouthDecisionUpload, "targetYouthId" | "consumedYouthId">, today: string, lock = false) { const id = row.consumedYouthId ?? row.targetYouthId; if (id) await lockOperationalYouth(tx, id, today, { write: lock }); }
async function dto(tx: Prisma.TransactionClient, row: YouthDecisionUpload): Promise<YouthDecisionUploadDto> {
  const receipt = row.consumedMutationId ? await tx.youthMutationReceipt.findUnique({ where: { id: row.consumedMutationId }, select: { requestId: true } }) : null;
  const live = ["uploading", "finalizing", "ready"].includes(row.state);
  return { id: row.id, requestId: row.startRequestId, targetYouthId: row.targetYouthId, state: row.state as YouthDecisionUploadDto["state"], expiresAt: row.expiresAt.toISOString(), file: live && row.originalName && row.mimeType && row.size ? { originalName: row.originalName, mimeType: row.mimeType, size: row.size } : null, consumed: row.state === "consumed" && row.consumedYouthId && row.consumedDocumentId && receipt ? { youthId: row.consumedYouthId, documentId: row.consumedDocumentId, requestId: receipt!.requestId } : null };
}
export async function getYouthDecisionUploadStatus(context: YouthDecisionContext, input: { id: string } | { requestId: string }) {
  return youthUploadTransaction(context, async (tx, actor, today) => {
    const row = "id" in input ? await ownUpload(tx, actor, youthId(input.id)) : await tx.youthDecisionUpload.findUnique({ where: { actorId_startRequestId: { actorId: actor.id, startRequestId: youthId(input.requestId, true) } } });
    if (!row || row.purpose !== "youth-decision" || row.sourceKind !== "client-file") throw new YouthError("결정문 업로드 요청을 찾을 수 없습니다.", "NOT_FOUND", 404);
    const parentId = row.consumedYouthId ?? row.targetYouthId; if (parentId) await lockOperationalYouth(tx, parentId, today);
    return { upload: await dto(tx, row) };
  });
}
export async function startYouthDecisionUpload(context: YouthDecisionContext, raw: YouthDecisionUploadInput, options: { server?: boolean } = {}) {
  const input = parseYouthDecisionUpload(raw), { requestId, ...canonical } = input, hash = youthPayloadHash(canonical);
  return youthUploadTransaction(context, async (tx, actor, today, now) => {
    if (input.targetYouthId) await lockOperationalYouth(tx, input.targetYouthId, today, { write: true });
    await lockYouthRequest(tx, actor.id, requestId, "youth-decision-upload");
    const old = await tx.youthDecisionUpload.findUnique({ where: { actorId_startRequestId: { actorId: actor.id, startRequestId: requestId } } });
    if (old) { if (old.sourceKind !== "client-file" || old.startPayloadHash !== hash) throw new YouthError("같은 요청으로 다른 결정문을 등록할 수 없습니다.", "REQUEST_CONFLICT", 409); const parent = old.consumedYouthId ?? old.targetYouthId; if (parent) await lockOperationalYouth(tx, parent, today); return { upload: await dto(tx, old), replayed: true }; }
    const config = getAttachmentStorageConfig(process.env);
    if (!config.ok || (!options.server && config.provider !== "supabase-storage")) throw new YouthError("결정문 저장소를 사용할 수 없습니다.", "STORAGE_UNAVAILABLE", 503);
    const id = randomUUID();
    const row = await tx.youthDecisionUpload.create({ data: { id, actorId: actor.id, startRequestId: requestId, startPayloadHash: hash, targetYouthId: input.targetYouthId, originalName: input.originalName, mimeType: input.mimeType, size: input.size, expectedSha256: input.wholeSha256, storageProvider: config.provider!, stagingKey: `youth-decision-documents/staging/${id}`, finalKey: `youth-decision-documents/final/${randomUUID()}`, expiresAt: new Date(now.getTime() + lifetime), createdAt: now } });
    return { upload: await dto(tx, row), replayed: false };
  }, "Serializable");
}
export async function grantYouthDecisionUpload(context: YouthDecisionContext, id: string): Promise<YouthDecisionUploadGrant> {
  id = youthId(id);
  const prepared = await youthUploadTransaction(context, async (tx, actor, today, now) => {
    const candidate = await ownUpload(tx, actor, id); await targetScope(tx, actor, candidate, today, true); const row = await ownUpload(tx, actor, id, true);
    if (row.state !== "uploading" || row.hadUnknownWrite || row.finalizeWriteEvidence === "pending" || row.finalizeWriteEvidence === "unknown" || (row.finalizeLeaseUntil && row.finalizeLeaseUntil > now)) throw new YouthError("이 첨부파일에는 업로드 권한을 다시 발급할 수 없습니다.", "UPLOAD_CONFLICT", 409);
    if (row.expiresAt <= now) throw new YouthError("첨부파일 요청이 만료되었습니다.", "UPLOAD_EXPIRED", 410);
    if (row.storageProvider !== "supabase-storage" || !row.stagingKey || !row.mimeType) throw new YouthError("직접 업로드 저장소를 사용할 수 없습니다.", "STORAGE_UNAVAILABLE", 503);
    const expiresAt = new Date(Math.max(now.getTime() + lifetime + 10000, row.lastGrantExpiresAt?.getTime() ?? 0));
    const updated = await tx.youthDecisionUpload.update({ where: { id }, data: { lastGrantExpiresAt: expiresAt } });
    return { row: updated, expiresAt, upload: await dto(tx, updated) };
  }, "Serializable");
  const storage = context.storage ?? await import("@/lib/resource-file-storage");
  try {
    const grant = await storage.createResourceStagingGrant({ storageProvider: prepared.row.storageProvider, storageKey: prepared.row.stagingKey! }, { mimeType: prepared.row.mimeType!, signal: AbortSignal.timeout(10000) });
    const actualExpiry = new Date(grant.expiresAt);
    if (!Number.isFinite(actualExpiry.getTime())) throw new YouthError("업로드 권한을 확인하지 못했습니다.", "STORAGE_UNAVAILABLE", 503);
    await youthUploadTransaction(context, async (tx, actor, today) => { const current = await ownUpload(tx, actor, id, true); await targetScope(tx, actor, current, today); if (current.state !== "uploading") throw new YouthError("첨부파일 상태가 변경되었습니다.", "UPLOAD_CONFLICT", 409); await tx.youthDecisionUpload.update({ where: { id }, data: { lastGrantExpiresAt: new Date(Math.max(current.lastGrantExpiresAt?.getTime() ?? 0, actualExpiry.getTime())) } }); });
    return { ...(await getYouthDecisionUploadStatus(context, { id })), grant: { method: grant.method, url: grant.url, headers: grant.headers, signedExpiresAt: actualExpiry.toISOString() } };
  }
  catch (error) { if (error instanceof YouthError) throw error; throw new YouthError("업로드 권한을 발급하지 못했습니다. 같은 요청으로 다시 시도해 주세요.", "STORAGE_UNAVAILABLE", 503); }
}
async function recordWriteOutcome(context: YouthDecisionContext, id: string, claim: string, unknown: boolean, release: boolean) {
  return (context.db ?? (await import("@/lib/prisma")).prisma).$transaction(async tx => {
    await lockUpload(tx, id);
    const row = await tx.youthDecisionUpload.findUnique({ where: { id } });
    if (!row || row.state === "purged") return false;
    const resumed = release && !unknown && !row.hadUnknownWrite && row.state === "finalizing" && row.finalizeClaimId === claim;
    // A stale worker can reveal an older external write remains uncertain. That
    // fact survives newer claims, but it cannot overwrite their lease/proof.
    if (unknown) await tx.youthDecisionUpload.updateMany({ where: { id }, data: { hadUnknownWrite: true } });
    if (row.finalizeClaimId === claim) await tx.youthDecisionUpload.updateMany({ where: { id, finalizeClaimId: claim }, data: { finalizeWriteEvidence: unknown ? "unknown" : "confirmed", ...(release ? { finalizeClaimId: null, finalizeLeaseUntil: null, ...(!unknown && !row.hadUnknownWrite && row.state === "finalizing" ? { state: "uploading" } : {}) } : {}) } });
    return resumed;
  });
}
export async function completeYouthDecisionUpload(context: YouthDecisionContext, id: string): Promise<{ upload: YouthDecisionUploadDto; pending: boolean }> {
  id = youthId(id);
  const prepared = await youthUploadTransaction(context, async (tx, actor, today, now) => {
    const candidate = await ownUpload(tx, actor, id); await targetScope(tx, actor, candidate, today, true); const row = await ownUpload(tx, actor, id, true);
    if (row.state === "consumed") return { row, pending: false, claim: null };
    if (row.expiresAt <= now) throw new YouthError("첨부파일 요청이 만료되었습니다.", "UPLOAD_EXPIRED", 410);
    if (row.state === "ready") return { row, pending: false, claim: null };
    if (!["uploading", "finalizing"].includes(row.state)) throw new YouthError("이 첨부파일을 확정할 수 없습니다.", "UPLOAD_CONFLICT", 409);
    if (row.finalizeLeaseUntil && row.finalizeLeaseUntil > now) return { row, pending: true, claim: null };
    const claim = randomUUID();
    const updated = await tx.youthDecisionUpload.update({ where: { id }, data: { state: "finalizing", finalizeClaimId: claim, finalizeLeaseUntil: new Date(now.getTime() + 90000), finalizeIv: row.finalizeIv ?? randomBytes(12).toString("base64"), finalizeWriteEvidence: "pending", hadUnknownWrite: row.hadUnknownWrite || row.finalizeWriteEvidence === "pending" || row.finalizeWriteEvidence === "unknown" } });
    return { row: updated, pending: true, claim };
  }, "Serializable");
  if (!prepared.claim) return { ...await getYouthDecisionUploadStatus(context, { id }), pending: prepared.pending };
  const storage = context.storage ?? await import("@/lib/resource-file-storage"); let evidence: Awaited<ReturnType<typeof storage.finalizeResourceStoredUpload>>;
  try { evidence = await storage.finalizeResourceStoredUpload({ staging: { storageProvider: prepared.row.storageProvider, storageKey: prepared.row.stagingKey! }, final: { storageProvider: prepared.row.storageProvider, storageKey: prepared.row.finalKey! }, size: prepared.row.size!, wholeSha256: prepared.row.expectedSha256!, ivBase64: prepared.row.finalizeIv, signal: AbortSignal.timeout(35000) }); }
  catch (error) {
    const unknown = !(typeof error === "object" && error !== null && "writeEvidence" in error && error.writeEvidence === "none");
    const resumed = await recordWriteOutcome(context, id, prepared.claim, unknown, true);
    await youthUploadTransaction(context, async () => undefined);
    if (resumed) throw new YouthError("원래 파일의 업로드를 다시 시도해 주세요. 같은 첨부파일 요청을 사용합니다.", "UPLOAD_RETRY", 503);
    throw new YouthError("첨부파일을 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.", "STORAGE_UNAVAILABLE", 503);
  }
  const validProof = evidence.writeEvidence === "confirmed" && evidence.size === prepared.row.size && evidence.wholeSha256 === prepared.row.expectedSha256 && /^[a-f0-9]{64}$/.test(evidence.storedSha256) && (evidence.storedSize === evidence.size || evidence.storedSize === evidence.size + 32);
  // Record provider outcome even if the actor is suspended during the external write.
  // This trusted fenced bookkeeping exposes no file and cannot mark business ready.
  await recordWriteOutcome(context, id, prepared.claim, !validProof, false);
  if (!validProof) throw new YouthError("첨부파일 검증 결과가 일치하지 않습니다.", "UPLOAD_CONFLICT", 409);
  return youthUploadTransaction(context, async (tx, actor, today, now) => {
    const candidate = await ownUpload(tx, actor, id); await targetScope(tx, actor, candidate, today, true); const row = await ownUpload(tx, actor, id, true);
    if (row.finalizeClaimId !== prepared.claim) return { upload: await dto(tx, row), pending: row.state === "finalizing" };
    if (row.state !== "finalizing" || row.expiresAt <= now) { await tx.youthDecisionUpload.updateMany({ where: { id, finalizeClaimId: prepared.claim }, data: { finalizeWriteEvidence: "confirmed", finalizeClaimId: null, finalizeLeaseUntil: null } }); return { upload: await dto(tx, row), pending: true }; }
    const ready = await tx.youthDecisionUpload.update({ where: { id }, data: { state: "ready", plaintextSha256: evidence.wholeSha256, storedSha256: evidence.storedSha256, storedSize: evidence.storedSize, completedAt: now, finalizeWriteEvidence: "confirmed", finalizeClaimId: null, finalizeLeaseUntil: null } });
    return { upload: await dto(tx, ready), pending: false };
  }, "Serializable");
}
export async function cancelYouthDecisionUpload(context: YouthDecisionContext, id: string) {
  id = youthId(id);
  await youthUploadTransaction(context, async (tx, actor, today, now) => { const candidate = await ownUpload(tx, actor, id); await targetScope(tx, actor, candidate, today, true); const row = await ownUpload(tx, actor, id, true); if (row.state === "consumed") throw new YouthError("이미 등록한 첨부파일은 자료 수정에서 삭제해 주세요.", "UPLOAD_CONFLICT", 409); if (["deleting", "deleted", "expired"].includes(row.state)) return; await tx.youthDecisionUpload.update({ where: { id }, data: { state: "deleting", terminalReason: row.expiresAt <= now ? "expired" : "deleted", originalName: null, mimeType: null, size: null, expectedSha256: null, plaintextSha256: null, storedSha256: null, storedSize: null } }); await queueYouthDecisionUploadFiles(tx, row, now); }, "Serializable");
  await safelyReconcileYouthDecisionFiles(context); return getYouthDecisionUploadStatus(context, { id });
}

export async function consumeYouthDecisionUploads(tx: Prisma.TransactionClient, actorId: string, youthId: string, receiptId: string, uploadIds: string[], now: Date, options: { allowUnbound?: boolean } = {}): Promise<string[]> {
  if (uploadIds.length > 5 || new Set(uploadIds).size !== uploadIds.length) throw new YouthError("새 결정문은 최대 5개까지 첨부할 수 있습니다.");
  const documents: string[] = [];
  for (const id of [...uploadIds].sort()) {
    await lockUpload(tx, id); const upload = await tx.youthDecisionUpload.findUnique({ where: { id } });
    if (!upload || upload.actorId !== actorId || upload.purpose !== "youth-decision" || upload.sourceKind !== "client-file" || upload.state !== "ready" || upload.expiresAt <= now || (upload.targetYouthId !== youthId && !(options.allowUnbound && upload.targetYouthId === null)) || !upload.originalName || !upload.mimeType || !upload.size || !upload.finalKey || upload.expectedSha256 !== upload.plaintextSha256 || !upload.storedSha256 || !upload.storedSize || ![upload.size, upload.size + 32].includes(upload.storedSize) || upload.finalizeWriteEvidence !== "confirmed" || !upload.completedAt) throw new YouthError("확인된 결정문만 현재 청소년에게 첨부할 수 있습니다.", "UPLOAD_CONFLICT", 409);
    const document = await tx.youthDecisionDocument.create({ data: { originalName: upload.originalName, storageProvider: upload.storageProvider, storageKey: upload.finalKey, mimeType: upload.mimeType, size: upload.size, youthId, uploadedById: actorId, createdAt: now, updatedAt: now } });
    await tx.youthDecisionUpload.update({ where: { id }, data: { state: "consumed", consumedYouthId: youthId, consumedDocumentId: document.id, consumedMutationId: receiptId } });
    // Staging cleanup is purpose-bound and conservative about issued grants.
    if (upload.stagingKey) await queueYouthDecisionUploadFiles(tx, { ...upload, finalKey: null }, now, receiptId, youthId);
    documents.push(document.id);
  }
  return documents;
}

export async function createYouthDecisionServerUpload(context: YouthDecisionContext, input: { requestId: string; targetYouthId: string | null; file: File }) {
  await youthUploadTransaction(context, async () => undefined);
  if (!(input.file instanceof File) || input.file.size < 1 || input.file.size > youthDecisionMaxFileSize) throw new YouthError("결정문 파일 크기는 30MiB 이하여야 합니다.", "ATTACHMENT_POLICY", 400);
  const hash = createHash("sha256"), reader = input.file.stream().getReader(), deadline = Date.now() + 35000; let size = 0;
  try { while (true) { if (Date.now() >= deadline) throw new YouthError("파일 검증 시간이 초과됐습니다.", "STORAGE_UNAVAILABLE", 503); const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > input.file.size) throw new YouthError("파일 크기가 일치하지 않습니다.", "UPLOAD_CONFLICT", 409); hash.update(part.value); } } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (size !== input.file.size) throw new YouthError("파일 크기가 일치하지 않습니다.", "UPLOAD_CONFLICT", 409);
  const wholeSha256 = hash.digest("hex"), started = await startYouthDecisionUpload(context, { requestId: input.requestId, targetYouthId: input.targetYouthId, originalName: input.file.name, mimeType: input.file.type || "application/octet-stream", size, wholeSha256 }, { server: true });
  if (["ready", "consumed", "deleted", "expired", "deleting", "purged"].includes(started.upload.state)) return { upload: started.upload, pending: false };
  const claimed = await youthUploadTransaction(context, async (tx, actor, today, now) => {
    const candidate = await ownUpload(tx, actor, started.upload.id); await targetScope(tx, actor, candidate, today, true); const row = await ownUpload(tx, actor, candidate.id, true);
    if (row.hadUnknownWrite || row.finalizeWriteEvidence === "pending" || row.finalizeWriteEvidence === "unknown" || (row.finalizeLeaseUntil && row.finalizeLeaseUntil > now)) throw new YouthError("결정문을 확인 중입니다. 같은 요청으로 상태를 확인하세요.", "UPLOAD_CONFLICT", 409);
    const claim = randomUUID(); return tx.youthDecisionUpload.update({ where: { id: row.id }, data: { finalizeClaimId: claim, finalizeLeaseUntil: new Date(now.getTime() + 90000), finalizeWriteEvidence: "pending" } });
  }, "Serializable");
  const storage = context.storage ?? await import("@/lib/resource-file-storage");
  try { await storage.writeResourceStagingFile({ storageProvider: claimed.storageProvider, storageKey: claimed.stagingKey! }, { body: input.file.stream(), size, mimeType: input.file.type || "application/octet-stream", wholeSha256, signal: AbortSignal.timeout(35000) }); }
  catch (error) { const unknown = !(error && typeof error === "object" && "writeEvidence" in error && error.writeEvidence === "none"); await recordWriteOutcome(context, claimed.id, claimed.finalizeClaimId!, unknown, true); throw new YouthError("결정문을 저장하지 못했습니다. 같은 요청으로 상태를 확인하세요.", "STORAGE_UNAVAILABLE", 503); }
  await recordWriteOutcome(context, claimed.id, claimed.finalizeClaimId!, false, true);
  return completeYouthDecisionUpload(context, claimed.id);
}
