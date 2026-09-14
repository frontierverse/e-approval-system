import { createHash } from "node:crypto";
import { AuditAction, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import {
  persistAttachmentFiles,
  removeStoredAttachmentFiles,
  type PreparedAttachmentFile,
  type StoredAttachmentRef,
} from "@/lib/attachment-storage";
import { extractDisplayContentFromTemplate } from "@/lib/draft-template-content";
import type { ApprovalPdfInput } from "@/lib/generated-approval-pdf";

const historyPrefix = "[이전 결재 이력] ";
const sourceStoragePattern = /(?:^|\/)generated-approval-pdf(?:-v\d+)?\//;
export const generatedApprovalPdfStorageSegment = "generated-approval-pdf-v6/";

const documentSelect = {
  id: true,
  documentNo: true,
  title: true,
  category: true,
  content: true,
  templateId: true,
  submittedAt: true,
  createdAt: true,
  updatedAt: true,
  drafterId: true,
  template: { select: { name: true, schema: true } },
  drafter: {
    select: {
      name: true,
      department: { select: { name: true } },
      position: { select: { name: true } },
    },
  },
  approvalSteps: {
    orderBy: { order: "asc" },
    select: {
      approverId: true,
      approver: {
        select: {
          name: true,
          department: { select: { name: true } },
          position: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.ApprovalDocumentSelect;

type PdfDocument = Prisma.ApprovalDocumentGetPayload<{ select: typeof documentSelect }>;
type Database = Pick<Prisma.TransactionClient, "approvalDocument" | "attachment" | "auditLog">;

function getPdfInput(document: PdfDocument): ApprovalPdfInput {
  return {
    documentNo: document.documentNo,
    title: document.title,
    category: document.category,
    content: extractDisplayContentFromTemplate(
      document.content,
      document.templateId,
      document.template.schema,
    ),
    templateName: document.template.name,
    templateSchema: document.template.schema,
    drafter: {
      name: document.drafter.name,
      departmentName: document.drafter.department.name,
      positionName: document.drafter.position.name,
    },
    approvers: document.approvalSteps.map(({ approver }) => ({
      name: approver.name,
      departmentName: approver.department.name,
      positionName: approver.position.name,
    })),
    issuedAt: document.submittedAt ?? document.createdAt,
  };
}

function getFingerprint(document: PdfDocument) {
  return createHash("sha256")
    .update(JSON.stringify({
      version: generatedApprovalPdfStorageSegment,
      documentId: document.id,
      templateId: document.templateId,
      drafterId: document.drafterId,
      approverIds: document.approvalSteps.map((step) => step.approverId),
      input: getPdfInput(document),
    }))
    .digest("hex");
}

async function loadState(db: Database, documentId: string) {
  const document = await db.approvalDocument.findUnique({
    where: { id: documentId },
    select: documentSelect,
  });
  if (!document) {
    throw new Error("시스템 PDF를 생성할 문서를 찾을 수 없습니다.");
  }

  const attachments = await db.attachment.findMany({
    where: { documentId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      originalName: true,
      storageProvider: true,
      storageKey: true,
      signedSourceAttachmentId: true,
      convertedSourceAttachmentId: true,
    },
  });
  // Audit evidence also identifies PDFs from before versioned storage paths.
  // A user-uploaded file with the same display name is never a system original.
  const logs = await db.auditLog.findMany({
    where: { documentId, targetType: "Attachment", action: AuditAction.UPDATE_DRAFT },
    select: { targetId: true, message: true, metadata: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const sourceIds = new Set<string>();
  const automaticSignedIds = new Set<string>();
  const archivedIds = new Set<string>();
  const fingerprints = new Map<string, { fingerprint: unknown; storageKey: unknown }>();
  for (const log of logs) {
    const metadata = log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
      ? log.metadata : {};
    if (Array.isArray(metadata.archivedSourceAttachmentIds)) {
      for (const id of metadata.archivedSourceAttachmentIds) {
        if (typeof id === "string") archivedIds.add(id);
      }
    }
    if (metadata.generatedApprovalPdfType === "SOURCE" || log.message?.includes("시스템 원본문서 PDF")) {
      sourceIds.add(log.targetId);
      if (!fingerprints.has(log.targetId)) {
        fingerprints.set(log.targetId, { fingerprint: metadata.sourceFingerprint, storageKey: metadata.storageKey });
      }
    } else if (
      metadata.generatedApprovalPdfType === "IN_PROGRESS" ||
      metadata.generatedApprovalPdfType === "FINAL_APPROVED" ||
      log.message === "결재본 PDF를 자동 갱신했습니다." ||
      log.message === "최종 승인본 PDF를 자동 생성했습니다."
    ) {
      automaticSignedIds.add(log.targetId);
    }
  }
  const sources = attachments.filter((attachment) =>
    !attachment.signedSourceAttachmentId && !attachment.convertedSourceAttachmentId &&
    !archivedIds.has(attachment.id) &&
    (sourceIds.has(attachment.id) || sourceStoragePattern.test(attachment.storageKey.replace(/\\/g, "/"))),
  );
  const fingerprint = getFingerprint(document);
  const current = sources.find((source) => {
    const recorded = fingerprints.get(source.id);
    return recorded?.fingerprint === fingerprint && recorded.storageKey === source.storageKey;
  });
  return { document, attachments, sources, automaticSignedIds, fingerprint, current };
}

export async function findCurrentGeneratedApprovalPdfAttachment(db: Database, documentId: string) {
  const state = await loadState(db, documentId);
  return state.current;
}

/** Replace only this document's generated originals; never identify one by title. */
export async function syncGeneratedApprovalPdf(
  documentId: string,
  actorId: string,
  createFile: (input: ApprovalPdfInput) => Promise<PreparedAttachmentFile>,
) {
  const initial = await loadState(prisma, documentId);
  if (initial.current && initial.sources.length === 1) return initial.current;

  // Rendering and object storage I/O must not hold a database row lock.
  const file = await createFile(getPdfInput(initial.document));
  const auditRequestData = await getCurrentAuditLogRequestData();
  let committed = false;
  try {
    await persistAttachmentFiles([file]);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "ApprovalDocument" WHERE "id" = ${documentId} FOR UPDATE
      `);
      const state = await loadState(tx, documentId);
      if (state.document.updatedAt.getTime() !== initial.document.updatedAt.getTime() ||
          state.fingerprint !== initial.fingerprint) {
        throw new Error("PDF 생성 중 문서가 변경되었습니다. 최신 문서로 다시 시도하세요.");
      }
      // Another worker may have published the same revision while we rendered.
      if (state.current && state.sources.length === 1) {
        return { attachment: state.current, obsolete: [file] as StoredAttachmentRef[] };
      }

      const archivedSources: typeof state.sources = [];
      const removableSources: typeof state.sources = [];
      const obsoleteCopies: typeof state.attachments = [];
      for (const source of state.sources) {
        const descendants = new Set([source.id]);
        let previousSize = 0;
        while (previousSize !== descendants.size) {
          previousSize = descendants.size;
          for (const attachment of state.attachments) {
            if (
              descendants.has(attachment.signedSourceAttachmentId ?? "") ||
              descendants.has(attachment.convertedSourceAttachmentId ?? "")
            ) {
              descendants.add(attachment.id);
            }
          }
        }
        const copies = state.attachments.filter((attachment) => attachment.id !== source.id && descendants.has(attachment.id));
        if (copies.some((copy) => !state.automaticSignedIds.has(copy.id))) {
          // Manual signatures/conversions are evidence. Preserve their source
          // bytes and links, clearly marking the whole group as previous history.
          archivedSources.push(source);
          for (const attachment of [source, ...copies]) {
            await tx.attachment.update({
              where: { id: attachment.id },
              data: { originalName: attachment.originalName.startsWith(historyPrefix)
                ? attachment.originalName : `${historyPrefix}${attachment.originalName}` },
            });
          }
        } else {
          removableSources.push(source);
          obsoleteCopies.push(...copies);
        }
      }

      const existing = removableSources[0];
      const duplicates = removableSources.slice(1);
      // Delete descendants first: SetNull would make them appear as originals.
      const removed = [...obsoleteCopies, ...duplicates];
      if (removed.length) {
        await tx.attachment.deleteMany({ where: { documentId, id: { in: removed.map((item) => item.id) } } });
      }
      const data = {
        originalName: file.originalName,
        storageProvider: file.storageProvider,
        storageKey: file.storageKey,
        mimeType: file.mimeType,
        size: file.size,
      };
      const select = { id: true, storageProvider: true, storageKey: true };
      const attachment = existing
        ? await tx.attachment.update({ where: { id: existing.id }, data, select })
        : await tx.attachment.create({ data: { ...data, documentId, uploaderId: state.document.drafterId }, select });
      await tx.auditLog.create({ data: {
        actorId, ...auditRequestData, action: AuditAction.UPDATE_DRAFT,
        targetType: "Attachment", targetId: attachment.id, documentId,
        message: state.sources.length ? "시스템 원본문서 PDF를 다시 생성했습니다." : "시스템 원본문서 PDF를 생성했습니다.",
        metadata: {
          generatedApprovalPdfType: "SOURCE", generatedAttachmentId: attachment.id,
          sourceFingerprint: state.fingerprint, storageKey: file.storageKey,
          replacedAttachmentId: existing?.id ?? null,
          removedAttachmentIds: removed.map((item) => item.id),
          archivedSourceAttachmentIds: archivedSources.map((item) => item.id),
          previousAttachments: state.sources.map((source) => ({ id: source.id, originalName: source.originalName })),
        },
      } });
      return { attachment, obsolete: [...removed, ...(existing ? [existing] : [])] as StoredAttachmentRef[] };
    });
    committed = true;
    await removeStoredAttachmentFiles(result.obsolete).catch(() => undefined);
    return result.attachment;
  } catch (error) {
    if (!committed) await removeStoredAttachmentFiles([file]).catch(() => undefined);
    throw error;
  }
}
