import { AuditAction, type Prisma } from "@/generated/prisma/client";

export const invalidApprovalPdfPrefix = "[효력 취소] ";

export const automaticApprovalPdfAuditFilter = {
  action: AuditAction.UPDATE_DRAFT,
  targetType: "Attachment",
  OR: [
    { metadata: { path: ["generatedApprovalPdfType"], equals: "IN_PROGRESS" } },
    { metadata: { path: ["generatedApprovalPdfType"], equals: "FINAL_APPROVED" } },
    { message: "결재본 PDF를 자동 갱신했습니다." },
    { message: "최종 승인본 PDF를 자동 생성했습니다." },
  ],
} satisfies Prisma.AuditLogWhereInput;

/** Retain original bytes and audit evidence; invalidate only identified system copies. Caller holds document lock. */
export async function invalidateAutomaticApprovalPdfs(
  tx: Pick<Prisma.TransactionClient, "auditLog" | "attachment">,
  documentId: string,
  actorId: string,
  reason: string,
) {
  const logs = await tx.auditLog.findMany({
    where: { documentId, ...automaticApprovalPdfAuditFilter },
    select: { targetId: true },
  });
  if (!logs.length) return;
  const copies = await tx.attachment.findMany({
    where: { documentId, id: { in: logs.map((log) => log.targetId) } },
    select: { id: true, originalName: true },
  });
  const ids: string[] = [];
  for (const copy of copies) {
    if (copy.originalName.startsWith(invalidApprovalPdfPrefix)) continue;
    await tx.attachment.update({ where: { id: copy.id }, data: {
      originalName: `${invalidApprovalPdfPrefix}${copy.originalName}`,
    } });
    ids.push(copy.id);
  }
  if (ids.length) await tx.auditLog.create({ data: {
    actorId, documentId, action: AuditAction.UPDATE_DRAFT, targetType: "ApprovalDocument", targetId: documentId,
    message: `자동 결재 PDF의 효력을 취소하고 이력으로 보존했습니다. ${reason}`,
    metadata: { invalidatedAttachmentIds: ids, reason },
  } });
}

export async function isInvalidAutomaticApprovalPdf(
  db: Pick<Prisma.TransactionClient, "auditLog">,
  attachment: { id: string; originalName: string; document: { status: string } },
) {
  // Also protect previously rejected/recalled records created before this fix.
  if (!attachment.originalName.includes(invalidApprovalPdfPrefix.trim()) &&
    ["SUBMITTED", "IN_PROGRESS", "APPROVED"].includes(attachment.document.status)) return false;
  return Boolean(await db.auditLog.findFirst({
    where: { targetId: attachment.id, ...automaticApprovalPdfAuditFilter },
    select: { id: true },
  }));
}
