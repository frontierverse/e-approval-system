import "server-only";
import { revalidatePath } from "next/cache";
import { AuditAction } from "@/generated/prisma/client";
import { lockApprovalDocument } from "@/lib/approval-document-lock";
import { canDeleteDraftDocumentByPolicy } from "@/lib/approval-permissions-core";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { removeStoredAttachmentFiles } from "@/lib/attachment-storage";
import { MobileDraftError, mobileDraftId, mobileDraftTimestamp } from "@/lib/mobile-draft-core";
import { mobileDraftTransaction, type MobileDraftDependencies } from "@/lib/mobile-draft-context";

type DeleteDependencies = MobileDraftDependencies & { removeAttachments?: typeof removeStoredAttachmentFiles };

/** The version is also the retry token. A lost response can never delete a later edit. */
export async function deleteMobileDraft(userId: string, documentId: string, value: unknown, dependencies: DeleteDependencies = {}) {
  mobileDraftId(documentId);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => key !== "expectedUpdatedAt")) {
    throw new MobileDraftError("삭제할 문서의 수정 정보를 확인하세요.");
  }
  const version = (value as Record<string, unknown>).expectedUpdatedAt;
  if (!mobileDraftTimestamp(version) || version.length > 32) throw new MobileDraftError("문서 수정 정보를 확인할 수 없습니다. 문서를 다시 열어주세요.");
  const auditRequestData = await getCurrentAuditLogRequestData();
  const attachments = await mobileDraftTransaction(userId, dependencies, async tx => {
    await lockApprovalDocument(tx, documentId);
    const document = await tx.approvalDocument.findUnique({ where: { id: documentId }, select: {
      id: true, title: true, drafterId: true, status: true, updatedAt: true,
      attachments: { select: { storageProvider: true, storageKey: true } },
    } });
    if (!document) {
      // Audit targetId survives ApprovalDocument deletion (documentId becomes null).
      const previous = await tx.auditLog.findFirst({ where: {
        actorId: userId, targetType: "ApprovalDocument", targetId: documentId, action: AuditAction.DELETE_DRAFT,
        metadata: { path: ["mobileDeleteExpectedUpdatedAt"], equals: version },
      }, select: { id: true } });
      if (previous) return [];
      throw new MobileDraftError("삭제할 내 임시저장 문서를 찾을 수 없습니다.", 404);
    }
    if (document.drafterId !== userId) throw new MobileDraftError("삭제할 내 임시저장 문서를 찾을 수 없습니다.", 404);
    if (!canDeleteDraftDocumentByPolicy(userId, document)) throw new MobileDraftError("임시저장 상태의 문서만 삭제할 수 있습니다. 최신 상태를 확인하세요.", 409);
    if (document.updatedAt.toISOString() !== version) throw new MobileDraftError("다른 화면에서 문서가 변경되어 삭제하지 않았습니다. 최신 내용을 확인하세요.", 409);
    await tx.auditLog.create({ data: {
      actorId: userId, ...auditRequestData, action: AuditAction.DELETE_DRAFT,
      targetType: "ApprovalDocument", targetId: document.id, documentId: document.id,
      message: `"${document.title}" 임시저장 문서를 삭제했습니다.`,
      metadata: { source: "mobile", mobileDeleteExpectedUpdatedAt: version },
    } });
    await tx.approvalDocument.delete({ where: { id: document.id } });
    return document.attachments;
  }, true);
  // Remove blobs only after the document/audit transaction commits.
  try { if (attachments.length) await (dependencies.removeAttachments ?? removeStoredAttachmentFiles)(attachments); }
  catch { console.error("Failed to remove deleted mobile draft attachments"); }
  for (const path of ["/", "/drafts", "/sent", "/work-schedule/work-log", `/documents/${documentId}`]) {
    try { await (dependencies.cache ?? revalidatePath)(path); }
    catch { console.error("Mobile draft delete cache refresh failed"); }
  }
  return { ok: true, documentId, deleted: true } as const;
}
