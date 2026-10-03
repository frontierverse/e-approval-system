import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuditLogRequestData } from "@/lib/audit-log-request";
import { getAttachmentPolicySnapshot } from "@/lib/attachment-policy";
import { getAttachmentPreviewKind } from "@/lib/attachment-preview";
import { getResourceSearchTerms, getResourceLibraryPageSize, isResourceCategory, isResourceEducationLevel, type ResourceCategoryFilter, type ResourceEducationLevelFilter, type ResourceLibraryItem, type ResourceLibraryPage, type ResourcePostDetail } from "@/lib/resource-library-core";
import { ResourceError, resourceId, type MobileResource, type ResourcePageQuery } from "@/lib/mobile-resources-core";

export type ResourceStorageRef = { storageProvider: string; storageKey: string };
export type ResourceStoragePorts = {
  createResourceStagingGrant(ref: ResourceStorageRef, options: { mimeType: string; signal?: AbortSignal }): Promise<{ method: "PUT"; url: string; headers: { "Content-Type": string }; expiresAt: string | Date }>;
  finalizeResourceStoredUpload(input: { staging: ResourceStorageRef; final: ResourceStorageRef; size: number; wholeSha256: string; ivBase64?: string | null; signal?: AbortSignal }): Promise<{ size: number; wholeSha256: string; storedSize: number; storedSha256: string; encryptionIvBase64: string | null; reused: boolean; writeEvidence: "confirmed" }>;
  readResourceStoredFile(ref: ResourceStorageRef, options: { expectedSize: number; expectedSha256?: string; signal?: AbortSignal; beforeExpose: () => Promise<void> | void }): Promise<{ body: ReadableStream<Uint8Array>; size: number; verifiedSha256: string; mimeType?: string; previewKind: "image" | "pdf" | null }>;
  writeResourceStagingFile(ref: ResourceStorageRef, options: { body: ReadableStream<Uint8Array>; size: number; mimeType: string; wholeSha256?: string; signal?: AbortSignal }): Promise<{ size: number; wholeSha256: string; storedSize: number; storedSha256: string; reused: boolean; writeEvidence: "confirmed" }>;
  deleteResourceStoredFile(ref: ResourceStorageRef, options?: { signal?: AbortSignal }): Promise<void>;
  resourceStoredFileExists(ref: ResourceStorageRef, options?: { signal?: AbortSignal }): Promise<boolean>;
};
export type ResourceContext = { actorId: string; db?: Pick<PrismaClient, "$transaction">; now?: () => Date; requestData?: AuditLogRequestData; storage?: ResourceStoragePorts; strictRemoveIds?: boolean };
export const resourceNow = (context: ResourceContext) => new Date((context.now?.() ?? new Date()).getTime());
const actorSelect = { id: true, name: true, status: true, role: true } satisfies Prisma.UserSelect;
export type ResourceActor = Prisma.UserGetPayload<{ select: typeof actorSelect }>;
const userSelect = { id: true, name: true, department: { select: { name: true } }, position: { select: { name: true } } } satisfies Prisma.UserSelect;
const webUserSelect = { ...userSelect, profileImageStorageKey: true, profileImageUpdatedAt: true } satisfies Prisma.UserSelect;
const attachmentSelect = { id: true, originalName: true, mimeType: true, size: true } satisfies Prisma.ResourceAttachmentSelect;
export const resourceInclude = { author: { select: userSelect }, attachments: { select: attachmentSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } satisfies Prisma.ResourcePostInclude;
const webResourceInclude = { ...resourceInclude, author: { select: webUserSelect } } satisfies Prisma.ResourcePostInclude;
export type ResourceRecord = Prisma.ResourcePostGetPayload<{ include: typeof resourceInclude }>;
type WebResourceRecord = Prisma.ResourcePostGetPayload<{ include: typeof webResourceInclude }>;
export async function lockResourceActor(tx: Prisma.TransactionClient, actorId: string): Promise<ResourceActor> {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR SHARE`);
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: actorSelect });
  if (!actor || actor.status !== "ACTIVE") throw new ResourceError("인증이 필요합니다.", "UNAUTHORIZED", 401);
  return actor;
}
export function assertResourceManager(actor: ResourceActor, post: { authorId: string }) { if (actor.role !== "ADMIN" && post.authorId !== actor.id) throw new ResourceError("이 자료를 수정할 권한이 없습니다.", "FORBIDDEN", 403); }
export async function lockResourcePost(tx: Prisma.TransactionClient, id: string) { await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ResourcePost" WHERE "id" = ${id} FOR UPDATE`); }
export async function lockResourceRequest(tx: Prisma.TransactionClient, actorId: string, requestId: string, scope = "resource-mutation") { await tx.$queryRaw(Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${scope}), hashtext(${actorId + ":" + requestId}))`); }
function errorRecord(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" ? value as Record<string, unknown> : null; }
function adapterConflict(value: unknown) { const record = errorRecord(value); return record?.name === "DriverAdapterError" && errorRecord(record.cause)?.kind === "TransactionWriteConflict"; }
export function resourceTransactionConflict(value: unknown) {
  const seen = new Set<Error>(); let error = value;
  for (let depth = 0; depth <= 4 && error instanceof Error && !seen.has(error); depth++) {
    seen.add(error); const record = errorRecord(error)!;
    if (error.name === "PrismaClientKnownRequestError" && (record.code === "P2034" || adapterConflict(errorRecord(record.meta)?.driverAdapterError))) return true;
    if (adapterConflict(error)) return true;
    error = record.cause;
  }
  return false;
}
/** Retry only the three named idempotency indexes, never arbitrary uniqueness. */
export function resourceReceiptConflict(value: unknown, model: "ResourceMutationReceipt" | "ResourceUpload" | "ResourceViewEvent") {
  if (!(value instanceof Error) || value.name !== "PrismaClientKnownRequestError") return false;
  const record = errorRecord(value), meta = errorRecord(record?.meta);
  if (record?.code !== "P2002" || meta?.modelName !== model) return false;
  const expected = model === "ResourceUpload" ? ["actorId", "startRequestId"] : model === "ResourceViewEvent" ? ["resourceId", "actorId", "requestId"] : ["actorId", "requestId"];
  const constraint = errorRecord(errorRecord(errorRecord(meta.driverAdapterError)?.cause)?.constraint);
  const target = meta.target ?? constraint?.fields;
  const index = `${model}_${expected.join("_")}_key`;
  return target === index || constraint?.index === index || (Array.isArray(target) && target.length === expected.length && expected.every(field => target.includes(field)));
}
export async function resourceTransaction<T>(context: ResourceContext, operation: (tx: Prisma.TransactionClient, actor: ResourceActor) => Promise<T>, isolationLevel: "RepeatableRead" | "Serializable" = "RepeatableRead", receiptModel?: "ResourceMutationReceipt" | "ResourceUpload" | "ResourceViewEvent"): Promise<T> {
  for (let attempt = 0; ; attempt++) try { return await (context.db ?? prisma).$transaction(async tx => operation(tx, await lockResourceActor(tx, context.actorId)), { isolationLevel, maxWait: 10000, timeout: 15000 }); }
  catch (error) { if (attempt >= 2 || !resourceTransactionConflict(error) && !(receiptModel && resourceReceiptConflict(error, receiptModel))) throw error; }
}
export function resourceWhere(input: { category: ResourceCategoryFilter; educationLevel: ResourceEducationLevelFilter; query: string }): Prisma.ResourcePostWhereInput {
  const and: Prisma.ResourcePostWhereInput[] = [];
  if (input.category !== "all") and.push({ category: input.category });
  if (input.category === "education" && input.educationLevel !== "all") and.push({ educationLevel: input.educationLevel });
  for (const term of getResourceSearchTerms(input.query)) and.push({ OR: [ { title: { contains: term, mode: "insensitive" } }, { summary: { contains: term, mode: "insensitive" } }, { author: { name: { contains: term, mode: "insensitive" } } }, { author: { department: { name: { contains: term, mode: "insensitive" } } } }, { attachments: { some: { originalName: { contains: term, mode: "insensitive" } } } } ] });
  return and.length ? { AND: and } : {};
}
export function mapMobileResource(record: ResourceRecord, actor: ResourceActor): MobileResource {
  return { id: record.id, title: record.title, summary: record.summary, category: isResourceCategory(record.category) ? record.category : "bajaul", educationLevel: isResourceEducationLevel(record.educationLevel ?? "") ? record.educationLevel as "common" | "high" | "middle" : null, pinned: record.pinned, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(), uniqueViewerCount: record.viewCount,
    author: { id: record.author.id, name: record.author.name, departmentName: record.author.department.name, positionName: record.author.position.name }, canManage: actor.id === record.authorId || actor.role === "ADMIN",
    attachments: record.attachments.map(file => ({ id: file.id, name: file.originalName, mimeType: file.mimeType, size: file.size, previewKind: getAttachmentPreviewKind(file.originalName, file.mimeType) ?? "unsupported" })) };
}
function mapWebResource(record: WebResourceRecord, actor: ResourceActor): ResourceLibraryItem {
  const mobile = mapMobileResource(record, actor);
  return { id: mobile.id, title: mobile.title, summary: mobile.summary, category: mobile.category, educationLevel: mobile.educationLevel, authorId: record.authorId, authorName: record.author.name, departmentName: record.author.department.name,
    author: { ...mobile.author, profileImageStorageKey: record.author.profileImageStorageKey, profileImageUpdatedAt: record.author.profileImageUpdatedAt?.toISOString() ?? null }, createdAt: mobile.createdAt, updatedAt: mobile.updatedAt, viewCount: mobile.uniqueViewerCount, pinned: mobile.pinned, attachments: mobile.attachments.map(file => ({ id: file.id, fileName: file.name, mimeType: file.mimeType, size: file.size })), canManage: mobile.canManage };
}
export async function getResourceRecord(tx: Prisma.TransactionClient, id: string): Promise<ResourceRecord> { const post = await tx.resourcePost.findUnique({ where: { id }, include: resourceInclude }); if (!post) throw new ResourceError("자료를 찾을 수 없습니다.", "NOT_FOUND", 404); return post; }
export async function getResourcePage(context: ResourceContext, query: ResourcePageQuery) {
  return resourceTransaction(context, async (tx, actor) => {
    const pageSize = getResourceLibraryPageSize(query.category), where = resourceWhere({ category: query.category, educationLevel: query.level, query: query.q }), total = await tx.resourcePost.count({ where }), totalPages = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(query.page, totalPages);
    const rows = await tx.resourcePost.findMany({ where, include: resourceInclude, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize });
    return { ...query, page, pageSize, total, totalPages, items: rows.map(row => mapMobileResource(row, actor)) };
  });
}
export async function getResourceOptions(context: ResourceContext) { return resourceTransaction(context, async tx => ({ defaults: { category: "bajaul" as const, educationLevel: null }, attachmentPolicy: await getAttachmentPolicySnapshot(tx) })); }
export async function getResourceDetail(context: ResourceContext, id: string, options: { editor?: boolean } = {}) { return resourceTransaction(context, async (tx, actor) => { const row = await getResourceRecord(tx, resourceId(id)); if (options.editor) assertResourceManager(actor, row); return mapMobileResource(row, actor); }); }
export async function getResourceEditor(context: ResourceContext, id: string) { return resourceTransaction(context, async (tx, actor) => { const row = await getResourceRecord(tx, resourceId(id)); assertResourceManager(actor, row); return { resource: mapMobileResource(row, actor), attachmentPolicy: await getAttachmentPolicySnapshot(tx) }; }); }
export async function getResourceViewers(context: ResourceContext, id: string, requestedPage = 1) {
  return resourceTransaction(context, async tx => {
    const post = await getResourceRecord(tx, resourceId(id)), where = { resourceId: id }, total = await tx.resourcePostView.count({ where }), pageSize = 20, totalPages = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(requestedPage, totalPages);
    const rows = await tx.resourcePostView.findMany({ where, orderBy: [{ lastViewedAt: "desc" }, { userId: "desc" }], skip: (page - 1) * pageSize, take: pageSize, select: { firstViewedAt: true, lastViewedAt: true, viewCount: true, user: { select: userSelect } } });
    return { resourceId: post.id, uniqueViewerCount: post.viewCount, page, pageSize, total, totalPages, items: rows.map(row => ({ user: { id: row.user.id, name: row.user.name, departmentName: row.user.department.name, positionName: row.user.position.name }, firstViewedAt: row.firstViewedAt.toISOString(), lastViewedAt: row.lastViewedAt.toISOString(), visitCount: row.viewCount })) };
  });
}
export async function getWebResourcePage(context: ResourceContext, input: { category: ResourceCategoryFilter; educationLevel: ResourceEducationLevelFilter; page: number; pageSize: number; query: string }): Promise<ResourceLibraryPage> {
  return resourceTransaction(context, async (tx, actor) => {
    const where = resourceWhere(input), total = await tx.resourcePost.count({ where }), totalPages = Math.max(1, Math.ceil(total / input.pageSize)), page = Math.min(Math.max(1, input.page), totalPages);
    const rows = await tx.resourcePost.findMany({ where, include: webResourceInclude, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * input.pageSize, take: input.pageSize });
    return { items: rows.map(row => mapWebResource(row, actor)), page, pageSize: input.pageSize, total, totalPages };
  });
}
export async function getWebResourceDetail(context: ResourceContext, id: string): Promise<ResourcePostDetail | null> {
  return resourceTransaction(context, async (tx, actor) => {
    const post = await tx.resourcePost.findUnique({ where: { id }, include: { ...webResourceInclude, views: { orderBy: [{ lastViewedAt: "desc" }, { userId: "desc" }], include: { user: { select: webUserSelect } } } } });
    if (!post) return null;
    return { ...mapWebResource(post, actor), viewers: post.views.map(row => ({ userId: row.user.id, name: row.user.name, departmentName: row.user.department.name, positionName: row.user.position.name, profileImageStorageKey: row.user.profileImageStorageKey, profileImageUpdatedAt: row.user.profileImageUpdatedAt?.toISOString() ?? null, firstViewedAt: row.firstViewedAt.toISOString(), lastViewedAt: row.lastViewedAt.toISOString(), viewCount: row.viewCount })) };
  });
}
