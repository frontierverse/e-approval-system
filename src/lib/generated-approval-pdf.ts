import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  type PreparedAttachmentFile,
  persistAttachmentFiles,
  readStoredAttachmentFile,
  removeStoredAttachmentFiles,
} from "@/lib/attachment-storage";
import {
  getApprovalStampColumnIndex,
  getApprovalStampRowIndex,
  getFinalApprovalStampSource,
  getStampedApprovalPdfTypeLabel,
  getVisibleApprovalColumnCount,
  getVisibleApprovalRowCount,
  type ApprovalStampImageSource,
} from "@/lib/approval-pdf-stamp-source";
import {
  type AttachmentStorageProvider,
  getAttachmentStorageConfig,
  getAttachmentStorageKeyPrefix,
} from "@/lib/attachment-storage-core";
import { prisma } from "@/lib/prisma";
import {
  ApprovalStepStatus,
  AuditAction,
  DocumentStatus,
} from "@/generated/prisma/client";

type ApprovalPdfUser = {
  name: string;
  departmentName?: string | null;
  positionName?: string | null;
};

type ApprovalPdfInput = {
  documentNo: string | null;
  title: string;
  category: string;
  content: string;
  templateName: string;
  drafter: ApprovalPdfUser;
  approvers: ApprovalPdfUser[];
  issuedAt: Date;
};

type ApprovalPdfStamp = {
  imageBuffer: Buffer;
  order: number;
};

type Sharp = typeof import("sharp");

const pageWidth = 595.28;
const pageHeight = 841.89;
const svgWidth = 1240;
const svgHeight = 1754;
const approvalPanelX = 718;
const approvalPanelY = 382;
const approvalPanelWidth = 404;
const approvalPanelRowHeight = 150;
const pdfKoreanFontFamily = "PdfKorean";
const pdfKoreanFontPath = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NanumGothic-Regular.ttf",
);

let pdfKoreanFontStyle: string | null = null;

export function getGeneratedApprovalPdfStorageError() {
  const storageConfig = getAttachmentStorageConfig(process.env);

  if (storageConfig.ok) {
    return null;
  }

  return `시스템 PDF 저장소 설정이 올바르지 않습니다. ${storageConfig.message}`;
}

export async function attachGeneratedApprovalPdfToDocument(
  documentId: string,
  actorId: string,
) {
  const document = await prisma.approvalDocument.findUnique({
    where: {
      id: documentId,
    },
    select: {
      id: true,
      documentNo: true,
      title: true,
      category: true,
      content: true,
      submittedAt: true,
      createdAt: true,
      drafterId: true,
      template: {
        select: {
          name: true,
        },
      },
      drafter: {
        select: {
          name: true,
          department: {
            select: {
              name: true,
            },
          },
          position: {
            select: {
              name: true,
            },
          },
        },
      },
      approvalSteps: {
        orderBy: {
          order: "asc",
        },
        select: {
          approver: {
            select: {
              name: true,
              department: {
                select: {
                  name: true,
                },
              },
              position: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!document) {
    throw new Error("시스템 PDF를 생성할 문서를 찾을 수 없습니다.");
  }

  const originalName = createGeneratedApprovalPdfOriginalName(
    document.documentNo,
    document.title,
  );
  const existingAttachment = await prisma.attachment.findFirst({
    where: {
      documentId: document.id,
      originalName,
      signedSourceAttachmentId: null,
    },
    select: {
      id: true,
    },
  });

  if (existingAttachment) {
    return existingAttachment;
  }

  const file = await createGeneratedApprovalPdfFile({
    documentNo: document.documentNo,
    title: document.title,
    category: document.category,
    content: document.content,
    templateName: document.template.name,
    drafter: {
      name: document.drafter.name,
      departmentName: document.drafter.department.name,
      positionName: document.drafter.position.name,
    },
    approvers: document.approvalSteps.map((step) => ({
      name: step.approver.name,
      departmentName: step.approver.department.name,
      positionName: step.approver.position.name,
    })),
    issuedAt: document.submittedAt ?? document.createdAt,
  });

  try {
    await persistAttachmentFiles([file]);
    return await prisma.$transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          documentId: document.id,
          uploaderId: document.drafterId,
          originalName: file.originalName,
          storageProvider: file.storageProvider,
          storageKey: file.storageKey,
          mimeType: file.mimeType,
          size: file.size,
        },
        select: {
          id: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: AuditAction.UPDATE_DRAFT,
          targetType: "Attachment",
          targetId: attachment.id,
          documentId: document.id,
          message: "시스템 원본문서 PDF를 생성했습니다.",
        },
      });

      return attachment;
    });
  } catch (error) {
    await removeStoredAttachmentFiles([file]).catch(() => undefined);
    throw error;
  }
}

export async function attachStampedApprovalPdfToDocument(
  documentId: string,
  actorId: string,
) {
  const document = await prisma.approvalDocument.findUnique({
    where: {
      id: documentId,
    },
    select: {
      id: true,
      documentNo: true,
      title: true,
      status: true,
      drafterId: true,
      approvalSteps: {
        orderBy: {
          order: "asc",
        },
        select: {
          order: true,
          status: true,
          approver: {
            select: {
              name: true,
              signatureImageStorageProvider: true,
              signatureImageStorageKey: true,
            },
          },
        },
      },
    },
  });

  if (!document) {
    throw new Error("결재본 PDF를 생성할 문서를 찾을 수 없습니다.");
  }

  if (!canAttachStampedApprovalPdf(document.status)) {
    return null;
  }

  const sourceAttachment = await ensureGeneratedApprovalPdfAttachment(
    {
      id: document.id,
      documentNo: document.documentNo,
      title: document.title,
    },
    actorId,
  );
  const originalName = createStampedApprovalPdfOriginalName(
    document.documentNo,
    document.title,
    document.status,
  );
  const existingAttachment = await findStampedApprovalPdfAttachment({
    documentId: document.id,
    sourceAttachmentId: sourceAttachment.id,
    documentNo: document.documentNo,
    title: document.title,
  });

  const approvalStepCount = document.approvalSteps.length;
  const approvedSteps = document.approvalSteps
    .filter((step) => step.status === ApprovalStepStatus.APPROVED);

  if (approvedSteps.length === 0) {
    return null;
  }

  const sourceFile = await readStoredAttachmentFile({
    storageProvider: sourceAttachment.storageProvider,
    storageKey: sourceAttachment.storageKey,
  });
  const sourceBuffer = await readableStreamToBuffer(sourceFile.body);
  const stamps = await Promise.all(
    approvedSteps.map(async (step) => ({
      order: step.order,
      imageBuffer: await getApprovalStampImageBuffer(
        getFinalApprovalStampSource(step),
      ),
    })),
  );
  const file = await createStampedApprovalPdfFile({
    originalName,
    sourceBuffer,
    stamps,
    approvalStepCount,
  });
  const previousFile = existingAttachment
    ? {
        storageProvider: existingAttachment.storageProvider,
        storageKey: existingAttachment.storageKey,
      }
    : null;

  try {
    await persistAttachmentFiles([file]);

    const attachment = await prisma.$transaction(async (tx) => {
      const attachment = existingAttachment
        ? await tx.attachment.update({
            where: {
              id: existingAttachment.id,
            },
            data: {
              signedById: actorId,
              signedAt: new Date(),
              originalName: file.originalName,
              storageProvider: file.storageProvider,
              storageKey: file.storageKey,
              mimeType: file.mimeType,
              size: file.size,
            },
            select: {
              id: true,
            },
          })
        : await tx.attachment.create({
            data: {
              documentId: document.id,
              uploaderId: document.drafterId,
              signedSourceAttachmentId: sourceAttachment.id,
              signedById: actorId,
              signedAt: new Date(),
              originalName: file.originalName,
              storageProvider: file.storageProvider,
              storageKey: file.storageKey,
              mimeType: file.mimeType,
              size: file.size,
            },
            select: {
              id: true,
            },
          });

      await tx.auditLog.create({
        data: {
          actorId,
          action: AuditAction.UPDATE_DRAFT,
          targetType: "Attachment",
          targetId: attachment.id,
          documentId: document.id,
          message:
            document.status === DocumentStatus.APPROVED
              ? "최종 승인본 PDF를 자동 생성했습니다."
              : "결재본 PDF를 자동 갱신했습니다.",
          metadata: {
            sourceAttachmentId: sourceAttachment.id,
            signedAttachmentId: attachment.id,
            stampCount: stamps.length,
            generatedApprovalPdfType:
              document.status === DocumentStatus.APPROVED
                ? "FINAL_APPROVED"
                : "IN_PROGRESS",
            replacedAttachmentId: existingAttachment?.id ?? null,
          },
        },
      });

      return attachment;
    });

    if (previousFile) {
      await removeStoredAttachmentFiles([previousFile]).catch(() => undefined);
    }

    return attachment;
  } catch (error) {
    await removeStoredAttachmentFiles([file]).catch(() => undefined);
    throw error;
  }
}

export const attachFinalApprovedApprovalPdfToDocument =
  attachStampedApprovalPdfToDocument;

function findStampedApprovalPdfAttachment({
  documentId,
  sourceAttachmentId,
  documentNo,
  title,
}: {
  documentId: string;
  sourceAttachmentId: string;
  documentNo: string | null;
  title: string;
}) {
  return prisma.attachment.findFirst({
    where: {
      documentId,
      signedSourceAttachmentId: sourceAttachmentId,
      originalName: {
        in: getStampedApprovalPdfOriginalNameCandidates(documentNo, title),
      },
    },
    select: {
      id: true,
      storageProvider: true,
      storageKey: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function createGeneratedApprovalPdfFile(
  input: ApprovalPdfInput,
): Promise<PreparedAttachmentFile> {
  const storageConfig = getAttachmentStorageConfig(process.env);

  if (!storageConfig.ok) {
    throw new Error(
      `시스템 PDF 저장소 설정이 올바르지 않습니다. ${storageConfig.message}`,
    );
  }

  const svg = createApprovalDocumentSvg(input);
  const sharp = await getSharp();
  const pngBuffer = await sharp(Buffer.from(svg), {
    failOn: "none",
  })
    .png()
    .toBuffer();
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([pageWidth, pageHeight]);
  const image = await pdf.embedPng(pngBuffer);

  page.drawImage(image, {
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
  });

  const buffer = Buffer.from(await pdf.save());

  return {
    originalName: createGeneratedApprovalPdfOriginalName(
      input.documentNo,
      input.title,
    ),
    storageProvider: storageConfig.provider,
    storageKey: createPdfStorageKey(storageConfig.provider),
    mimeType: "application/pdf",
    size: buffer.byteLength,
    buffer,
  };
}

async function createStampedApprovalPdfFile({
  approvalStepCount,
  originalName,
  sourceBuffer,
  stamps,
}: {
  approvalStepCount: number;
  originalName: string;
  sourceBuffer: Buffer;
  stamps: ApprovalPdfStamp[];
}): Promise<PreparedAttachmentFile> {
  const storageConfig = getAttachmentStorageConfig(process.env);

  if (!storageConfig.ok) {
    throw new Error(
      `승인본 PDF 저장소 설정이 올바르지 않습니다. ${storageConfig.message}`,
    );
  }

  const buffer = await stampFinalApprovalPdf(
    sourceBuffer,
    stamps,
    approvalStepCount,
  );

  return {
    originalName,
    storageProvider: storageConfig.provider,
    storageKey: createPdfStorageKey(storageConfig.provider),
    mimeType: "application/pdf",
    size: buffer.byteLength,
    buffer,
  };
}

async function stampFinalApprovalPdf(
  sourceBuffer: Buffer,
  stamps: ApprovalPdfStamp[],
  approvalStepCount: number,
) {
  const pdf = await PDFDocument.load(sourceBuffer);
  const [page] = pdf.getPages();

  if (!page) {
    throw new Error("승인본 PDF에 도장을 찍을 페이지가 없습니다.");
  }

  for (const stamp of stamps) {
    const placement = getApprovalStampPlacement(
      stamp.order,
      approvalStepCount,
    );
    const embeddedStamp = await embedApprovalStampImage(pdf, stamp.imageBuffer);
    const width = placement.size;
    const height = embeddedStamp.height * (width / embeddedStamp.width);
    const y = page.getHeight() - placement.top - height;

    page.drawImage(embeddedStamp.image, {
      x: placement.x,
      y,
      width,
      height,
      opacity: 0.92,
    });
  }

  return Buffer.from(await pdf.save());
}

function createApprovalDocumentSvg(input: ApprovalPdfInput) {
  const documentNo = input.documentNo ?? "문서번호 발급 전";
  const issuedAt = formatKoreanDateTime(input.issuedAt);
  const approvers = input.approvers;
  const titleLines = wrapLines(input.title, 30, 2);
  const approvalPanelBottom = getApprovalPanelBottomY(approvers.length);
  const summaryBottom = 382 + 194;
  const contentTop = Math.max(summaryBottom, approvalPanelBottom) + 62;
  const bodyTitleY = contentTop;
  const bodyRectY = bodyTitleY + 28;
  const notesTitleY = 1390;
  const minBodyRectHeight = 80;
  const shouldRenderNotes =
    bodyRectY + minBodyRectHeight + 64 <= notesTitleY;
  const bodyRectBottomLimit = shouldRenderNotes ? notesTitleY - 64 : 1548;
  const bodyRectHeight = Math.max(
    minBodyRectHeight,
    bodyRectBottomLimit - bodyRectY,
  );
  const bodyTextMaxLines = Math.max(1, Math.floor((bodyRectHeight - 54) / 40));
  const bodyLines = wrapLines(input.content, 48, bodyTextMaxLines);
  const notesSection = shouldRenderNotes ? renderApprovalNotesSection() : "";
  const footerText =
    "본 문서는 전자결재 시스템에서 생성된 원본문서이며, 최종 승인 시 결재란에 승인 기록이 반영됩니다.";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <defs>
    ${pdfFontFaceStyle()}
  </defs>
  <rect width="${svgWidth}" height="${svgHeight}" fill="#f5f6f8"/>
  <rect x="78" y="72" width="1084" height="1610" rx="10" fill="#ffffff" stroke="#d6dbe3" stroke-width="2"/>
  <rect x="78" y="72" width="1084" height="118" rx="10" fill="#1f3347"/>
  <text x="118" y="132" font-family="${pdfFontFamily()}" font-size="27" font-weight="700" fill="#ffffff">사내 전자결재 문서</text>
  <text x="118" y="165" font-family="${pdfFontFamily()}" font-size="17" fill="#c8d3df">사회적협동조합 청소년자립학교</text>
  <text x="1018" y="132" text-anchor="end" font-family="${pdfFontFamily()}" font-size="17" fill="#ffffff">${escapeXml(documentNo)}</text>
  <text x="1018" y="164" text-anchor="end" font-family="${pdfFontFamily()}" font-size="15" fill="#c8d3df">${escapeXml(issuedAt)}</text>

  <text x="118" y="270" font-family="${pdfFontFamily()}" font-size="34" font-weight="800" fill="#171b22">${escapeXml(input.templateName)}</text>
  ${renderMultilineText(titleLines, 118, 322, 30, 38, "#171b22", 700)}

  ${renderInfoPanel(input, documentNo, issuedAt)}
  ${renderApprovalPanel(approvers, input.approvers.length)}

  <text x="118" y="${bodyTitleY}" font-family="${pdfFontFamily()}" font-size="19" font-weight="700" fill="#1f3347">기안 내용</text>
  <rect x="118" y="${bodyRectY}" width="1004" height="${bodyRectHeight}" fill="#ffffff" stroke="#d6dbe3" stroke-width="2"/>
  ${renderMultilineText(bodyLines, 150, bodyRectY + 54, 24, 40, "#2f3742")}

  ${notesSection}

  <line x1="118" y1="1602" x2="1122" y2="1602" stroke="#d6dbe3" stroke-width="2"/>
  <text x="118" y="1642" font-family="${pdfFontFamily()}" font-size="16" fill="#697386">${escapeXml(footerText)}</text>
</svg>`;
}

function renderInfoPanel(
  input: ApprovalPdfInput,
  documentNo: string,
  issuedAt: string,
) {
  const rows = [
    ["문서번호", documentNo],
    ["문서분류", input.category],
    ["작성자", `${input.drafter.name} / ${input.drafter.positionName ?? "-"}`],
    ["소속", input.drafter.departmentName ?? "-"],
    ["생성일시", issuedAt],
  ];

  return `
  <rect x="118" y="382" width="560" height="194" fill="#ffffff" stroke="#d6dbe3" stroke-width="2"/>
  ${rows
    .map((row, index) => {
      const y = 382 + index * 38;
      return `
  <rect x="118" y="${y}" width="132" height="38" fill="#f3f6f9" stroke="#d6dbe3" stroke-width="1"/>
  <rect x="250" y="${y}" width="428" height="38" fill="#ffffff" stroke="#d6dbe3" stroke-width="1"/>
  <text x="142" y="${y + 25}" font-family="${pdfFontFamily()}" font-size="16" font-weight="700" fill="#394150">${escapeXml(row[0])}</text>
  <text x="272" y="${y + 25}" font-family="${pdfFontFamily()}" font-size="16" fill="#2f3742">${escapeXml(row[1])}</text>`;
    })
    .join("")}`;
}

function renderApprovalPanel(approvers: ApprovalPdfUser[], totalCount: number) {
  const layout = getApprovalPanelLayout(totalCount);
  const columnWidth = layout.width / layout.columns;

  return `
  <text x="${layout.x}" y="356" font-family="${pdfFontFamily()}" font-size="18" font-weight="700" fill="#1f3347">결재란</text>
  <rect x="${layout.x}" y="${layout.y}" width="${layout.width}" height="${layout.height}" fill="#ffffff" stroke="#d6dbe3" stroke-width="2"/>
  ${approvers
    .map((approver, index) => {
      const rowIndex = Math.floor(index / layout.columns);
      const columnIndex = index % layout.columns;
      const cellX = layout.x + columnIndex * columnWidth;
      const cellY = layout.y + rowIndex * layout.rowHeight;
      return `
  <rect x="${cellX}" y="${cellY}" width="${columnWidth}" height="34" fill="#f3f6f9" stroke="#d6dbe3" stroke-width="1"/>
  <text x="${cellX + columnWidth / 2}" y="${cellY + 23}" text-anchor="middle" font-family="${pdfFontFamily()}" font-size="14" font-weight="700" fill="#394150">${index + 1}차</text>
  <rect x="${cellX}" y="${cellY + 34}" width="${columnWidth}" height="72" fill="#ffffff" stroke="#d6dbe3" stroke-width="1"/>
  <text x="${cellX + columnWidth / 2}" y="${cellY + 78}" text-anchor="middle" font-family="${pdfFontFamily()}" font-size="17" font-weight="700" fill="#171b22">${escapeXml(approver.name)}</text>
  <rect x="${cellX}" y="${cellY + 106}" width="${columnWidth}" height="${layout.rowHeight - 106}" fill="#ffffff" stroke="#d6dbe3" stroke-width="1"/>
  <text x="${cellX + columnWidth / 2}" y="${cellY + 127}" text-anchor="middle" font-family="${pdfFontFamily()}" font-size="12" fill="#697386">${escapeXml(approver.departmentName ?? "")}</text>
  <text x="${cellX + columnWidth / 2}" y="${cellY + 145}" text-anchor="middle" font-family="${pdfFontFamily()}" font-size="12" fill="#697386">${escapeXml(approver.positionName ?? "")}</text>`;
    })
    .join("")}`;
}

function getApprovalPanelBottomY(totalCount: number) {
  const layout = getApprovalPanelLayout(totalCount);

  return layout.y + layout.height;
}

function getApprovalPanelLayout(totalCount: number) {
  const columns = getVisibleApprovalColumnCount(totalCount);
  const rows = getVisibleApprovalRowCount(totalCount);

  return {
    columns,
    height: rows * approvalPanelRowHeight,
    rowHeight: approvalPanelRowHeight,
    width: approvalPanelWidth,
    x: approvalPanelX,
    y: approvalPanelY,
  };
}

function renderApprovalNotesSection() {
  return `<text x="118" y="1390" font-family="${pdfFontFamily()}" font-size="19" font-weight="700" fill="#1f3347">결재 유의사항</text>
  <rect x="118" y="1420" width="1004" height="128" fill="#f8fafc" stroke="#e4e8ee" stroke-width="2"/>
  <text x="150" y="1472" font-family="${pdfFontFamily()}" font-size="19" fill="#394150">결재자는 문서 내용과 첨부파일을 확인한 후 승인 또는 반려 처리합니다.</text>
  <text x="150" y="1515" font-family="${pdfFontFamily()}" font-size="19" fill="#394150">최종 승인 완료 후 이 원본문서를 기준으로 보관 및 검증 절차가 진행됩니다.</text>`;
}

function renderMultilineText(
  lines: string[],
  x: number,
  y: number,
  fontSize: number,
  lineHeight: number,
  fill: string,
  fontWeight = 400,
) {
  return lines
    .map((line, index) => {
      const textY = y + index * lineHeight;

      return `<text x="${x}" y="${textY}" font-family="${pdfFontFamily()}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}">${escapeXml(line)}</text>`;
    })
    .join("\n  ");
}

function wrapLines(text: string, maxChars: number, maxLines: number) {
  const sourceLines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((line) => wrapLine(line.trim(), maxChars));
  const lines = sourceLines.filter(Boolean);

  if (lines.length <= maxLines) {
    return lines.length > 0 ? lines : ["-"];
  }

  return [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1]} ...`];
}

function wrapLine(line: string, maxChars: number) {
  if (!line) {
    return [""];
  }

  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (Array.from(next).length <= maxChars) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    if (Array.from(word).length <= maxChars) {
      current = word;
      continue;
    }

    const characters = Array.from(word);

    for (let index = 0; index < characters.length; index += maxChars) {
      lines.push(characters.slice(index, index + maxChars).join(""));
    }

    current = "";
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function createGeneratedApprovalPdfOriginalName(
  documentNo: string | null,
  title: string,
) {
  const documentLabel = documentNo?.trim() || "임시문서";
  const titleLabel = sanitizeFileName(title).slice(0, 60) || "결재문서";

  return `전자결재_원본문서_${documentLabel}_${titleLabel}.pdf`;
}

export function createStampedApprovalPdfOriginalName(
  documentNo: string | null,
  title: string,
  status: DocumentStatus,
) {
  const documentLabel = documentNo?.trim() || "임시문서";
  const titleLabel = sanitizeFileName(title).slice(0, 60) || "결재문서";
  const typeLabel = getStampedApprovalPdfTypeLabel(status);

  return `전자결재_${typeLabel}_${documentLabel}_${titleLabel}.pdf`;
}

function getStampedApprovalPdfOriginalNameCandidates(
  documentNo: string | null,
  title: string,
) {
  return [
    createStampedApprovalPdfOriginalName(
      documentNo,
      title,
      DocumentStatus.IN_PROGRESS,
    ),
    createStampedApprovalPdfOriginalName(
      documentNo,
      title,
      DocumentStatus.APPROVED,
    ),
  ];
}

function canAttachStampedApprovalPdf(status: DocumentStatus) {
  return (
    status === DocumentStatus.SUBMITTED ||
    status === DocumentStatus.IN_PROGRESS ||
    status === DocumentStatus.APPROVED
  );
}

function createPdfStorageKey(provider: AttachmentStorageProvider) {
  return `${getAttachmentStorageKeyPrefix(provider)}${randomUUID()}.pdf`;
}

function formatKoreanDateTime(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfFontFamily() {
  return `${pdfKoreanFontFamily}, sans-serif`;
}

function pdfFontFaceStyle() {
  if (!pdfKoreanFontStyle) {
    const fontBase64 = readFileSync(pdfKoreanFontPath).toString("base64");

    // Vercel's image runtime does not provide Korean system fonts, so the
    // generated SVG must carry its own font for sharp/librsvg rendering.
    pdfKoreanFontStyle = `<style><![CDATA[
@font-face {
  font-family: ${pdfKoreanFontFamily};
  src: url(data:font/truetype;base64,${fontBase64}) format("truetype");
  font-weight: 400;
  font-style: normal;
}
@font-face {
  font-family: ${pdfKoreanFontFamily};
  src: url(data:font/truetype;base64,${fontBase64}) format("truetype");
  font-weight: 700;
  font-style: normal;
}
@font-face {
  font-family: ${pdfKoreanFontFamily};
  src: url(data:font/truetype;base64,${fontBase64}) format("truetype");
  font-weight: 800;
  font-style: normal;
}
]]></style>`;
  }

  return pdfKoreanFontStyle;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function ensureGeneratedApprovalPdfAttachment(
  document: {
    id: string;
    documentNo: string | null;
    title: string;
  },
  actorId: string,
) {
  const attachment = await findGeneratedApprovalPdfAttachment(document);

  if (attachment) {
    return attachment;
  }

  await attachGeneratedApprovalPdfToDocument(document.id, actorId);

  const createdAttachment = await findGeneratedApprovalPdfAttachment(document);

  if (!createdAttachment) {
    throw new Error("승인본의 기준이 되는 원본문서 PDF를 찾을 수 없습니다.");
  }

  return createdAttachment;
}

function findGeneratedApprovalPdfAttachment(document: {
  id: string;
  documentNo: string | null;
  title: string;
}) {
  return prisma.attachment.findFirst({
    where: {
      documentId: document.id,
      originalName: createGeneratedApprovalPdfOriginalName(
        document.documentNo,
        document.title,
      ),
      signedSourceAttachmentId: null,
    },
    select: {
      id: true,
      storageProvider: true,
      storageKey: true,
    },
  });
}

function getApprovalStampPlacement(order: number, approvalStepCount: number) {
  const layout = getApprovalPanelLayout(approvalStepCount);
  const columnIndex = getApprovalStampColumnIndex(order, layout.columns);
  const rowIndex = getApprovalStampRowIndex(order, layout.columns);
  const scaleX = pageWidth / svgWidth;
  const scaleY = pageHeight / svgHeight;
  const columnWidth = layout.width / layout.columns;
  const maxStampSize = columnWidth * scaleX - 8;
  const size = Math.max(24, Math.min(38, maxStampSize));
  const centerX =
    (layout.x + columnIndex * columnWidth + columnWidth / 2) * scaleX;
  const stampTop = layout.y + rowIndex * layout.rowHeight + 42;

  return {
    x: centerX - size / 2,
    top: stampTop * scaleY,
    size,
  };
}

async function getApprovalStampImageBuffer(source: ApprovalStampImageSource) {
  if (source.signatureImageStorageProvider && source.signatureImageStorageKey) {
    const storedFile = await readStoredAttachmentFile({
      storageProvider: source.signatureImageStorageProvider,
      storageKey: source.signatureImageStorageKey,
    });

    return readableStreamToBuffer(storedFile.body);
  }

  return createGeneratedApprovalStampImage(source.name);
}

async function createGeneratedApprovalStampImage(name: string) {
  const sharp = await getSharp();
  const safeName = escapeXml(name.trim().slice(0, 5) || "승인");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <defs>
    ${pdfFontFaceStyle()}
  </defs>
  <rect width="240" height="240" fill="none"/>
  <circle cx="120" cy="120" r="94" fill="none" stroke="#c82333" stroke-width="12"/>
  <circle cx="120" cy="120" r="76" fill="none" stroke="#c82333" stroke-width="3" opacity="0.65"/>
  <text x="120" y="112" text-anchor="middle" font-family="${pdfFontFamily()}" font-size="50" font-weight="800" fill="#c82333">승인</text>
  <text x="120" y="162" text-anchor="middle" font-family="${pdfFontFamily()}" font-size="30" font-weight="700" fill="#c82333">${safeName}</text>
</svg>`;

  return sharp(Buffer.from(svg), {
    failOn: "none",
  })
    .png()
    .toBuffer();
}

async function embedApprovalStampImage(
  pdf: PDFDocument,
  imageBuffer: Buffer,
) {
  try {
    const image = await pdf.embedPng(imageBuffer);
    const dimensions = image.scale(1);

    return {
      image,
      width: dimensions.width,
      height: dimensions.height,
    };
  } catch {
    try {
      const image = await pdf.embedJpg(imageBuffer);
      const dimensions = image.scale(1);

      return {
        image,
        width: dimensions.width,
        height: dimensions.height,
      };
    } catch {
      const sharp = await getSharp();
      const pngBuffer = await sharp(imageBuffer, { failOn: "none" })
        .png()
        .toBuffer();
      const image = await pdf.embedPng(pngBuffer);
      const dimensions = image.scale(1);

      return {
        image,
        width: dimensions.width,
        height: dimensions.height,
      };
    }
  }
}

async function readableStreamToBuffer(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(value);
    totalLength += value.byteLength;
  }

  return Buffer.concat(chunks, totalLength);
}

async function getSharp(): Promise<Sharp> {
  const sharpModule = await import("sharp");

  return (sharpModule.default ?? sharpModule) as Sharp;
}
