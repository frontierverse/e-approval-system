import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma, type ResourceUpload } from "@/generated/prisma/client";
import { getAttachmentPolicySnapshot } from "@/lib/attachment-policy";
import { getAttachmentStorageConfig } from "@/lib/attachment-storage-core";
import { ResourceError, parseResourceUpload, resourceId, type ResourceUploadInput, type ResourceUploadDto, type ResourceUploadGrant } from "@/lib/mobile-resources-core";
import { assertResourceManager, getResourceRecord, lockResourcePost, lockResourceRequest, resourceNow, resourceTransaction, type ResourceActor, type ResourceContext } from "@/lib/resource-library-queries";
import { resourceCanonicalHash, validateResourceUploadPolicy } from "@/lib/resource-library-mutations";
import { queueResourceUploadFiles, safelyReconcileResourceFiles } from "@/lib/resource-file-cleanup";
const lifetime = 7200000;
async function lockUpload(tx: Prisma.TransactionClient, id: string) { await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ResourceUpload" WHERE "id" = ${id} FOR UPDATE`); }
async function ownUpload(tx: Prisma.TransactionClient, actor: ResourceActor, id: string, lock = false) { if (lock) await lockUpload(tx, id); const row = await tx.resourceUpload.findUnique({ where: { id } }); if (!row || row.actorId !== actor.id || row.purpose !== "resource") throw new ResourceError("첨부파일 요청을 찾을 수 없습니다.", "NOT_FOUND", 404); return row; }
async function targetScope(tx: Prisma.TransactionClient, actor: ResourceActor, row: Pick<ResourceUpload, "targetResourceId" | "consumedResourceId" | "state">, lock = false) { const id = row.consumedResourceId ?? row.targetResourceId; if (!id) return; if (lock) await lockResourcePost(tx, id); const post = await tx.resourcePost.findUnique({ where: { id } }); if (!post) { if (["consumed", "deleting", "deleted", "expired"].includes(row.state)) return; throw new ResourceError("자료를 찾을 수 없습니다.", "NOT_FOUND", 404); } assertResourceManager(actor, post); }
async function dto(tx: Prisma.TransactionClient, row: ResourceUpload): Promise<ResourceUploadDto> { return { id: row.id, targetResourceId: row.targetResourceId, file: row.originalName && row.mimeType && row.size && row.expectedSha256 ? { name: row.originalName, mimeType: row.mimeType, size: row.size, wholeSha256: row.expectedSha256 } : null, state: row.state as ResourceUploadDto["state"], expiresAt: row.expiresAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null, consumedResourceId: row.consumedResourceId, cleanupPending: Boolean(await tx.resourceFileCleanup.count({ where: { sourceUploadId: row.id, state: { not: "done" } } })) }; }
export async function getResourceUploadStatus(context: ResourceContext, input: { id: string } | { requestId: string }) { return resourceTransaction(context, async (tx, actor) => { const row = "id" in input ? await ownUpload(tx, actor, resourceId(input.id)) : await tx.resourceUpload.findUnique({ where: { actorId_startRequestId: { actorId: actor.id, startRequestId: resourceId(input.requestId, true) } } }); if (!row || row.purpose !== "resource") throw new ResourceError("첨부파일 요청을 찾을 수 없습니다.", "NOT_FOUND", 404); await targetScope(tx, actor, row); return { upload: await dto(tx, row) }; }); }
export async function startResourceUpload(context: ResourceContext, raw: ResourceUploadInput, options: { server?: boolean } = {}): Promise<ResourceUploadGrant & { replayed: boolean }> {
  const input = parseResourceUpload(raw), { requestId, ...canonical } = input, hash = resourceCanonicalHash(canonical);
  const row = await resourceTransaction(context, async (tx, actor) => {
    await lockResourceRequest(tx, actor.id, requestId, "resource-upload");
    const old = await tx.resourceUpload.findUnique({ where: { actorId_startRequestId: { actorId: actor.id, startRequestId: requestId } } });
    if (old) { if (old.startPayloadHash !== hash) throw new ResourceError("같은 요청으로 다른 첨부파일을 등록할 수 없습니다.", "REQUEST_CONFLICT", 409); await targetScope(tx, actor, old); return { upload: old, replayed: true }; }
    if (input.targetResourceId) { await lockResourcePost(tx, input.targetResourceId); assertResourceManager(actor, await getResourceRecord(tx, input.targetResourceId)); }
    validateResourceUploadPolicy({ originalName: input.name, size: input.size }, await getAttachmentPolicySnapshot(tx));
    const config = getAttachmentStorageConfig(process.env);
    if (!config.ok || (!options.server && config.provider !== "supabase-storage")) throw new ResourceError("직접 업로드 저장소를 사용할 수 없습니다.", "STORAGE_UNAVAILABLE", 503);
    const now = resourceNow(context), id = randomUUID();
    const upload = await tx.resourceUpload.create({ data: { id, actorId: actor.id, startRequestId: requestId, startPayloadHash: hash, targetResourceId: input.targetResourceId, originalName: input.name, mimeType: input.mimeType, size: input.size, expectedSha256: input.wholeSha256, storageProvider: config.provider!, stagingKey: `resources/staging/${id}`, finalKey: `resources/final/${randomUUID()}`, expiresAt: new Date(now.getTime() + lifetime), createdAt: now } });
    return { upload, replayed: false };
  }, "Serializable", "ResourceUpload");
  const status = await getResourceUploadStatus(context, { id: row.upload.id });
  if (options.server || row.upload.state !== "uploading" || row.upload.expiresAt <= resourceNow(context)) return { ...status, grant: null, replayed: row.replayed };
  return { ...await grantResourceUpload(context, row.upload.id), replayed: row.replayed };
}
export async function grantResourceUpload(context: ResourceContext, id: string): Promise<ResourceUploadGrant> {
  id = resourceId(id);
  const prepared = await resourceTransaction(context, async (tx, actor) => {
    const candidate = await ownUpload(tx, actor, id); await targetScope(tx, actor, candidate, true); const row = await ownUpload(tx, actor, id, true), now = resourceNow(context);
    if (row.state !== "uploading" || row.hadUnknownWrite || row.finalizeWriteEvidence === "pending" || row.finalizeWriteEvidence === "unknown" || (row.finalizeLeaseUntil && row.finalizeLeaseUntil > now)) throw new ResourceError("이 첨부파일에는 업로드 권한을 다시 발급할 수 없습니다.", "UPLOAD_CONFLICT", 409);
    if (row.expiresAt <= now) throw new ResourceError("첨부파일 요청이 만료되었습니다.", "UPLOAD_EXPIRED", 410);
    if (row.storageProvider !== "supabase-storage" || !row.stagingKey || !row.mimeType) throw new ResourceError("직접 업로드 저장소를 사용할 수 없습니다.", "STORAGE_UNAVAILABLE", 503);
    const expiresAt = new Date(Math.max(now.getTime() + lifetime + 10000, row.lastGrantExpiresAt?.getTime() ?? 0));
    const updated = await tx.resourceUpload.update({ where: { id }, data: { lastGrantExpiresAt: expiresAt } });
    return { row: updated, expiresAt, upload: await dto(tx, updated) };
  }, "Serializable");
  const storage = context.storage ?? await import("@/lib/resource-file-storage");
  try {
    const grant = await storage.createResourceStagingGrant({ storageProvider: prepared.row.storageProvider, storageKey: prepared.row.stagingKey! }, { mimeType: prepared.row.mimeType!, signal: AbortSignal.timeout(10000) });
    const actualExpiry = new Date(grant.expiresAt);
    if (!Number.isFinite(actualExpiry.getTime())) throw new ResourceError("업로드 권한을 확인하지 못했습니다.", "STORAGE_UNAVAILABLE", 503);
    await resourceTransaction(context, async (tx, actor) => { const current = await ownUpload(tx, actor, id, true); await targetScope(tx, actor, current); if (current.state !== "uploading") throw new ResourceError("첨부파일 상태가 변경되었습니다.", "UPLOAD_CONFLICT", 409); await tx.resourceUpload.update({ where: { id }, data: { lastGrantExpiresAt: new Date(Math.max(current.lastGrantExpiresAt?.getTime() ?? 0, actualExpiry.getTime())) } }); });
    return { upload: prepared.upload, grant: { ...grant, expiresAt: actualExpiry.toISOString() } };
  }
  catch (error) { if (error instanceof ResourceError) throw error; throw new ResourceError("업로드 권한을 발급하지 못했습니다. 같은 요청으로 다시 시도해 주세요.", "STORAGE_UNAVAILABLE", 503); }
}
async function recordWriteOutcome(context: ResourceContext, id: string, claim: string, unknown: boolean, release: boolean) {
  return (context.db ?? (await import("@/lib/prisma")).prisma).$transaction(async tx => {
    await lockUpload(tx, id);
    const row = await tx.resourceUpload.findUnique({ where: { id } });
    if (!row) return false;
    const resumed = release && !unknown && !row.hadUnknownWrite && row.state === "finalizing" && row.finalizeClaimId === claim;
    // A stale worker can reveal an older external write remains uncertain. That
    // fact survives newer claims, but it cannot overwrite their lease/proof.
    if (unknown) await tx.resourceUpload.updateMany({ where: { id }, data: { hadUnknownWrite: true } });
    if (row.finalizeClaimId === claim) await tx.resourceUpload.updateMany({ where: { id, finalizeClaimId: claim }, data: { finalizeWriteEvidence: unknown ? "unknown" : "confirmed", ...(release ? { finalizeClaimId: null, finalizeLeaseUntil: null, ...(!unknown && !row.hadUnknownWrite && row.state === "finalizing" ? { state: "uploading" } : {}) } : {}) } });
    return resumed;
  });
}
export async function completeResourceUpload(context: ResourceContext, id: string): Promise<{ upload: ResourceUploadDto; pending: boolean }> {
  id = resourceId(id);
  const prepared = await resourceTransaction(context, async (tx, actor) => {
    const candidate = await ownUpload(tx, actor, id); await targetScope(tx, actor, candidate, true); const row = await ownUpload(tx, actor, id, true), now = resourceNow(context);
    if (row.state === "consumed") return { row, pending: false, claim: null };
    if (row.expiresAt <= now) throw new ResourceError("첨부파일 요청이 만료되었습니다.", "UPLOAD_EXPIRED", 410);
    if (row.state === "ready") return { row, pending: false, claim: null };
    if (!["uploading", "finalizing"].includes(row.state)) throw new ResourceError("이 첨부파일을 확정할 수 없습니다.", "UPLOAD_CONFLICT", 409);
    if (row.finalizeLeaseUntil && row.finalizeLeaseUntil > now) return { row, pending: true, claim: null };
    const claim = randomUUID();
    const updated = await tx.resourceUpload.update({ where: { id }, data: { state: "finalizing", finalizeClaimId: claim, finalizeLeaseUntil: new Date(now.getTime() + 90000), finalizeIv: row.finalizeIv ?? randomBytes(12).toString("base64"), finalizeWriteEvidence: "pending", hadUnknownWrite: row.hadUnknownWrite || row.finalizeWriteEvidence === "pending" || row.finalizeWriteEvidence === "unknown" } });
    return { row: updated, pending: true, claim };
  }, "Serializable");
  if (!prepared.claim) return { ...await getResourceUploadStatus(context, { id }), pending: prepared.pending };
  const storage = context.storage ?? await import("@/lib/resource-file-storage"); let evidence: Awaited<ReturnType<typeof storage.finalizeResourceStoredUpload>>;
  try { evidence = await storage.finalizeResourceStoredUpload({ staging: { storageProvider: prepared.row.storageProvider, storageKey: prepared.row.stagingKey! }, final: { storageProvider: prepared.row.storageProvider, storageKey: prepared.row.finalKey! }, size: prepared.row.size!, wholeSha256: prepared.row.expectedSha256!, ivBase64: prepared.row.finalizeIv, signal: AbortSignal.timeout(75000) }); }
  catch (error) {
    const unknown = typeof error === "object" && error !== null && "writeEvidence" in error && error.writeEvidence === "unknown";
    const resumed = await recordWriteOutcome(context, id, prepared.claim, unknown, true);
    await resourceTransaction(context, async () => undefined);
    if (resumed) throw new ResourceError("원래 파일의 업로드를 다시 시도해 주세요. 같은 첨부파일 요청을 사용합니다.", "UPLOAD_RETRY", 503);
    throw new ResourceError("첨부파일을 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.", "STORAGE_UNAVAILABLE", 503);
  }
  const validProof = evidence.writeEvidence === "confirmed" && evidence.size === prepared.row.size && evidence.wholeSha256 === prepared.row.expectedSha256 && /^[a-f0-9]{64}$/.test(evidence.storedSha256) && (evidence.storedSize === evidence.size || evidence.storedSize === evidence.size + 32);
  // Record provider outcome even if the actor is suspended during the external write.
  // This trusted fenced bookkeeping exposes no file and cannot mark business ready.
  await recordWriteOutcome(context, id, prepared.claim, !validProof, false);
  if (!validProof) throw new ResourceError("첨부파일 검증 결과가 일치하지 않습니다.", "UPLOAD_CONFLICT", 409);
  return resourceTransaction(context, async (tx, actor) => {
    const candidate = await ownUpload(tx, actor, id); await targetScope(tx, actor, candidate, true); const row = await ownUpload(tx, actor, id, true), now = resourceNow(context);
    if (row.finalizeClaimId !== prepared.claim) return { upload: await dto(tx, row), pending: row.state === "finalizing" };
    if (row.state !== "finalizing" || row.expiresAt <= now) { await tx.resourceUpload.updateMany({ where: { id, finalizeClaimId: prepared.claim }, data: { finalizeWriteEvidence: "confirmed", finalizeClaimId: null, finalizeLeaseUntil: null } }); return { upload: await dto(tx, row), pending: true }; }
    const ready = await tx.resourceUpload.update({ where: { id }, data: { state: "ready", plaintextSha256: evidence.wholeSha256, storedSha256: evidence.storedSha256, storedSize: evidence.storedSize, completedAt: now, finalizeWriteEvidence: "confirmed", finalizeClaimId: null, finalizeLeaseUntil: null } });
    return { upload: await dto(tx, ready), pending: false };
  }, "Serializable");
}
export async function cancelResourceUpload(context: ResourceContext, id: string) {
  id = resourceId(id);
  await resourceTransaction(context, async (tx, actor) => { const candidate = await ownUpload(tx, actor, id); await targetScope(tx, actor, candidate, true); const row = await ownUpload(tx, actor, id, true); if (row.state === "consumed") throw new ResourceError("이미 등록한 첨부파일은 자료 수정에서 삭제해 주세요.", "UPLOAD_CONFLICT", 409); if (["deleting", "deleted", "expired"].includes(row.state)) return; const now = resourceNow(context); await tx.resourceUpload.update({ where: { id }, data: { state: "deleting", terminalReason: row.expiresAt <= now ? "expired" : "deleted", originalName: null, mimeType: null, size: null, expectedSha256: null, plaintextSha256: null, storedSha256: null, storedSize: null } }); await queueResourceUploadFiles(tx, row, now); }, "Serializable");
  await safelyReconcileResourceFiles(context); return getResourceUploadStatus(context, { id });
}
export async function createResourceServerUpload(context: ResourceContext, input: { requestId: string; targetResourceId: string | null; file: File }) {
  await resourceTransaction(context, async () => undefined);
  if (!(input.file instanceof File) || input.file.size <= 0 || input.file.size > 314572800) throw new ResourceError("첨부파일 크기를 확인해 주세요.", "ATTACHMENT_POLICY", 400);
  const hash = createHash("sha256"), reader = input.file.stream().getReader(); let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > input.file.size) throw new ResourceError("첨부파일 크기가 일치하지 않습니다.", "UPLOAD_CONFLICT", 409); hash.update(part.value); } } finally { reader.releaseLock(); }
  if (size !== input.file.size) throw new ResourceError("첨부파일 크기가 일치하지 않습니다.", "UPLOAD_CONFLICT", 409);
  const wholeSha256 = hash.digest("hex"), started = await startResourceUpload(context, { requestId: input.requestId, targetResourceId: input.targetResourceId, name: input.file.name, mimeType: input.file.type, size, wholeSha256 }, { server: true });
  if (["ready", "consumed", "deleted", "expired", "deleting"].includes(started.upload.state)) return { upload: started.upload, pending: false };
  const claimed = await resourceTransaction(context, async (tx, actor) => { const candidate = await ownUpload(tx, actor, started.upload.id); await targetScope(tx, actor, candidate, true); const row = await ownUpload(tx, actor, candidate.id, true), now = resourceNow(context); if (row.hadUnknownWrite || row.finalizeWriteEvidence === "pending" || row.finalizeWriteEvidence === "unknown" || (row.finalizeLeaseUntil && row.finalizeLeaseUntil > now)) throw new ResourceError("첨부파일을 확인 중입니다. 같은 요청으로 다시 확인해 주세요.", "UPLOAD_CONFLICT", 409); const claim = randomUUID(); return tx.resourceUpload.update({ where: { id: row.id }, data: { finalizeClaimId: claim, finalizeLeaseUntil: new Date(now.getTime() + 90000), finalizeWriteEvidence: "pending" } }); }, "Serializable");
  const storage = context.storage ?? await import("@/lib/resource-file-storage");
  try { await storage.writeResourceStagingFile({ storageProvider: claimed.storageProvider, storageKey: claimed.stagingKey! }, { body: input.file.stream(), size, mimeType: input.file.type || "application/octet-stream", wholeSha256, signal: AbortSignal.timeout(75000) }); }
  catch (error) { const unknown = !!error && typeof error === "object" && "writeEvidence" in error && error.writeEvidence === "unknown"; await recordWriteOutcome(context, claimed.id, claimed.finalizeClaimId!, unknown, true); throw new ResourceError("첨부파일을 저장하지 못했습니다. 같은 요청으로 다시 시도해 주세요.", "STORAGE_UNAVAILABLE", 503); }
  await recordWriteOutcome(context, claimed.id, claimed.finalizeClaimId!, false, true);
  return completeResourceUpload(context, claimed.id);
}
