import "server-only";
import { AuditAction, Prisma } from "@/generated/prisma/client";
import { YouthError, youthId, nextYouthTimestamp } from "@/lib/mobile-youth-core";
import { assertYouthPermission, lockOperationalYouth, lockYouthRequest, mapYouthBasic, withYouthMutation, withYouthRead, youthPayloadHash, youthPermissions, youthTransaction, type YouthActor } from "@/lib/youth-mobile-context";
import { consumeYouthDecisionUploads, type YouthDecisionContext } from "@/lib/youth-decision-uploads";
import { enqueueYouthDecisionFileCleanup, queueYouthDecisionUploadFiles, safelyReconcileYouthDecisionFiles } from "@/lib/youth-decision-file-cleanup";
import { parseYouthDocumentAttach, parseYouthDocumentDelete, parseYouthDecisionDownload, type YouthDecisionDownloadInput } from "@/lib/youth-decision-file-core";
const reasonLabels = { CASE_SUPPORT: "사건 지원 업무", EXTERNAL_SUBMISSION: "법원·보호관찰소 등 외부기관 제출", INTERNAL_REVIEW: "기관 내부 검토", OTHER: "기타" } as const;
const documentSelect = { id: true, youthId: true, originalName: true, storageProvider: true, storageKey: true, mimeType: true, size: true, createdAt: true, updatedAt: true } satisfies Prisma.YouthDecisionDocumentSelect;
type DocumentSnapshot = { document: Prisma.YouthDecisionDocumentGetPayload<{ select: typeof documentSelect }>; youthUpdatedAt: Date };
async function parentResult(tx: Prisma.TransactionClient, actor: YouthActor, today: string, id: string) { return { today, permissions: youthPermissions(actor), youth: mapYouthBasic(await lockOperationalYouth(tx, id, today)) }; }
export async function getYouthDecisionDocuments(context: YouthDecisionContext, id: string) {
  return withYouthRead(context, async (tx, actor, today) => { assertYouthPermission(actor, "canDownloadYouthDocuments"); await lockOperationalYouth(tx, youthId(id), today); const rows = await tx.youthDecisionDocument.findMany({ where: { youthId: id }, select: { id: true, originalName: true, size: true, createdAt: true, updatedAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }); return { today, permissions: youthPermissions(actor), youthId: id, documents: rows.map(row => ({ id: row.id, name: row.originalName, size: row.size, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })) }; });
}
export async function attachYouthDecisionDocuments(context: YouthDecisionContext, id: string, raw: unknown) {
  id = youthId(id); const input = parseYouthDocumentAttach(raw);
  const result = await withYouthMutation(context, { operation: "document.attach", requestId: input.requestId, payload: input, youthId: id, targetType: "Youth", targetId: id, replay: (tx, actor, today) => parentResult(tx, actor, today, id) }, async (tx, actor, today, now, receiptId) => {
    const parent = await lockOperationalYouth(tx, id, today, { write: true }); if (parent.updatedAt.toISOString() !== input.expectedYouthUpdatedAt) throw new YouthError("청소년 정보가 변경됐습니다. 최신 내용을 확인하세요.", "YOUTH_CONFLICT", 409);
    await consumeYouthDecisionUploads(tx, actor.id, id, receiptId, input.uploadIds, now);
    const updatedAt = nextYouthTimestamp(parent.updatedAt, now); await tx.youth.update({ where: { id }, data: { updatedAt } });
    await tx.auditLog.create({ data: { actorId: actor.id, ...context.requestData, action: AuditAction.UPDATE_YOUTH, targetType: "Youth", targetId: id, message: "청소년 결정문을 첨부했습니다.", metadata: { youthId: id, changeType: "youth.documents.add", decisionDocumentCount: input.uploadIds.length } } });
    return { targetId: id, committedUpdatedAt: updatedAt, result: await parentResult(tx, actor, today, id) };
  });
  await safelyReconcileYouthDecisionFiles(context); return result;
}
export async function deleteYouthDecisionDocument(context: YouthDecisionContext, documentId: string, raw: unknown) {
  documentId = youthId(documentId); const input = parseYouthDocumentDelete(raw);
  const result = await withYouthMutation(context, { operation: "document.delete", requestId: input.requestId, payload: input, youthId: input.youthId, targetType: "YouthDecisionDocument", targetId: documentId, replay: (tx, actor, today) => parentResult(tx, actor, today, input.youthId) }, async (tx, actor, today, now, receiptId) => {
    const parent = await lockOperationalYouth(tx, input.youthId, today, { write: true }); if (parent.updatedAt.toISOString() !== input.expectedYouthUpdatedAt) throw new YouthError("청소년 정보가 변경됐습니다. 최신 내용을 확인하세요.", "YOUTH_CONFLICT", 409);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "YouthDecisionDocument" WHERE "id" = ${documentId} FOR UPDATE`);
    const document = await tx.youthDecisionDocument.findUnique({ where: { id: documentId }, select: documentSelect }); if (!document || document.youthId !== input.youthId) throw new YouthError("결정문을 찾을 수 없습니다.", "NOT_FOUND", 404);
    if (document.updatedAt.toISOString() !== input.expectedDocumentUpdatedAt) throw new YouthError("결정문이 변경됐습니다. 최신 내용을 확인하세요.", "YOUTH_CONFLICT", 409);
    const upload = await tx.youthDecisionUpload.findFirst({ where: { consumedDocumentId: document.id, consumedYouthId: input.youthId, storageProvider: document.storageProvider, finalKey: document.storageKey, purpose: "youth-decision" } });
    await tx.youthDecisionDocument.delete({ where: { id: document.id } });
    if (upload) { await tx.youthDecisionUpload.update({ where: { id: upload.id }, data: { state: "deleting", terminalReason: "deleted", originalName: null, mimeType: null, size: null, expectedSha256: null, plaintextSha256: null, storedSha256: null, storedSize: null } }); await queueYouthDecisionUploadFiles(tx, upload, now, receiptId, input.youthId); }
    else await enqueueYouthDecisionFileCleanup(tx, { ref: document, objectKind: "legacy", sourceMutationId: receiptId, youthId: input.youthId }, now);
    const updatedAt = nextYouthTimestamp(parent.updatedAt, now); await tx.youth.update({ where: { id: input.youthId }, data: { updatedAt } });
    await tx.auditLog.create({ data: { actorId: actor.id, ...context.requestData, action: AuditAction.UPDATE_YOUTH, targetType: "Youth", targetId: input.youthId, message: "청소년 결정문을 삭제했습니다.", metadata: { youthId: input.youthId, documentId: document.id, changeType: "youth.documents.delete", decisionDocumentCount: 1 } } });
    return { targetId: document.id, committedUpdatedAt: updatedAt, result: await parentResult(tx, actor, today, input.youthId) };
  });
  await safelyReconcileYouthDecisionFiles(context); return result;
}
async function documentSnapshot(tx: Prisma.TransactionClient, actor: YouthActor, id: string, today: string, retainedAdmin: boolean): Promise<DocumentSnapshot> {
  assertYouthPermission(actor, "canDownloadYouthDocuments");
  const document = await tx.youthDecisionDocument.findUnique({ where: { id }, select: documentSelect }); if (!document) throw new YouthError("결정문을 찾을 수 없습니다.", "NOT_FOUND", 404);
  let parent: { updatedAt: Date };
  if (retainedAdmin && actor.role === "ADMIN") {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Youth" WHERE "id" = ${document.youthId} FOR SHARE`);
    const row = await tx.youth.findUnique({ where: { id: document.youthId }, select: { updatedAt: true, purgeStartedAt: true, purgedAt: true } }); if (!row || row.purgeStartedAt || row.purgedAt) throw new YouthError("결정문을 찾을 수 없습니다.", "NOT_FOUND", 404); parent = row;
  } else parent = await lockOperationalYouth(tx, document.youthId, today);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "YouthDecisionDocument" WHERE "id" = ${id} FOR SHARE`);
  const fresh = await tx.youthDecisionDocument.findUnique({ where: { id }, select: documentSelect }); if (!fresh || fresh.youthId !== document.youthId) throw new YouthError("결정문을 찾을 수 없습니다.", "NOT_FOUND", 404);
  return { document: fresh, youthUpdatedAt: parent.updatedAt };
}
function assertSameSnapshot(snapshot: DocumentSnapshot, current: DocumentSnapshot) {
  const a = snapshot.document, b = current.document;
  if (snapshot.youthUpdatedAt.getTime() !== current.youthUpdatedAt.getTime() || a.id !== b.id || a.youthId !== b.youthId || a.updatedAt.getTime() !== b.updatedAt.getTime() || a.storageProvider !== b.storageProvider || a.storageKey !== b.storageKey || a.size !== b.size) throw new YouthError("결정문이 변경됐습니다. 새로 다운로드를 요청하세요.", "VIEW_SNAPSHOT_CHANGED", 409);
}
export async function recordYouthDecisionDownloadFailure(context: YouthDecisionContext, id: string, outcome: "forbidden" | "invalid_reason" | "not_found" | "storage_error", input?: YouthDecisionDownloadInput) {
  try { await youthTransaction(context, async (tx, actor) => { await tx.auditLog.create({ data: { actorId: actor.id, ...context.requestData, action: AuditAction.DOWNLOAD_YOUTH_DECISION_DOCUMENT, targetType: "YouthDecisionDocument", targetId: id, message: "결정문 다운로드 요청을 완료하지 못했습니다.", metadata: { outcome, ...(input ? { reason: input.reason, reasonLabel: reasonLabels[input.reason], ...(input.reason === "OTHER" && input.reasonDetail ? { reasonDetail: input.reasonDetail } : {}) } : {}) } } }); }, { write: true }); } catch { /* No bytes are exposed after a failed request or audit. */ }
}
async function recordDisclosure(context: YouthDecisionContext, snapshot: DocumentSnapshot, input: YouthDecisionDownloadInput, retainedAdmin: boolean) {
  try { return await youthTransaction(context, async (tx, actor, today, now) => {
    const current = await documentSnapshot(tx, actor, snapshot.document.id, today, retainedAdmin); assertSameSnapshot(snapshot, current);
    await lockYouthRequest(tx, actor.id, input.requestId, "youth-view");
    const hash = youthPayloadHash({ documentId: snapshot.document.id, reason: input.reason, reasonDetail: input.reasonDetail });
    const old = await tx.youthViewRequest.findUnique({ where: { actorId_requestId: { actorId: actor.id, requestId: input.requestId } } });
    if (old) {
      if (old.kind !== "decision-download" || old.youthId !== current.document.youthId || old.documentId !== current.document.id || old.state !== "recorded" || old.requestHash !== hash) throw new YouthError("같은 다운로드 요청의 내용이 변경됐습니다.", "REQUEST_CONFLICT", 409);
      if (!old.sourceUpdatedAt || old.sourceUpdatedAt.getTime() !== current.youthUpdatedAt.getTime() || !old.sourceFileUpdatedAt || old.sourceFileUpdatedAt.getTime() !== current.document.updatedAt.getTime()) throw new YouthError("결정문이 변경됐습니다. 새로 요청하세요.", "VIEW_SNAPSHOT_CHANGED", 409);
      if (!old.disclosureUntil || old.disclosureUntil <= now) throw new YouthError("다운로드 요청이 만료됐습니다. 새로 요청하세요.", "VIEW_REQUEST_EXPIRED", 410);
      return;
    }
    const audit = await tx.auditLog.create({ data: { actorId: actor.id, ...context.requestData, action: AuditAction.DOWNLOAD_YOUTH_DECISION_DOCUMENT, targetType: "YouthDecisionDocument", targetId: current.document.id, message: "결정문 다운로드를 요청했습니다.", metadata: { youthId: current.document.youthId, outcome: "downloaded", reason: input.reason, reasonLabel: reasonLabels[input.reason], ...(input.reason === "OTHER" && input.reasonDetail ? { reasonDetail: input.reasonDetail } : {}) } } });
    await tx.youthViewRequest.create({ data: { actorId: actor.id, requestId: input.requestId, youthId: current.document.youthId, kind: "decision-download", documentId: current.document.id, requestHash: hash, sourceUpdatedAt: current.youthUpdatedAt, sourceFileUpdatedAt: current.document.updatedAt, auditLogId: audit.id, auditedAt: now, disclosureUntil: new Date(now.getTime() + 300000), createdAt: now } });
  }, { write: true, receiptModel: "YouthViewRequest" }); } catch (error) { if (error instanceof YouthError) throw error; throw new YouthError("다운로드 이력을 기록하지 못했습니다. 같은 요청으로 확인하세요.", "AUDIT_UNAVAILABLE", 503); }
}
export async function downloadYouthDecisionDocument(context: YouthDecisionContext, id: string, raw: unknown, options: { retainedAdmin?: boolean } = {}) {
  id = youthId(id); const input = parseYouthDecisionDownload(raw), retainedAdmin = options.retainedAdmin === true && context.client === "web";
  let snapshot: DocumentSnapshot;
  try { snapshot = await withYouthRead(context, (tx, actor, today) => documentSnapshot(tx, actor, id, today, retainedAdmin)); }
  catch (error) { if (error instanceof YouthError && [403, 404].includes(error.status)) await recordYouthDecisionDownloadFailure(context, id, error.status === 403 ? "forbidden" : "not_found", input); throw error; }
  const storage = context.storage ?? await import("@/lib/resource-file-storage");
  try {
    const proof = await withYouthRead(context, async tx => tx.youthDecisionUpload.findFirst({ where: { consumedDocumentId: id, consumedYouthId: snapshot.document.youthId, storageProvider: snapshot.document.storageProvider, finalKey: snapshot.document.storageKey, state: "consumed", purpose: "youth-decision" }, select: { plaintextSha256: true } }));
    const result = await storage.readResourceStoredFile(snapshot.document, { expectedSize: snapshot.document.size, ...(proof?.plaintextSha256 ? { expectedSha256: proof.plaintextSha256 } : {}), signal: AbortSignal.timeout(35000), beforeExpose: () => recordDisclosure(context, snapshot, input, retainedAdmin) });
    return { ...result, file: { name: snapshot.document.originalName, mimeType: snapshot.document.mimeType } };
  } catch (error) { if (error instanceof YouthError) throw error; await recordYouthDecisionDownloadFailure(context, id, "storage_error", input); throw new YouthError("결정문 파일을 검증하지 못했습니다. 같은 요청으로 확인하세요.", "STORAGE_UNAVAILABLE", 503); }
}
