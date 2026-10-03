import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type ResourceFileCleanup } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockResourceActor, resourceNow, type ResourceContext, type ResourceStoragePorts, type ResourceStorageRef } from "@/lib/resource-library-queries";

export const resourceCleanupErrorCodes = ["STORAGE_DELETE_FAILED", "WRITE_PENDING", "LIVE_REFERENCE", "GRANT_ACTIVE", "LEASE_ACTIVE", "NOT_ABSENT"] as const;
export type ResourceCleanupContext = { actorId?: string; db?: Pick<PrismaClient, "$transaction">; now?: () => Date; storage?: ResourceStoragePorts };
const nowOf = (context: ResourceCleanupContext) => new Date((context.now?.() ?? new Date()).getTime());
export async function enqueueResourceFileCleanup(tx: Prisma.TransactionClient, input: { ref: ResourceStorageRef; objectKind: "staging" | "final" | "legacy"; sourceUploadId?: string; sourceMutationId?: string; notBefore?: Date }, now: Date): Promise<string> {
  await tx.$queryRaw(Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtext('resource-file-cleanup'), hashtext(${input.ref.storageProvider + ":" + input.ref.storageKey}))`);
  const where = { storageProvider_storageKey: input.ref }, old = await tx.resourceFileCleanup.findUnique({ where });
  const notBefore = new Date(Math.max(now.getTime(), input.notBefore?.getTime() ?? 0, old?.notBefore.getTime() ?? 0));
  const row = await tx.resourceFileCleanup.upsert({ where, create: { ...input.ref, objectKind: input.objectKind, sourceUploadId: input.sourceUploadId ?? null, sourceMutationId: input.sourceMutationId ?? null, notBefore, nextAttemptAt: notBefore }, update: { ...(input.sourceUploadId && !old?.sourceUploadId ? { sourceUploadId: input.sourceUploadId, objectKind: input.objectKind } : {}), notBefore, nextAttemptAt: notBefore, state: "pending", claimId: null, leaseUntil: null, completedAt: null, lastErrorCode: null } });
  return row.id;
}
export async function queueResourceUploadFiles(tx: Prisma.TransactionClient, upload: { id: string; storageProvider: string; stagingKey: string | null; finalKey: string | null; lastGrantExpiresAt: Date | null; finalizeLeaseUntil: Date | null }, now: Date, mutationId?: string) {
  const result: string[] = [], notBefore = new Date(Math.max(now.getTime(), upload.lastGrantExpiresAt?.getTime() ?? 0, upload.finalizeLeaseUntil?.getTime() ?? 0));
  for (const [objectKind, storageKey] of [["final", upload.finalKey], ["staging", upload.stagingKey]] as const) if (storageKey) result.push(await enqueueResourceFileCleanup(tx, { ref: { storageProvider: upload.storageProvider, storageKey }, objectKind, sourceUploadId: upload.id, sourceMutationId: mutationId, notBefore: objectKind === "staging" ? notBefore : new Date(Math.max(now.getTime(), upload.finalizeLeaseUntil?.getTime() ?? 0)) }, now));
  return result;
}
async function cleanupTransaction<T>(context: ResourceCleanupContext, operation: (tx: Prisma.TransactionClient) => Promise<T>) { return (context.db ?? prisma).$transaction(async tx => { if (context.actorId) await lockResourceActor(tx, context.actorId); return operation(tx); }, { timeout: 10000 }); }
async function pendingReason(tx: Prisma.TransactionClient, row: ResourceFileCleanup, now: Date) {
  if (await tx.resourceAttachment.count({ where: { storageProvider: row.storageProvider, storageKey: row.storageKey } })) return "LIVE_REFERENCE" as const;
  // Legacy generic keys can be shared with document files. Never delete a live owner.
  if (await tx.attachment.count({ where: { storageProvider: row.storageProvider, storageKey: row.storageKey } })) return "LIVE_REFERENCE" as const;
  if (await tx.youthDecisionDocument.count({ where: { storageProvider: row.storageProvider, storageKey: row.storageKey } })) return "LIVE_REFERENCE" as const;
  const imageProviders = row.storageProvider === "local" ? ["local", null] : [row.storageProvider];
  if (await tx.user.count({ where: { OR: imageProviders.flatMap(provider => [{ profileImageStorageProvider: provider, profileImageStorageKey: row.storageKey }, { signatureImageStorageProvider: provider, signatureImageStorageKey: row.storageKey }]) } })) return "LIVE_REFERENCE" as const;
  if (await tx.mobileDraftUpload.count({ where: { storageProvider: row.storageProvider, storageKey: row.storageKey } })) return "LIVE_REFERENCE" as const;
  if (await tx.staffChatAttachment.count({ where: { storageProvider: row.storageProvider, storageKey: row.storageKey, deletedAt: null } })) return "LIVE_REFERENCE" as const;
  if (!row.sourceUploadId) return null;
  const upload = await tx.resourceUpload.findUnique({ where: { id: row.sourceUploadId } });
  if (!upload) return null;
  if (row.objectKind === "staging" && upload.lastGrantExpiresAt && upload.lastGrantExpiresAt > now) return "GRANT_ACTIVE" as const;
  if (upload.finalizeLeaseUntil && upload.finalizeLeaseUntil > now) return "LEASE_ACTIVE" as const;
  // A timed-out lease never proves that the provider has stopped accepting bytes.
  if ((row.objectKind === "staging" && upload.lastGrantExpiresAt !== null) || upload.hadUnknownWrite || upload.finalizeWriteEvidence === "pending" || upload.finalizeWriteEvidence === "unknown") return "WRITE_PENDING" as const;
  return null;
}
async function minimizeTerminalUpload(tx: Prisma.TransactionClient, id: string, now: Date) {
  const upload = await tx.resourceUpload.findUnique({ where: { id } });
  if (!upload) return;
  const pending = await tx.resourceFileCleanup.count({ where: { sourceUploadId: id, state: { not: "done" } } });
  if (pending) return;
  if (upload.state === "consumed") { await tx.resourceUpload.updateMany({ where: { id, state: "consumed" }, data: { stagingKey: null } }); return; }
  if (upload.state !== "deleting" || upload.finalizeWriteEvidence === "pending" || upload.finalizeWriteEvidence === "unknown") return;
  await tx.resourceUpload.updateMany({ where: { id, state: "deleting" }, data: { state: upload.terminalReason === "expired" ? "expired" : "deleted", originalName: null, mimeType: null, size: null, expectedSha256: null, plaintextSha256: null, storedSha256: null, storedSize: null, stagingKey: null, finalKey: null, finalizeClaimId: null, finalizeLeaseUntil: null, finalizeIv: null, finalizeWriteEvidence: null, updatedAt: now } });
}
/** Internal trusted maintenance entry point; a public trigger must supply actorId. */
export async function reconcileResourceFileQueue(context: ResourceCleanupContext, options: { limit?: number; budgetMs?: number; cleanupIds?: string[] } = {}) {
  const storage = context.storage ?? await import("@/lib/resource-file-storage"), signal = AbortSignal.timeout(Math.min(10000, Math.max(1, options.budgetMs ?? 2000)));
  const limit = Math.min(10, Math.max(1, options.limit ?? 3)), now = nowOf(context);
  const candidates = await cleanupTransaction(context, tx => tx.resourceFileCleanup.findMany({ where: { ...(options.cleanupIds ? { id: { in: options.cleanupIds } } : {}), notBefore: { lte: now }, nextAttemptAt: { lte: now }, OR: [{ state: "pending" }, { state: "running", leaseUntil: { lte: now } }] }, orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }], take: limit }));
  let completed = 0;
  for (const candidate of candidates) {
    if (signal.aborted) break;
    const claimed = await cleanupTransaction(context, async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ResourceFileCleanup" WHERE "id" = ${candidate.id} FOR UPDATE`);
      const row = await tx.resourceFileCleanup.findUnique({ where: { id: candidate.id } }), at = nowOf(context);
      if (!row || row.state === "done" || row.notBefore > at || row.nextAttemptAt > at || (row.state === "running" && row.leaseUntil && row.leaseUntil > at)) return null;
      const reason = await pendingReason(tx, row, at);
      const upload = row.sourceUploadId ? await tx.resourceUpload.findUnique({ where: { id: row.sourceUploadId } }) : null;
      // Unknown writers do not prevent repeatedly removing late objects. They only
      // prevent claiming durable absence while the external write remains uncertain.
      if (reason && !(reason === "WRITE_PENDING" && ["deleting", "consumed"].includes(upload?.state ?? ""))) { await tx.resourceFileCleanup.update({ where: { id: row.id }, data: { state: "pending", claimId: null, leaseUntil: null, lastErrorCode: reason, nextAttemptAt: new Date(at.getTime() + 60000) } }); return null; }
      return tx.resourceFileCleanup.update({ where: { id: row.id }, data: { state: "running", claimId: randomUUID(), leaseUntil: new Date(at.getTime() + 15000), attemptCount: { increment: 1 }, lastErrorCode: null } });
    });
    if (!claimed) continue;
    let failure: "STORAGE_DELETE_FAILED" | "NOT_ABSENT" | null = null;
    try { await storage.deleteResourceStoredFile(claimed, { signal }); if (await storage.resourceStoredFileExists(claimed, { signal })) failure = "NOT_ABSENT"; }
    catch { failure = "STORAGE_DELETE_FAILED"; }
    await cleanupTransaction(context, async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ResourceFileCleanup" WHERE "id" = ${claimed.id} FOR UPDATE`);
      const row = await tx.resourceFileCleanup.findUnique({ where: { id: claimed.id } }), at = nowOf(context);
      if (!row || row.state !== "running" || row.claimId !== claimed.claimId) return;
      const reason = failure ?? await pendingReason(tx, row, at);
      if (reason) { await tx.resourceFileCleanup.updateMany({ where: { id: row.id, state: "running", claimId: claimed.claimId }, data: { state: "pending", claimId: null, leaseUntil: null, lastErrorCode: reason, nextAttemptAt: new Date(at.getTime() + Math.min(3600000, 1000 * 2 ** Math.min(row.attemptCount, 12))) } }); return; }
      const changed = await tx.resourceFileCleanup.updateMany({ where: { id: row.id, state: "running", claimId: claimed.claimId }, data: { state: "done", claimId: null, leaseUntil: null, completedAt: at, lastErrorCode: null } });
      if (changed.count) { completed++; if (row.sourceUploadId) await minimizeTerminalUpload(tx, row.sourceUploadId, at); }
    });
  }
  return { checked: candidates.length, completed };
}
export async function reconcileResourceFiles(context: ResourceContext, options: { cleanupIds?: string[]; budgetMs?: number } = {}) {
  const deadline = Date.now() + Math.min(10000, Math.max(1, options.budgetMs ?? 2000));
  // Refresh the actor before expiration candidate reads or any cleanup side effect.
  await cleanupTransaction(context, async () => undefined);
  const candidates = await cleanupTransaction(context, tx => tx.resourceUpload.findMany({ where: { actorId: context.actorId, state: { in: ["uploading", "finalizing", "ready"] }, expiresAt: { lte: resourceNow(context) } }, orderBy: [{ expiresAt: "asc" }, { id: "asc" }], take: 3 }));
  for (const candidate of candidates) {
    if (Date.now() >= deadline) break;
    await cleanupTransaction(context, async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ResourceUpload" WHERE "id" = ${candidate.id} FOR UPDATE`);
    const row = await tx.resourceUpload.findUnique({ where: { id: candidate.id } }), now = resourceNow(context);
    if (!row || row.expiresAt > now || !["uploading", "finalizing", "ready"].includes(row.state)) return;
    await tx.resourceUpload.update({ where: { id: row.id }, data: { state: "deleting", terminalReason: "expired", originalName: null, mimeType: null, size: null, expectedSha256: null, plaintextSha256: null, storedSha256: null, storedSize: null } });
    await queueResourceUploadFiles(tx, row, now);
    });
  }
  if (Date.now() >= deadline) return { checked: 0, completed: 0 };
  return reconcileResourceFileQueue(context, { ...options, budgetMs: Math.max(1, deadline - Date.now()) });
}
export async function safelyReconcileResourceFiles(context: ResourceContext, cleanupIds?: string[]) { try { await reconcileResourceFiles(context, { cleanupIds }); } catch { console.error("Resource file cleanup remains pending"); } }

/** Scheduled internal pump: current/retired/deleted actors' expired unused files too. */
export async function reconcileResourceLibraryMaintenance(context: Omit<ResourceCleanupContext, "actorId">, options: { limit?: number; budgetMs?: number } = {}) {
  const limit = Math.min(10, Math.max(1, options.limit ?? 3)), now = nowOf(context), deadline = Date.now() + Math.min(10000, Math.max(1, options.budgetMs ?? 2000));
  const candidates = await cleanupTransaction(context, tx => tx.resourceUpload.findMany({ where: { state: { in: ["uploading", "finalizing", "ready"] }, expiresAt: { lte: now } }, orderBy: [{ expiresAt: "asc" }, { id: "asc" }], take: limit }));
  let expired = 0;
  for (const candidate of candidates) {
    if (Date.now() >= deadline) break;
    const transitioned = await cleanupTransaction(context, async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ResourceUpload" WHERE "id" = ${candidate.id} FOR UPDATE`);
    const row = await tx.resourceUpload.findUnique({ where: { id: candidate.id } });
    if (!row || row.expiresAt > now || !["uploading", "finalizing", "ready"].includes(row.state)) return false;
    await tx.resourceUpload.update({ where: { id: row.id }, data: { state: "deleting", terminalReason: "expired", originalName: null, mimeType: null, size: null, expectedSha256: null, plaintextSha256: null, storedSha256: null, storedSize: null } });
    await queueResourceUploadFiles(tx, row, now);
    return true;
    });
    if (transitioned) expired++;
  }
  if (Date.now() >= deadline) return { checked: 0, completed: 0, expired };
  const result = await reconcileResourceFileQueue(context, { ...options, budgetMs: Math.max(1, deadline - Date.now()) });
  return { ...result, expired };
}
