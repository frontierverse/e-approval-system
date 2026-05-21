export const generatedPdfAuditActionLabel = "PDF 생성";
export const generatedPdfAuditBadgeClass =
  "border-[#bdd7f0] bg-[#edf6ff] text-[#245d8f]";

type GeneratedPdfAuditLogLike = {
  action: string;
  targetType: string;
  message?: string | null;
  metadata?: unknown;
};

export function isGeneratedPdfAuditLog(log: GeneratedPdfAuditLogLike) {
  if (log.action !== "UPDATE_DRAFT" || log.targetType !== "Attachment") {
    return false;
  }

  if (hasGeneratedPdfMetadata(log.metadata)) {
    return true;
  }

  return (
    typeof log.message === "string" &&
    (log.message.includes("시스템 원본문서 PDF") ||
      log.message.includes("결재본 PDF") ||
      log.message.includes("승인본 PDF"))
  );
}

function hasGeneratedPdfMetadata(metadata: unknown) {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    typeof (metadata as { generatedApprovalPdfType?: unknown })
      .generatedApprovalPdfType === "string"
  );
}
