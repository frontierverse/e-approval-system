import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type YouthDecisionFileCleanup } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockYouthActor, assertYouthPermission } from "@/lib/youth-mobile-context";
import type { YouthDecisionContext, YouthDecisionStorage } from "@/lib/youth-decision-uploads";
export type YouthDecisionStorageRef = { storageProvider: string; storageKey: string };
const youthDecisionNow = (context: YouthDecisionContext) => new Date((context.now?.() ?? new Date()).getTime());

export const youthDecisionCleanupErrorCodes = ["STORAGE_DELETE_FAILED", "WRITE_PENDING", "LIVE_REFERENCE", "GRANT_ACTIVE", "LEASE_ACTIVE", "NOT_ABSENT", "LEGACY_WRITER_UNTRACKED"] as const;
export type YouthDecisionCleanupContext = { actorId?: string; db?: Pick<PrismaClient, "$transaction">; now?: () => Date; storage?: YouthDecisionStorage };
const nowOf = (context: YouthDecisionCleanupContext) => new Date((context.now?.() ?? new Date()).getTime());
export async function enqueueYouthDecisionFileCleanup(tx: Prisma.TransactionClient, input: { ref: YouthDecisionStorageRef; objectKind: "staging" | "final" | "legacy"; sourceUploadId?: string; sourceMutationId?: string; notBefore?: Date; youthId?: string }, now: Date): Promise<string> {
  await tx.$queryRaw(Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtext('youth-decision-file-cleanup'), hashtext(${input.ref.storageProvider + ":" + input.ref.storageKey}))`);
  const ref = { storageProvider: input.ref.storageProvider, storageKey: input.ref.storageKey };
  const where = { storageProvider_storageKey: ref }, old = await tx.youthDecisionFileCleanup.findUnique({ where });
  const notBefore = new Date(Math.max(now.getTime(), input.notBefore?.getTime() ?? 0, old?.notBefore.getTime() ?? 0));
  const row = await tx.youthDecisionFileCleanup.upsert({ where, create: { ...ref, objectKind: input.objectKind, sourceUploadId: input.sourceUploadId ?? null, sourceMutationId: input.sourceMutationId ?? null, youthId: input.youthId ?? null, notBefore, nextAttemptAt: notBefore }, update: { ...(input.youthId && !old?.youthId ? { youthId: input.youthId } : {}), ...(input.sourceUploadId && !old?.sourceUploadId ? { sourceUploadId: input.sourceUploadId, objectKind: input.objectKind } : {}), ...(input.sourceMutationId ? { sourceMutationId: input.sourceMutationId } : {}), notBefore, nextAttemptAt: notBefore, state: "pending", claimId: null, leaseUntil: null, completedAt: null, lastErrorCode: null } });
  return row.id;
}
export async function queueYouthDecisionUploadFiles(tx: Prisma.TransactionClient, upload: { id: string; storageProvider: string; stagingKey: string | null; finalKey: string | null; lastGrantExpiresAt: Date | null; finalizeLeaseUntil: Date | null }, now: Date, mutationId?: string, youthId?: string) {
  const result: string[] = [], notBefore = new Date(Math.max(now.getTime(), upload.lastGrantExpiresAt?.getTime() ?? 0, upload.finalizeLeaseUntil?.getTime() ?? 0));
  for (const [objectKind, storageKey] of [["final", upload.finalKey], ["staging", upload.stagingKey]] as const) if (storageKey) result.push(await enqueueYouthDecisionFileCleanup(tx, { ref: { storageProvider: upload.storageProvider, storageKey }, objectKind, sourceUploadId: upload.id, sourceMutationId: mutationId, youthId, notBefore: objectKind === "staging" ? notBefore : new Date(Math.max(now.getTime(), upload.finalizeLeaseUntil?.getTime() ?? 0)) }, now));
  return result;
}
async function cleanupTransaction<T>(context: YouthDecisionCleanupContext, operation: (tx: Prisma.TransactionClient) => Promise<T>) { return (context.db ?? prisma).$transaction(async tx => { if (context.actorId) assertYouthPermission(await lockYouthActor(tx, context.actorId), "canManageYouth"); return operation(tx); }, { timeout: 10000 }); }
async function pendingReason(tx: Prisma.TransactionClient, row: YouthDecisionFileCleanup, now: Date) {
  if (await tx.resourceAttachment.count({ where: { storageProvider: row.storageProvider, storageKey: row.storageKey } })) return "LIVE_REFERENCE" as const;
  // Legacy generic keys can be shared with document files. Never delete a live owner.
  if (await tx.attachment.count({ where: { storageProvider: row.storageProvider, storageKey: row.storageKey } })) return "LIVE_REFERENCE" as const;
  const youthOwners = await tx.youthDecisionDocument.findMany({ where: { storageProvider: row.storageProvider, storageKey: row.storageKey }, select: { id: true, youthId: true } });
  for (const owner of youthOwners) {
    const parent = row.youthId === owner.youthId ? await tx.youth.findUnique({ where: { id: owner.youthId }, select: { purgeStartedAt: true, purgedAt: true, retentionVersion: true } }) : null;
    const source = row.sourceUploadId ? await tx.youthDecisionUpload.findUnique({ where: { id: row.sourceUploadId } }) : null;
    const exactPurge = !!parent?.purgeStartedAt && !parent.purgedAt && row.sourceMutationId === `purge:${owner.youthId}:${parent.retentionVersion}`;
    const exact = exactPurge && (row.objectKind === "legacy" || (!!source && source.consumedYouthId === owner.youthId && source.consumedDocumentId === owner.id && source.storageProvider === row.storageProvider && source.finalKey === row.storageKey));
    if (!exact) return "LIVE_REFERENCE" as const;
  }
  const imageProviders = row.storageProvider === "local" ? ["local", null] : [row.storageProvider];
  if (await tx.user.count({ where: { OR: imageProviders.flatMap(provider => [{ profileImageStorageProvider: provider, profileImageStorageKey: row.storageKey }, { signatureImageStorageProvider: provider, signatureImageStorageKey: row.storageKey }]) } })) return "LIVE_REFERENCE" as const;
  if (await tx.mobileDraftUpload.count({ where: { storageProvider: row.storageProvider, storageKey: row.storageKey } })) return "LIVE_REFERENCE" as const;
  if (await tx.staffChatAttachment.count({ where: { storageProvider: row.storageProvider, storageKey: row.storageKey, deletedAt: null } })) return "LIVE_REFERENCE" as const;
  if (row.objectKind === "legacy") return "LEGACY_WRITER_UNTRACKED" as const;
  if (!row.sourceUploadId) return null;
  const upload = await tx.youthDecisionUpload.findUnique({ where: { id: row.sourceUploadId } });
  if (!upload) return "WRITE_PENDING" as const;
  if (row.objectKind === "staging" && upload.lastGrantExpiresAt && upload.lastGrantExpiresAt > now) return "GRANT_ACTIVE" as const;
  if (upload.finalizeLeaseUntil && upload.finalizeLeaseUntil > now) return "LEASE_ACTIVE" as const;
  // A timed-out lease never proves that the provider has stopped accepting bytes.
  if ((row.objectKind === "staging" && upload.lastGrantExpiresAt !== null) || upload.hadUnknownWrite || upload.finalizeWriteEvidence === "pending" || upload.finalizeWriteEvidence === "unknown") return "WRITE_PENDING" as const;
  return null;
}
async function minimizeTerminalYouthUpload(tx: Prisma.TransactionClient, id: string, now: Date) {
  const upload = await tx.youthDecisionUpload.findUnique({ where: { id } });
  if (!upload) return;
  const pending = await tx.youthDecisionFileCleanup.count({ where: { sourceUploadId: id, state: { not: "done" } } });
  if (pending) return;
  if (upload.state === "consumed") { await tx.youthDecisionUpload.updateMany({ where: { id, state: "consumed" }, data: { stagingKey: null } }); return; }
  if (upload.state !== "deleting" || upload.finalizeWriteEvidence === "pending" || upload.finalizeWriteEvidence === "unknown") return;
  await tx.youthDecisionUpload.updateMany({ where: { id, state: "deleting" }, data: { state: upload.terminalReason === "expired" ? "expired" : "deleted", originalName: null, mimeType: null, size: null, expectedSha256: null, plaintextSha256: null, storedSha256: null, storedSize: null, stagingKey: null, finalKey: null, finalizeClaimId: null, finalizeLeaseUntil: null, finalizeIv: null, finalizeWriteEvidence: null, updatedAt: now } });
}
/** Internal trusted maintenance entry point; a public trigger must supply actorId. */
export async function reconcileYouthDecisionFileQueue(context: YouthDecisionCleanupContext, options: { limit?: number; budgetMs?: number; cleanupIds?: string[]; signal?: AbortSignal } = {}) {
  const deadline = Date.now() + Math.min(10000, Math.max(1, options.budgetMs ?? 2000));
  const deadlineSignal = AbortSignal.timeout(Math.min(10000, Math.max(1, options.budgetMs ?? 2000)));
  const signal = options.signal ? AbortSignal.any([options.signal, deadlineSignal]) : deadlineSignal;
  const cancelled = () => signal.aborted || Date.now() >= deadline;
  if (cancelled()) return { checked: 0, completed: 0 };
  const storage = context.storage ?? await import("@/lib/resource-file-storage");
  if (cancelled()) return { checked: 0, completed: 0 };
  const limit = Math.min(10, Math.max(1, options.limit ?? 3)), now = nowOf(context);
  const candidates = await cleanupTransaction(context, tx => tx.youthDecisionFileCleanup.findMany({ where: { ...(options.cleanupIds ? { id: { in: options.cleanupIds } } : {}), notBefore: { lte: now }, nextAttemptAt: { lte: now }, OR: [{ state: "pending" }, { state: "running", leaseUntil: { lte: now } }] }, orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }], take: limit }));
  let completed = 0;
  for (const candidate of candidates) {
    if (cancelled()) break;
    const claimed = await cleanupTransaction(context, async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "YouthDecisionFileCleanup" WHERE "id" = ${candidate.id} FOR UPDATE`);
      if (cancelled()) return null;
      const row = await tx.youthDecisionFileCleanup.findUnique({ where: { id: candidate.id } }), at = nowOf(context);
      if (!row || row.state === "done" || row.notBefore > at || row.nextAttemptAt > at || (row.state === "running" && row.leaseUntil && row.leaseUntil > at)) return null;
      const reason = await pendingReason(tx, row, at);
      const upload = row.sourceUploadId ? await tx.youthDecisionUpload.findUnique({ where: { id: row.sourceUploadId } }) : null;
      if (cancelled()) return null;
      // Unknown writers do not prevent repeatedly removing late objects. They only
      // prevent claiming durable absence while the external write remains uncertain.
      if (reason && !(reason === "LEGACY_WRITER_UNTRACKED" || (reason === "WRITE_PENDING" && ["deleting", "consumed"].includes(upload?.state ?? "")))) { await tx.youthDecisionFileCleanup.update({ where: { id: row.id }, data: { state: "pending", claimId: null, leaseUntil: null, lastErrorCode: reason, nextAttemptAt: new Date(at.getTime() + 60000) } }); return null; }
      if (cancelled()) return null;
      return tx.youthDecisionFileCleanup.update({ where: { id: row.id }, data: { state: "running", claimId: randomUUID(), leaseUntil: new Date(at.getTime() + 15000), attemptCount: { increment: 1 }, lastErrorCode: null } });
    });
    if (!claimed) continue;
    let failure: "STORAGE_DELETE_FAILED" | "NOT_ABSENT" | null = null;
    try { if (cancelled()) throw new Error("CLEANUP_CANCELLED"); await storage.deleteResourceStoredFile(claimed, { signal }); if (cancelled() || await storage.resourceStoredFileExists(claimed, { signal })) failure = "NOT_ABSENT"; }
    catch { failure = "STORAGE_DELETE_FAILED"; }
    const committed = await cleanupTransaction(context, async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "YouthDecisionFileCleanup" WHERE "id" = ${claimed.id} FOR UPDATE`);
      const row = await tx.youthDecisionFileCleanup.findUnique({ where: { id: claimed.id } }), at = nowOf(context);
      if (!row || row.state !== "running" || row.claimId !== claimed.claimId) return;
      const reason = failure ?? (cancelled() ? "STORAGE_DELETE_FAILED" : await pendingReason(tx, row, at));
      if (reason || cancelled()) { await tx.youthDecisionFileCleanup.updateMany({ where: { id: row.id, state: "running", claimId: claimed.claimId }, data: { state: "pending", claimId: null, leaseUntil: null, lastErrorCode: reason ?? "STORAGE_DELETE_FAILED", nextAttemptAt: new Date(at.getTime() + Math.min(3600000, 1000 * 2 ** Math.min(row.attemptCount, 12))) } }); return; }
      const changed = await tx.youthDecisionFileCleanup.updateMany({ where: { id: row.id, state: "running", claimId: claimed.claimId }, data: { state: "done", claimId: null, leaseUntil: null, completedAt: at, lastErrorCode: null } });
      if (changed.count) { if (cancelled()) throw new Error("CLEANUP_CANCELLED"); if (row.sourceUploadId) await minimizeTerminalYouthUpload(tx, row.sourceUploadId, at); if (cancelled()) throw new Error("CLEANUP_CANCELLED"); return true; }
    });
    if (committed) completed++;
  }
  return { checked: candidates.length, completed };
}
export async function reconcileYouthDecisionFiles(context: YouthDecisionContext, options: { cleanupIds?: string[]; budgetMs?: number } = {}) {
  const deadline = Date.now() + Math.min(10000, Math.max(1, options.budgetMs ?? 2000));
  // Refresh the actor before expiration candidate reads or any cleanup side effect.
  await cleanupTransaction(context, async () => undefined);
  const candidates = await cleanupTransaction(context, tx => tx.youthDecisionUpload.findMany({ where: { actorId: context.actorId, state: { in: ["uploading", "finalizing", "ready"] }, expiresAt: { lte: youthDecisionNow(context) } }, orderBy: [{ expiresAt: "asc" }, { id: "asc" }], take: 3 }));
  for (const candidate of candidates) {
    if (Date.now() >= deadline) break;
    await cleanupTransaction(context, async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "YouthDecisionUpload" WHERE "id" = ${candidate.id} FOR UPDATE`);
    const row = await tx.youthDecisionUpload.findUnique({ where: { id: candidate.id } }), now = youthDecisionNow(context);
    if (!row || row.expiresAt > now || !["uploading", "finalizing", "ready"].includes(row.state)) return;
    await tx.youthDecisionUpload.update({ where: { id: row.id }, data: { state: "deleting", terminalReason: "expired", originalName: null, mimeType: null, size: null, expectedSha256: null, plaintextSha256: null, storedSha256: null, storedSize: null } });
    await queueYouthDecisionUploadFiles(tx, row, now, undefined, row.consumedYouthId ?? row.targetYouthId ?? undefined);
    });
  }
  if (Date.now() >= deadline) return { checked: 0, completed: 0 };
  return reconcileYouthDecisionFileQueue(context, { ...options, budgetMs: Math.max(1, deadline - Date.now()) });
}
export async function safelyReconcileYouthDecisionFiles(context: YouthDecisionContext, cleanupIds?: string[]) { try { await reconcileYouthDecisionFiles(context, { cleanupIds }); } catch { console.error("Youth decision file cleanup remains pending"); } }

/** Scheduled expiration lane; unused files from retired/deleted actors are included. */
export async function reconcileYouthDecisionUploadExpiry(context: Omit<YouthDecisionCleanupContext, "actorId"> = {}, options: { limit?: number; budgetMs?: number; signal?: AbortSignal } = {}) {
  const limit = Math.min(10, Math.max(1, options.limit ?? 3)), now = nowOf(context), deadline = Date.now() + Math.min(10000, Math.max(1, options.budgetMs ?? 2000));
  if (options.signal?.aborted) return { checked: 0, completed: 0, expired: 0 };
  const candidates = await cleanupTransaction(context, tx => tx.youthDecisionUpload.findMany({ where: { state: { in: ["uploading", "finalizing", "ready"] }, expiresAt: { lte: now } }, orderBy: [{ expiresAt: "asc" }, { id: "asc" }], take: limit }));
  let checked = 0, expired = 0;
  for (const candidate of candidates) {
    if (Date.now() >= deadline || options.signal?.aborted) break;
    const transitioned = await cleanupTransaction(context, async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "YouthDecisionUpload" WHERE "id" = ${candidate.id} FOR UPDATE`);
      if (Date.now() >= deadline || options.signal?.aborted) return false;
      const row = await tx.youthDecisionUpload.findUnique({ where: { id: candidate.id } });
      if (Date.now() >= deadline || options.signal?.aborted || !row || row.expiresAt > now || !["uploading", "finalizing", "ready"].includes(row.state)) return false;
      await tx.youthDecisionUpload.update({ where: { id: row.id }, data: { state: "deleting", terminalReason: "expired", originalName: null, mimeType: null, size: null, expectedSha256: null, plaintextSha256: null, storedSha256: null, storedSize: null } });
      await queueYouthDecisionUploadFiles(tx, row, now, undefined, row.consumedYouthId ?? row.targetYouthId ?? undefined);
      return true;
    });
    checked++;
    if (transitioned) expired++;
  }
  return { checked, completed: 0, expired };
}
/** Compatibility pump reserves a queue budget even if expiration uses its full slot. */
export async function reconcileYouthDecisionMaintenance(context: Omit<YouthDecisionCleanupContext, "actorId"> = {}, options: { limit?: number; budgetMs?: number; signal?: AbortSignal } = {}) {
  const budget = Math.min(10000, Math.max(2, options.budgetMs ?? 2000)), expiryBudget = Math.max(1, Math.floor(budget / 3));
  const expiry = await reconcileYouthDecisionUploadExpiry(context, { ...options, budgetMs: expiryBudget });
  const result = await reconcileYouthDecisionFileQueue(context, { ...options, budgetMs: budget - expiryBudget });
  return { ...result, expired: expiry.expired };
}
