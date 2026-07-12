import { AuditAction } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { readStoredAttachmentFile } from "@/lib/attachment-storage";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const downloadReasons = {
  CASE_SUPPORT: "사건 지원 업무",
  EXTERNAL_SUBMISSION: "법원·보호관찰소 등 외부기관 제출",
  INTERNAL_REVIEW: "기관 내부 검토",
  OTHER: "기타",
} as const;

type DecisionDocumentDownloadReason = keyof typeof downloadReasons;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return new Response("인증이 필요합니다.", { status: 401 });
  }

  const formData = await request.formData();
  const requestedReason = formData.get("reason");
  const reason = isDecisionDocumentDownloadReason(requestedReason)
    ? requestedReason
    : null;
  const rawReasonDetail = formData.get("reasonDetail");
  const reasonDetail =
    typeof rawReasonDetail === "string" ? rawReasonDetail.trim() : "";

  if (!reason || (reason === "OTHER" && reasonDetail.length === 0)) {
    await recordDecisionDocumentDownloadAudit({
      actorId: user.id,
      decisionDocumentId: id,
      outcome: "invalid_reason",
    });

    return new Response("다운로드 사유를 선택하거나 입력해주세요.", {
      status: 400,
    });
  }

  if (reasonDetail.length > 200) {
    await recordDecisionDocumentDownloadAudit({
      actorId: user.id,
      decisionDocumentId: id,
      outcome: "invalid_reason",
      reason,
    });

    return new Response("기타 사유는 200자 이내로 입력해주세요.", {
      status: 400,
    });
  }

  const document = await prisma.youthDecisionDocument.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      originalName: true,
      storageProvider: true,
      storageKey: true,
      mimeType: true,
      size: true,
    },
  });

  if (!document) {
    await recordDecisionDocumentDownloadAudit({
      actorId: user.id,
      decisionDocumentId: id,
      outcome: "not_found",
      reason,
      reasonDetail,
    });

    return new Response("결정문 파일을 찾을 수 없습니다.", { status: 404 });
  }

  try {
    const storedFile = await readStoredAttachmentFile({
      storageProvider: document.storageProvider,
      storageKey: document.storageKey,
    });

    await recordDecisionDocumentDownloadAudit({
      actorId: user.id,
      decisionDocumentId: document.id,
      outcome: "downloaded",
      reason,
      reasonDetail,
    });

    return new Response(storedFile.body, {
      headers: {
        "Content-Type":
          storedFile.mimeType ||
          document.mimeType ||
          "application/octet-stream",
        "Content-Length": String(storedFile.size ?? document.size),
        "Content-Disposition": getContentDisposition(document.originalName),
      },
    });
  } catch {
    await recordDecisionDocumentDownloadAudit({
      actorId: user.id,
      decisionDocumentId: document.id,
      outcome: "storage_error",
      reason,
      reasonDetail,
    });

    return new Response("결정문 파일을 찾을 수 없습니다.", { status: 404 });
  }
}

async function recordDecisionDocumentDownloadAudit({
  actorId,
  decisionDocumentId,
  outcome,
  reason,
  reasonDetail,
}: {
  actorId: string;
  decisionDocumentId: string;
  outcome: "downloaded" | "invalid_reason" | "not_found" | "storage_error";
  reason?: DecisionDocumentDownloadReason;
  reasonDetail?: string;
}) {
  const messages = {
    downloaded: "결정문 다운로드를 요청했습니다.",
    invalid_reason: "사유 없이 또는 올바르지 않은 사유로 결정문 다운로드를 요청했습니다.",
    not_found: "존재하지 않는 결정문 다운로드를 요청했습니다.",
    storage_error: "결정문 다운로드를 요청했으나 파일을 찾을 수 없습니다.",
  } as const;

  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        ...(await getCurrentAuditLogRequestData()),
        action: AuditAction.DOWNLOAD_YOUTH_DECISION_DOCUMENT,
        targetType: "YouthDecisionDocument",
        targetId: decisionDocumentId,
        message: messages[outcome],
        metadata: {
          outcome,
          ...(reason
            ? {
                reason,
                reasonLabel: downloadReasons[reason],
              }
            : {}),
          ...(reason === "OTHER" && reasonDetail
            ? { reasonDetail }
            : {}),
        },
      },
    });
  } catch (error) {
    console.error("Failed to record youth decision document download", error);
  }
}

function isDecisionDocumentDownloadReason(
  value: FormDataEntryValue | null,
): value is DecisionDocumentDownloadReason {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(downloadReasons, value)
  );
}

function getContentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  const encoded = encodeURIComponent(filename);

  return `attachment; filename="${fallback || "decision-document"}"; filename*=UTF-8''${encoded}`;
}
