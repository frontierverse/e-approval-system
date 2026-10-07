import "server-only";
import { queueStaffPushEvent } from "@/lib/mobile-push-events";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { AuditAction, Prisma, type ResourceMutationReceipt, type ResourceUpload } from "@/generated/prisma/client";
import { getAttachmentPolicySnapshot } from "@/lib/attachment-policy";
import { ResourceError, parseResourceCreate, parseResourceUpdate, parseResourceDelete, resourceId, type ResourceCreateInput, type ResourceUpdateInput, type ResourceDeleteInput, type ResourceMutationResult } from "@/lib/mobile-resources-core";
import { assertResourceManager, getResourceRecord, lockResourcePost, lockResourceRequest, mapMobileResource, resourceNow, resourceTransaction, type ResourceActor, type ResourceContext } from "@/lib/resource-library-queries";
import { enqueueResourceFileCleanup, queueResourceUploadFiles, safelyReconcileResourceFiles } from "@/lib/resource-file-cleanup";
import { revalidateResourceLibrary } from "@/lib/resource-library-cache";
export type ResourceMutationInput = { operation: "create"; data: ResourceCreateInput } | { operation: "update"; resourceId: string; data: ResourceUpdateInput } | { operation: "delete"; resourceId: string; data: ResourceDeleteInput };
export const resourceCanonicalHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function validateResourceUploadPolicy(file: { originalName: string | null; size: number | null }, policy: { allowedExtensions: string[]; maxFileSizeMb: number }) {
  if (!file.originalName || !file.size || !policy.allowedExtensions.includes(path.extname(file.originalName).toLowerCase()) || file.size > policy.maxFileSizeMb * 1048576) throw new ResourceError("첨부파일의 형식과 크기를 확인해 주세요.", "ATTACHMENT_POLICY", 400, { attachments: "현재 첨부파일 정책을 확인해 주세요." });
}
async function receiptResult(tx: Prisma.TransactionClient, actor: ResourceActor, receipt: ResourceMutationReceipt, replayed: boolean): Promise<ResourceMutationResult> {
  const post = await tx.resourcePost.findUnique({ where: { id: receipt.targetResourceId }, include: (await import("@/lib/resource-library-queries")).resourceInclude });
  if (post) assertResourceManager(actor, post);
  const cleanupPending = Boolean(receipt.cleanupIds.length && await tx.resourceFileCleanup.count({ where: { id: { in: receipt.cleanupIds }, state: { not: "done" } } }));
  return { ok: true, message: receipt.operation === "create" ? "자료를 등록했습니다." : receipt.operation === "update" ? "자료를 수정했습니다." : "자료를 삭제했습니다.", replayed, operation: receipt.operation as ResourceMutationResult["operation"], outcome: post ? "present" : "deleted", resourceId: receipt.targetResourceId, committedUpdatedAt: receipt.committedUpdatedAt?.toISOString() ?? null, resource: post ? mapMobileResource(post, actor) : null, cleanupPending };
}
export async function getResourceMutationStatus(context: ResourceContext, requestId: string) {
  return resourceTransaction(context, async (tx, actor) => { const receipt = await tx.resourceMutationReceipt.findUnique({ where: { actorId_requestId: { actorId: actor.id, requestId: resourceId(requestId, true) } } }); if (!receipt) throw new ResourceError("요청 결과를 찾을 수 없습니다.", "NOT_FOUND", 404); return receiptResult(tx, actor, receipt, true); });
}
async function lockUploads(tx: Prisma.TransactionClient, ids: string[]) { const result: ResourceUpload[] = []; for (const id of ids) { await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ResourceUpload" WHERE "id" = ${id} FOR UPDATE`); const row = await tx.resourceUpload.findUnique({ where: { id } }); if (!row) throw new ResourceError("첨부파일 정보를 확인해 주세요.", "INVALID_REQUEST", 400, { attachments: "첨부파일을 다시 확인해 주세요." }); result.push(row); } return result; }
export async function mutateResource(context: ResourceContext, raw: ResourceMutationInput): Promise<ResourceMutationResult> {
  const operation = raw.operation, data = operation === "create" ? parseResourceCreate(raw.data) : operation === "update" ? parseResourceUpdate(raw.data) : parseResourceDelete(raw.data);
  const target = operation === "create" ? null : resourceId((raw as { resourceId: string }).resourceId);
  const { requestId, ...canonical } = data, payloadHash = resourceCanonicalHash({ operation, target, ...canonical });
  const result = await resourceTransaction(context, async (tx, actor) => {
    await lockResourceRequest(tx, actor.id, requestId);
    const existing = await tx.resourceMutationReceipt.findUnique({ where: { actorId_requestId: { actorId: actor.id, requestId } } });
    if (existing) { if (existing.payloadHash !== payloadHash) throw new ResourceError("같은 요청으로 다른 자료를 처리할 수 없습니다.", "REQUEST_CONFLICT", 409); return receiptResult(tx, actor, existing, true); }
    const now = resourceNow(context), receiptId = randomUUID(), cleanupIds: string[] = [];
    let current: Awaited<ReturnType<typeof getResourceRecord>> | null = null;
    if (target) { await lockResourcePost(tx, target); current = await getResourceRecord(tx, target); assertResourceManager(actor, current); if (current.updatedAt.toISOString() !== (data as ResourceDeleteInput).expectedUpdatedAt) throw new ResourceError("자료가 변경되었습니다. 최신 내용을 확인해 주세요.", "RESOURCE_CONFLICT", 409); }
    const title = operation === "delete" ? current!.title : (data as ResourceCreateInput).title;
    let id = target!, token: Date | null = null, pushChanged = operation === "create";
    if (operation === "delete") {
      const files = await tx.resourceAttachment.findMany({ where: { resourceId: id }, orderBy: { id: "asc" } });
      for (const file of files) cleanupIds.push(await enqueueResourceFileCleanup(tx, { ref: file, objectKind: "legacy", sourceMutationId: receiptId }, now));
      const uploads = await tx.resourceUpload.findMany({ where: { consumedResourceId: id, state: "consumed" }, orderBy: { id: "asc" } });
      for (const upload of await lockUploads(tx, uploads.map(row => row.id))) { await tx.resourceUpload.update({ where: { id: upload.id }, data: { state: "deleting", terminalReason: "deleted", originalName: null, mimeType: null, size: null, expectedSha256: null, plaintextSha256: null, storedSha256: null, storedSize: null } }); cleanupIds.push(...await queueResourceUploadFiles(tx, upload, now, receiptId)); }
      await tx.resourcePost.delete({ where: { id } });
    } else {
      const values = data as ResourceUpdateInput, removal = operation === "update" ? values.removeAttachmentIds : [], existingIds = current?.attachments.map(file => file.id) ?? [];
      pushChanged = !current || current.title !== values.title || current.summary !== values.summary || current.category !== values.category || current.educationLevel !== values.educationLevel || values.uploadIds.length > 0 || removal.some(id => existingIds.includes(id));
      if (context.strictRemoveIds !== false && removal.some(file => !existingIds.includes(file))) throw new ResourceError("첨부파일 정보를 확인해 주세요.", "INVALID_REQUEST", 400, { attachments: "첨부파일을 다시 확인해 주세요." });
      const removeIds = removal.filter(file => existingIds.includes(file));
      const previousUploads = removeIds.length ? await tx.resourceUpload.findMany({ where: { consumedAttachmentId: { in: removeIds }, state: "consumed" }, orderBy: { id: "asc" } }) : [];
      const policy = await getAttachmentPolicySnapshot(tx);
      if (existingIds.length - removeIds.length + values.uploadIds.length > policy.maxFileCount) throw new ResourceError(`첨부파일은 최대 ${policy.maxFileCount}개까지 등록할 수 있습니다.`, "ATTACHMENT_POLICY", 400, { attachments: "첨부파일 개수를 확인해 주세요." });
      const lockedUploads = await lockUploads(tx, [...new Set([...values.uploadIds, ...previousUploads.map(row => row.id)])].sort());
      const uploads = lockedUploads.filter(row => values.uploadIds.includes(row.id));
      for (const upload of uploads) { if (upload.actorId !== actor.id || upload.purpose !== "resource" || upload.targetResourceId !== target || upload.state !== "ready" || upload.expiresAt <= now || upload.finalizeWriteEvidence !== "confirmed" || !upload.finalKey || upload.plaintextSha256 !== upload.expectedSha256) throw new ResourceError("사용할 수 없는 첨부파일입니다.", "UPLOAD_CONFLICT", 409); validateResourceUploadPolicy(upload, policy); }
      token = current ? new Date(Math.max(now.getTime(), current.updatedAt.getTime() + 1)) : now;
      const content = { title: values.title, summary: values.summary, category: values.category, educationLevel: values.educationLevel, updatedAt: token };
      if (current) await tx.resourcePost.update({ where: { id: current.id }, data: content }); else { const created = await tx.resourcePost.create({ data: { ...content, authorId: actor.id, createdAt: now } }); id = created.id; }
      if (removeIds.length) {
        const files = await tx.resourceAttachment.findMany({ where: { id: { in: removeIds }, resourceId: id }, orderBy: { id: "asc" } });
        for (const file of files) cleanupIds.push(await enqueueResourceFileCleanup(tx, { ref: file, objectKind: "legacy", sourceMutationId: receiptId }, now));
        for (const upload of lockedUploads.filter(row => previousUploads.some(previous => previous.id === row.id))) { await tx.resourceUpload.update({ where: { id: upload.id }, data: { state: "deleting", terminalReason: "deleted", originalName: null, mimeType: null, size: null, expectedSha256: null, plaintextSha256: null, storedSha256: null, storedSize: null } }); cleanupIds.push(...await queueResourceUploadFiles(tx, upload, now, receiptId)); }
        await tx.resourceAttachment.deleteMany({ where: { id: { in: removeIds }, resourceId: id } });
      }
      for (const upload of uploads) {
        const file = await tx.resourceAttachment.create({ data: { resourceId: id, uploaderId: actor.id, originalName: upload.originalName!, mimeType: upload.mimeType!, size: upload.size!, storageProvider: upload.storageProvider, storageKey: upload.finalKey! } });
        await tx.resourceUpload.update({ where: { id: upload.id }, data: { state: "consumed", consumedResourceId: id, consumedMutationId: receiptId, consumedAttachmentId: file.id } });
        if (upload.stagingKey) cleanupIds.push(await enqueueResourceFileCleanup(tx, { ref: { storageProvider: upload.storageProvider, storageKey: upload.stagingKey }, objectKind: "staging", sourceUploadId: upload.id, sourceMutationId: receiptId, notBefore: upload.lastGrantExpiresAt ?? now }, now));
      }
    }
    await tx.auditLog.create({ data: { actorId: actor.id, targetType: "ResourcePost", targetId: id, action: operation === "create" ? AuditAction.CREATE_RESOURCE : operation === "update" ? AuditAction.UPDATE_RESOURCE : AuditAction.DELETE_RESOURCE, message: `${actor.name}님이 "${title}" 자료를 ${operation === "create" ? "업로드" : operation === "update" ? "수정" : "삭제"}했습니다.`, ...context.requestData } });
    if (pushChanged && operation !== "delete") await queueStaffPushEvent(tx, { eventKey: `resource:${id}:${requestId}`, kind: operation === "create" ? "RESOURCE_CREATED" : "RESOURCE_UPDATED", targetId: id, targetVersion: token!.toISOString(), actorId: actor.id });
    const receipt = await tx.resourceMutationReceipt.create({ data: { id: receiptId, actorId: actor.id, requestId, operation, targetResourceId: id, payloadHash, committedUpdatedAt: token, committedAt: now, cleanupIds: [...new Set(cleanupIds)] } });
    return receiptResult(tx, actor, receipt, false);
  }, "Serializable", "ResourceMutationReceipt");
  revalidateResourceLibrary(result.resourceId);
  await safelyReconcileResourceFiles(context);
  // A maintenance failure cannot turn a committed business result into an error.
  return result;
}
export async function recordResourceView(context: ResourceContext, input: { resourceId: string; requestId: string }) {
  const id = resourceId(input.resourceId), requestId = resourceId(input.requestId, true);
  return resourceTransaction(context, async (tx, actor) => {
    await lockResourcePost(tx, id); const post = await getResourceRecord(tx, id), now = resourceNow(context);
    const eventKey = { resourceId: id, actorId: actor.id, requestId }, existing = await tx.resourceViewEvent.findUnique({ where: { resourceId_actorId_requestId: eventKey } });
    if (!existing) { await tx.resourceViewEvent.create({ data: { ...eventKey, createdAt: now } }); await tx.resourcePostView.upsert({ where: { resourceId_userId: { resourceId: id, userId: actor.id } }, create: { resourceId: id, userId: actor.id, firstViewedAt: now, lastViewedAt: now }, update: { lastViewedAt: now, viewCount: { increment: 1 } } }); const unique = await tx.resourcePostView.count({ where: { resourceId: id } }); await tx.resourcePost.update({ where: { id }, data: { viewCount: unique, updatedAt: post.updatedAt } }); }
    const viewer = await tx.resourcePostView.findUniqueOrThrow({ where: { resourceId_userId: { resourceId: id, userId: actor.id } } });
    return { ok: true as const, replayed: Boolean(existing), resourceId: id, uniqueViewerCount: await tx.resourcePostView.count({ where: { resourceId: id } }), viewer: { firstViewedAt: viewer.firstViewedAt.toISOString(), lastViewedAt: viewer.lastViewedAt.toISOString(), visitCount: viewer.viewCount } };
  }, "Serializable", "ResourceViewEvent");
}
