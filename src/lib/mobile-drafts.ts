import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { AuditAction, DocumentStatus, Prisma, UserStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { MobileDraftError, mobileDraftDigest, parseMobileDraft, parseMobileUpload, mobileDraftId, mobileDraftAuditProof, type MobileDraftSaveResult, type MobileDraftRequestStatus, type MobileDraftDocumentStatus } from "@/lib/mobile-draft-core";
import { createApprovalDocument, updateDraftDocument, deleteDocumentAttachment } from "@/lib/approval-mutations";
import { lockApprovalDocument } from "@/lib/approval-document-lock";
import { APPROVAL_AUTHORITY_POSITION_NAME, getApprovalAuthorityLineError } from "@/lib/approval-authority";
import { getApprovalLinePolicyError } from "@/lib/approval-line-policy";
import { getAttachmentPolicy, getAttachmentPolicySnapshot } from "@/lib/attachment-policy";
import { encryptStoredAttachmentInPlace, getSignedUploadUrlForAttachment, readStoredAttachmentFile, removeStoredAttachmentFiles } from "@/lib/attachment-storage";
import { compileDocumentTemplateContentFromSchema, getDocumentTemplateInitialFieldValues, getSafeRenderableDocumentTemplateFields, validateDocumentTemplateContentValues } from "@/lib/draft-template-content";
import { hasDraftFormErrors, validateDraftFormValues } from "@/lib/draft-form-state";
import { attachGeneratedApprovalPdfToDocument, getGeneratedApprovalPdfStorageError } from "@/lib/generated-approval-pdf";

import { mobileDraftTransaction, type MobileDraftDependencies } from "@/lib/mobile-draft-context";
import { readMobileDraftJson } from "@/lib/mobile-draft-json";
export type { MobileDraftDependencies } from "@/lib/mobile-draft-context";

const editableStatuses: DocumentStatus[] = [DocumentStatus.DRAFT, DocumentStatus.RECALLED];

function draftJson(value: unknown, status = 200) {
  const response = mobileJson(value, status);
  response.headers.set("Vary", "Authorization, Cookie");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
export async function mobileDraftRoute(request: Request, action: (userId: string) => Promise<unknown>) {
  try {
    const session = await getMobileSession(request);
    if (!session) return draftJson({ error: "로그인이 필요합니다.", code: "UNAUTHORIZED" }, 401);
    return draftJson(await action(session.userId));
  } catch (error) {
    if (error instanceof MobileDraftError) return draftJson({ error: error.message, fields: error.fields, code: error.code }, error.status);
    console.error("Mobile draft request failed", error instanceof Error ? error.name : "UnknownError");
    return draftJson({ error: "요청을 처리하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도하세요.", code: "INTERNAL_ERROR" }, 500);
  }
}
export const mobileDraftBody = readMobileDraftJson;

export async function getMobileDraftOptions(userId: string, dependencies: MobileDraftDependencies = {}) {
  return mobileDraftTransaction(userId, dependencies, async tx => {
    const [templates, approvers, attachmentPolicy] = await Promise.all([
      tx.documentTemplate.findMany({ where: { isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, schema: true } }),
      tx.user.findMany({ where: { id: { not: userId }, status: UserStatus.ACTIVE, position: { name: APPROVAL_AUTHORITY_POSITION_NAME } }, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, position: { select: { name: true } } } }),
      getAttachmentPolicySnapshot(tx),
    ]);
    return { templates: templates.map(t => ({ id: t.id, name: t.name, fields: getSafeRenderableDocumentTemplateFields(t.schema), initialValues: getDocumentTemplateInitialFieldValues(t.schema, "") })), approvers: approvers.map(a => ({ id: a.id, name: a.name, positionName: a.position.name })), attachmentPolicy };
  });
}

export async function getMobileDraftList(userId: string, dependencies: MobileDraftDependencies = {}) {
  return mobileDraftTransaction(userId, dependencies, async tx => {
    const where = { drafterId: userId, status: { in: editableStatuses } };
    const [total, documents] = await Promise.all([
      tx.approvalDocument.count({ where }),
      tx.approvalDocument.findMany({ where, take: 50, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], select: { id: true, title: true, category: true, status: true, updatedAt: true, _count: { select: { attachments: true } } } }),
    ]);
    return { total, documents: documents.map(d => ({ id: d.id, title: d.title, category: d.category, status: d.status.toLowerCase(), updatedAt: d.updatedAt.toISOString(), attachmentCount: d._count.attachments })) };
  });
}

export async function getMobileDraft(userId: string, id: string, dependencies: MobileDraftDependencies = {}) {
  return mobileDraftTransaction(userId, dependencies, async tx => {
    mobileDraftId(id);
    const d = await tx.approvalDocument.findFirst({ where: { id, drafterId: userId, status: { in: editableStatuses } }, select: { id: true, title: true, templateId: true, status: true, content: true, updatedAt: true, template: { select: { schema: true } }, approvalSteps: { orderBy: { order: "asc" }, select: { approverId: true } }, attachments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, originalName: true, mimeType: true, size: true } } } });
    if (!d) throw new MobileDraftError("수정할 수 있는 내 기안 문서를 찾을 수 없습니다.", 404);
    return { draft: { id: d.id, title: d.title, templateId: d.templateId, status: d.status.toLowerCase(), fieldValues: getDocumentTemplateInitialFieldValues(d.template.schema, d.content), approverIds: d.approvalSteps.map(s => s.approverId), updatedAt: d.updatedAt.toISOString(), attachments: d.attachments.map(a => ({ id: a.id, name: a.originalName, size: a.size, mimeType: a.mimeType })) } };
  });
}

const auditSelect = { targetType: true, targetId: true, documentId: true, action: true, createdAt: true, metadata: true } as const;
const requestActions = [AuditAction.CREATE_DRAFT, AuditAction.UPDATE_DRAFT, AuditAction.SUBMIT];
export async function getMobileDraftRequestStatus(userId: string, requestId: string, originalDocumentId: string | null = null, dependencies: MobileDraftDependencies = {}): Promise<MobileDraftRequestStatus> {
  return mobileDraftTransaction(userId, dependencies, async tx => {
    mobileDraftId(requestId, true);
    if (originalDocumentId !== null) mobileDraftId(originalDocumentId);
    const audit = await tx.auditLog.findFirst({ where: { actorId: userId, action: { in: requestActions }, metadata: { path: ["mobileRequestId"], equals: requestId } }, select: auditSelect });
    if (!audit) throw new MobileDraftError("저장 요청의 처리 결과를 확인할 수 없습니다.", 404);
    const proof = mobileDraftAuditProof(audit, requestId);
    if (!proof) throw new MobileDraftError("이전 요청의 확정 정보를 확인할 수 없습니다. 기안함에서 문서를 확인하세요.", 409, undefined, "REQUEST_PROOF_UNAVAILABLE");
    if (proof.originalDocumentId !== originalDocumentId) throw new MobileDraftError("저장 요청의 문서 범위가 일치하지 않습니다.", 409, undefined, "REQUEST_SCOPE_CONFLICT");
    const doc = await tx.approvalDocument.findFirst({ where: { id: proof.documentId, drafterId: userId }, select: { status: true, updatedAt: true } });
    return { ok: true, ...proof, outcome: doc ? "present" : "deleted", current: doc ? { status: doc.status.toLowerCase() as MobileDraftDocumentStatus, updatedAt: doc.updatedAt.toISOString(), editable: editableStatuses.includes(doc.status) } : null };
  });
}

export async function saveMobileDraft(userId: string, value: unknown, documentId: string | null = null, dependencies: MobileDraftDependencies = {}): Promise<MobileDraftSaveResult> {
  const input = parseMobileDraft(value);
  const hash = mobileDraftDigest(input, documentId);
  if (documentId !== null) mobileDraftId(documentId);
  const result = await mobileDraftTransaction(userId, dependencies, async (tx, now) => {
    await tx.$queryRaw(Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`mobile-draft:${userId}:${input.requestId}`}))`);
    const previous = await tx.auditLog.findFirst({ where: { actorId: userId, action: { in: [AuditAction.CREATE_DRAFT, AuditAction.UPDATE_DRAFT, AuditAction.SUBMIT] }, metadata: { path: ["mobileRequestId"], equals: input.requestId } }, select: auditSelect });
    if (previous) {
      const metadata = previous.metadata as Record<string, unknown> | null;
      if (metadata?.mobilePayloadHash !== hash) throw new MobileDraftError("같은 저장 요청의 내용이 변경되었습니다. 다시 저장하세요.", 409, undefined, "REQUEST_CONFLICT");
      const doc = previous.documentId && await tx.approvalDocument.findFirst({ where: { id: previous.documentId, drafterId: userId }, select: { id: true, status: true, updatedAt: true } });
      if (!doc) throw new MobileDraftError("이미 처리된 문서를 찾을 수 없습니다.", 410, undefined, "REQUEST_ALREADY_DELETED");
      return { ...doc, replayed: true, proof: mobileDraftAuditProof(previous, input.requestId) ?? undefined };
    }
    const policy = await getAttachmentPolicySnapshot(tx);
    const action = input.intent === "submit" ? AuditAction.SUBMIT : documentId ? AuditAction.UPDATE_DRAFT : AuditAction.CREATE_DRAFT;
    let previousUpdatedAt: Date | null = null;
    let priorAuditIds: string[] = [];
    let attachmentCount = 0;
    if (documentId) {
      await lockApprovalDocument(tx, documentId);
      const doc = await tx.approvalDocument.findFirst({ where: { id: documentId, drafterId: userId, status: { in: editableStatuses } }, select: { updatedAt: true, _count: { select: { attachments: true } } } });
      if (!doc) throw new MobileDraftError("수정할 수 있는 내 기안 문서를 찾을 수 없습니다.", 404);
      if (!input.expectedUpdatedAt || doc.updatedAt.getTime() !== Date.parse(input.expectedUpdatedAt)) throw new MobileDraftError("다른 화면에서 문서가 변경되었습니다. 입력 내용을 복사한 뒤 문서를 다시 열어주세요.", 409);
      attachmentCount = doc._count.attachments;
      previousUpdatedAt = doc.updatedAt;
      priorAuditIds = (await tx.auditLog.findMany({ where: { actorId: userId, documentId, action }, select: { id: true } })).map(audit => audit.id);
    }
    const template = await tx.documentTemplate.findFirst({ where: { id: input.templateId, isActive: true } });
    if (!template) throw new MobileDraftError("사용 가능한 문서 양식을 선택하세요.", 400, { templateId: "사용 가능한 문서 양식을 선택하세요." });
    const content = compileDocumentTemplateContentFromSchema(template.schema, input.fieldValues);
    const errors = validateDraftFormValues({ ...input, category: template.name, content }, { currentUserId: userId, intent: input.intent, submittedApproverIds: input.approverIds, attachmentError: input.intent === "submit" ? getGeneratedApprovalPdfStorageError() ?? undefined : undefined });
    if (input.intent === "submit") {
      const fieldErrors = validateDocumentTemplateContentValues(template.schema, input.fieldValues);
      if (fieldErrors.length) errors.content = fieldErrors[0];
    }
    if (hasDraftFormErrors(errors)) throw new MobileDraftError(Object.values(errors)[0]!, 400, errors, "VALIDATION_ERROR");
    const candidates = await tx.user.findMany({ where: { id: { in: input.approverIds }, status: UserStatus.ACTIVE }, select: { id: true, name: true, position: { select: { name: true, level: true } } } });
    if (candidates.length !== input.approverIds.length) throw new MobileDraftError("사용 가능한 결재자만 지정할 수 있습니다.", 400, { approvers: "결재자를 다시 선택하세요." });
    const approvers = input.approverIds.map(id => candidates.find(a => a.id === id)!);
    const line = approvers.map(a => ({ name: a.name, positionName: a.position.name, positionLevel: a.position.level }));
    const lineError = getApprovalLinePolicyError(line) ?? (input.intent === "submit" ? getApprovalAuthorityLineError(line) : null);
    if (lineError) throw new MobileDraftError(lineError, 400, { approvers: lineError });
    if (attachmentCount + input.uploadIds.length > policy.maxFileCount) throw new MobileDraftError(`첨부파일은 ${policy.maxFileCount}개까지 등록할 수 있습니다.`);
    for (const id of [...input.uploadIds].sort()) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "MobileDraftUpload" WHERE "id" = ${id} FOR UPDATE`);
    const uploads = await tx.mobileDraftUpload.findMany({ where: { id: { in: input.uploadIds }, userId, documentId: null, completedAt: { not: null }, expiresAt: { gt: now } } });
    if (uploads.length !== input.uploadIds.length) throw new MobileDraftError("첨부파일 업로드가 만료되었거나 완료되지 않았습니다. 파일을 제거한 뒤 다시 첨부하세요.", 400);
    for (const upload of uploads) parseMobileUpload({ name: upload.originalName, size: upload.size, mimeType: upload.mimeType }, policy);
    const data = { title: input.title || "제목 없는 기안", category: template.name, content, templateId: template.id, approvers, attachments: uploads.map(u => ({ originalName: u.originalName, mimeType: u.mimeType, size: u.size, storageProvider: u.storageProvider, storageKey: u.storageKey })), submitImmediately: input.intent === "submit" };
    let id: string;
    if (documentId) {
      const update = await updateDraftDocument({ ...data, actorId: userId, documentId }, tx);
      if (!update.ok) throw new MobileDraftError(update.message, 409);
      id = update.documentId;
    } else id = (await createApprovalDocument({ ...data, drafterId: userId }, tx)).id;
    await tx.mobileDraftUpload.updateMany({ where: { id: { in: input.uploadIds }, userId }, data: { documentId: id } });
    let doc = await tx.approvalDocument.findUniqueOrThrow({ where: { id }, select: { id: true, status: true, updatedAt: true } });
    if (previousUpdatedAt && doc.updatedAt.getTime() <= previousUpdatedAt.getTime()) {
      doc = await tx.approvalDocument.update({ where: { id }, data: { updatedAt: new Date(previousUpdatedAt.getTime() + 1) }, select: { id: true, status: true, updatedAt: true } });
    }
    // Select the audit created by this effect, even if two audits share the same millisecond.
    const audit = await tx.auditLog.findFirstOrThrow({ where: { actorId: userId, documentId: id, action, id: { notIn: priorAuditIds } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, ...auditSelect } });
    const metadata = audit.metadata && typeof audit.metadata === "object" && !Array.isArray(audit.metadata) ? audit.metadata : {};
    const bound = await tx.auditLog.update({ where: { id: audit.id }, data: { metadata: { ...metadata, mobileRequestId: input.requestId, mobilePayloadHash: hash, mobileOriginalDocumentId: documentId, mobileIntent: input.intent, mobileCommittedUpdatedAt: doc.updatedAt.toISOString(), source: "mobile" } }, select: auditSelect });
    const proof = mobileDraftAuditProof(bound, input.requestId);
    if (!proof) throw new Error("Mobile draft audit binding failed");
    return { ...doc, replayed: false, proof };
  }, true);
  if (input.intent === "submit" && !result.replayed) {
    try { await (dependencies.generatePdf ?? attachGeneratedApprovalPdfToDocument)(result.id, userId); }
    catch { console.error("Mobile approval PDF generation failed"); }
  }
  for (const path of ["/", "/drafts", "/inbox", "/sent", `/documents/${result.id}`]) {
    try { await (dependencies.cache ?? revalidatePath)(path); }
    catch { console.error("Mobile draft cache refresh failed"); }
  }
  return { documentId: result.id, status: result.status.toLowerCase(), updatedAt: result.updatedAt.toISOString(), ...(result.proof ? { proof: result.proof } : {}) };
}

export async function createMobileUpload(userId: string, value: unknown) {
  const file = parseMobileUpload(value, await getAttachmentPolicy());
  await cleanupExpiredUploads(userId);
  if (await prisma.mobileDraftUpload.count({ where: { userId, documentId: null } }) >= 30) throw new MobileDraftError("미완료 첨부파일이 많습니다. 기존 기안을 저장하거나 잠시 후 다시 시도하세요.", 429);
  const signed = await getSignedUploadUrlForAttachment(file.originalName, file.mimeType);
  if (!signed) throw new MobileDraftError("모바일 첨부파일 저장소가 설정되지 않았습니다. 관리자에게 문의하세요.", 503);
  const id = randomUUID();
  await prisma.mobileDraftUpload.create({ data: { id, userId, ...file, storageProvider: signed.provider, storageKey: signed.storageKey, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) } });
  return { uploadId: id, uploadUrl: signed.uploadUrl, mimeType: file.mimeType };
}

async function lockedUpload(tx: Prisma.TransactionClient, userId: string, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "MobileDraftUpload" WHERE "id" = ${id} FOR UPDATE`);
  const upload = await tx.mobileDraftUpload.findFirst({ where: { id, userId, documentId: null } });
  if (!upload) throw new MobileDraftError("첨부파일을 찾을 수 없습니다.", 404);
  return upload;
}

export async function completeMobileUpload(userId: string, id: string) {
  return prisma.$transaction(async tx => {
    const upload = await lockedUpload(tx, userId, id);
    if (upload.expiresAt.getTime() <= Date.now()) throw new MobileDraftError("첨부파일 업로드가 만료되었습니다. 파일을 다시 첨부하세요.", 410);
    if (!upload.completedAt) {
      const file = await readStoredAttachmentFile(upload);
      await file.body.cancel();
      if (file.size !== upload.size) throw new MobileDraftError("업로드된 파일 크기가 일치하지 않습니다. 파일을 다시 첨부하세요.");
      await encryptStoredAttachmentInPlace(upload, upload.mimeType);
      await tx.mobileDraftUpload.update({ where: { id }, data: { completedAt: new Date() } });
    }
    return { uploadId: id };
  }, { timeout: 55_000 });
}

export async function deleteMobileUpload(userId: string, id: string) {
  await prisma.$transaction(async tx => {
    const upload = await lockedUpload(tx, userId, id);
    await removeStoredAttachmentFiles([upload], { signal: AbortSignal.timeout(10_000) });
    await tx.mobileDraftUpload.delete({ where: { id } });
  }, { timeout: 15_000 });
  return { ok: true };
}

async function cleanupExpiredUploads(userId: string) {
  const uploads = await prisma.mobileDraftUpload.findMany({ where: { userId, documentId: null, expiresAt: { lte: new Date() } }, take: 3, orderBy: { expiresAt: "asc" }, select: { id: true } });
  for (const upload of uploads) await deleteMobileUpload(userId, upload.id).catch(() => undefined);
}

export async function deleteMobileDraftAttachment(userId: string, documentId: string, attachmentId: string) {
  const result = await deleteDocumentAttachment(documentId, attachmentId, userId);
  if (!result.ok) throw new MobileDraftError(result.message, 409);
  return getMobileDraft(userId, documentId);
}
