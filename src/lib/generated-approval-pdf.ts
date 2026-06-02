import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";
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
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { extractTextareaContentFromCompiledTemplate } from "@/lib/draft-template-content";
import { prisma } from "@/lib/prisma";
import {
  getApprovalPdfLayout,
  type ApprovalPdfLayout,
} from "@/lib/generated-approval-pdf-layout";
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
  order: number;
  source: ApprovalStampImageSource;
};

type Sharp = typeof import("sharp");
type ApprovalPdfFonts = {
  korean: PDFFont;
};
type TextAlign = "start" | "middle" | "end";

const pageWidth = 595.28;
const pageHeight = 841.89;
const svgWidth = 1240;
const svgHeight = 1754;
const pdfScaleX = pageWidth / svgWidth;
const pdfScaleY = pageHeight / svgHeight;
const pdfScale = pdfScaleX;
const approvalPanelX = 718;
const approvalPanelY = 382;
const approvalPanelWidth = 404;
const approvalPanelRowHeight = 150;
const heroTitleMaxWidth = 430;
const heroTitleFontSize = 19;
const heroTitleLineHeight = 25;
const heroTitleMaxLines = 2;
const bodyTextFontSize = 16;
const bodyTextLineHeight = 30;
const bodyTextMaxChars = 58;
const generatedApprovalPdfStorageSegment = "generated-approval-pdf-v3/";
const pdfKoreanFontPath = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NanumGothic-Regular.ttf",
);

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
      storageProvider: true,
      storageKey: true,
    },
  });

  if (
    existingAttachment &&
    isCurrentGeneratedApprovalPdfStorageKey(existingAttachment.storageKey)
  ) {
    return {
      id: existingAttachment.id,
    };
  }

  const file = await createGeneratedApprovalPdfFile({
    documentNo: document.documentNo,
    title: document.title,
    category: document.category,
    content: extractTextareaContentFromCompiledTemplate(document.content),
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
  const previousFile = existingAttachment
    ? {
        storageProvider: existingAttachment.storageProvider,
        storageKey: existingAttachment.storageKey,
      }
    : null;
  const auditRequestData = await getCurrentAuditLogRequestData();

  try {
    await persistAttachmentFiles([file]);
    const attachment = await prisma.$transaction(async (tx) => {
      const attachment = existingAttachment
        ? await tx.attachment.update({
            where: {
              id: existingAttachment.id,
            },
            data: {
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
          ...auditRequestData,
          action: AuditAction.UPDATE_DRAFT,
          targetType: "Attachment",
          targetId: attachment.id,
          documentId: document.id,
          message: existingAttachment
            ? "시스템 원본문서 PDF를 다시 생성했습니다."
            : "시스템 원본문서 PDF를 생성했습니다.",
          metadata: {
            generatedApprovalPdfType: "SOURCE",
            generatedAttachmentId: attachment.id,
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
  const stamps = approvedSteps.map((step) => ({
    order: step.order,
    source: getFinalApprovalStampSource(step),
  }));
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
  const auditRequestData = await getCurrentAuditLogRequestData();

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
          ...auditRequestData,
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

  const buffer = await createApprovalDocumentPdfBuffer(input);

  return {
    originalName: createGeneratedApprovalPdfOriginalName(
      input.documentNo,
      input.title,
    ),
    storageProvider: storageConfig.provider,
    storageKey: createGeneratedApprovalPdfStorageKey(storageConfig.provider),
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
  const fonts = await embedApprovalPdfFonts(pdf);
  const [page] = pdf.getPages();

  if (!page) {
    throw new Error("승인본 PDF에 도장을 찍을 페이지가 없습니다.");
  }

  for (const stamp of stamps) {
    const placement = getApprovalStampPlacement(
      stamp.order,
      approvalStepCount,
    );

    if (
      stamp.source.signatureImageStorageProvider &&
      stamp.source.signatureImageStorageKey
    ) {
      const imageBuffer = await getApprovalStampImageBuffer(stamp.source);
      const embeddedStamp = await embedApprovalStampImage(pdf, imageBuffer);
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
      continue;
    }

    drawGeneratedApprovalStamp(page, fonts, placement, stamp.source.name);
  }

  return Buffer.from(await pdf.save());
}

async function createApprovalDocumentPdfBuffer(input: ApprovalPdfInput) {
  const pdf = await PDFDocument.create();
  const fonts = await embedApprovalPdfFonts(pdf);
  const page = pdf.addPage([pageWidth, pageHeight]);

  drawApprovalDocumentPage(page, fonts, input);

  return Buffer.from(await pdf.save());
}

function drawApprovalDocumentPage(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  input: ApprovalPdfInput,
) {
  const layout = getApprovalPdfLayout(input.templateName);
  const documentNo = input.documentNo ?? "문서번호 발급 전";
  const issuedAt = formatKoreanDateTime(input.issuedAt);
  const approvers = input.approvers;
  const titleLines = wrapSvgTextLines(
    fonts,
    input.title,
    heroTitleFontSize,
    heroTitleMaxWidth,
    heroTitleMaxLines,
  );
  const approvalPanelBottom = getApprovalPanelBottomY(approvers.length);
  const summaryBottom = 382 + 194;
  const focusPanelTop = Math.max(summaryBottom, approvalPanelBottom) + 34;
  const focusPanelHeight = 118;
  const contentTop = focusPanelTop + focusPanelHeight + 52;
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
  const bodyTextMaxLines = Math.max(
    1,
    Math.floor((bodyRectHeight - 54) / bodyTextLineHeight),
  );
  const bodyLines = wrapLines(
    input.content,
    bodyTextMaxChars,
    bodyTextMaxLines,
  );
  const footerText =
    "본 문서는 전자결재 시스템에서 생성된 원본문서이며, 최종 승인 시 결재란에 승인 기록이 반영됩니다.";

  drawSvgRect(page, 0, 0, svgWidth, svgHeight, layout.pageFill);
  drawSvgRect(page, 78, 72, 1084, 1610, "#ffffff", "#d6dbe3", 2);
  drawSvgRect(page, 78, 72, 1084, 118, layout.headerFill);
  drawSvgText(page, fonts, layout.headerTitle, 118, 132, 27, "#ffffff", {
    fontWeight: 700,
  });
  drawSvgText(
    page,
    fonts,
    "사회적협동조합 청소년자립학교",
    118,
    165,
    17,
    layout.subtitleFill,
  );
  drawSvgText(page, fonts, documentNo, 1018, 132, 17, "#ffffff", {
    align: "end",
  });
  drawSvgText(page, fonts, issuedAt, 1018, 164, 15, layout.subtitleFill, {
    align: "end",
  });

  drawSvgRect(page, 118, 232, 1004, 128, layout.heroFill, layout.heroStroke, 2);
  drawSvgRect(page, 118, 232, 14, 128, layout.accentFill);
  drawSvgText(page, fonts, layout.badgeLabel, 154, 266, 16, layout.accentFill, {
    fontWeight: 700,
  });
  drawSvgText(page, fonts, input.templateName, 154, 309, 34, "#171b22", {
    fontWeight: 800,
  });
  drawSvgMultilineText(
    page,
    fonts,
    titleLines,
    154,
    340,
    heroTitleFontSize,
    heroTitleLineHeight,
    "#171b22",
    700,
  );

  drawInfoPanel(page, fonts, input, documentNo, issuedAt, layout);
  drawApprovalPanel(page, fonts, approvers, input.approvers.length, layout);
  drawTemplateFocusPanel(page, fonts, input, layout, focusPanelTop);

  drawSvgText(
    page,
    fonts,
    layout.bodyTitle,
    118,
    bodyTitleY,
    19,
    layout.accentFill,
    {
      fontWeight: 700,
    },
  );
  drawSvgRect(
    page,
    118,
    bodyRectY,
    1004,
    bodyRectHeight,
    "#ffffff",
    "#d6dbe3",
    2,
  );
  drawSvgMultilineText(
    page,
    fonts,
    bodyLines,
    150,
    bodyRectY + 54,
    bodyTextFontSize,
    bodyTextLineHeight,
    "#2f3742",
  );

  if (shouldRenderNotes) {
    drawApprovalNotesSection(page, fonts, layout);
  }

  drawSvgLine(page, 118, 1602, 1122, 1602, "#d6dbe3", 2);
  drawSvgText(page, fonts, footerText, 118, 1642, 16, "#697386");
}

function drawInfoPanel(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  input: ApprovalPdfInput,
  documentNo: string,
  issuedAt: string,
  layout: ApprovalPdfLayout,
) {
  const rows = [
    ["문서번호", documentNo],
    ["문서양식", input.category],
    ["작성자", `${input.drafter.name} / ${input.drafter.positionName ?? "-"}`],
    ["소속", input.drafter.departmentName ?? "-"],
    ["생성일시", issuedAt],
  ];

  drawSvgRect(page, 118, 382, 560, 194, "#ffffff", layout.heroStroke, 2);

  rows.forEach((row, index) => {
    const y = 382 + index * 38;

    drawSvgRect(
      page,
      118,
      y,
      132,
      38,
      layout.infoLabelFill,
      layout.heroStroke,
      1,
    );
    drawSvgRect(page, 250, y, 428, 38, "#ffffff", layout.heroStroke, 1);
    drawSvgText(page, fonts, row[0], 142, y + 25, 16, "#394150", {
      fontWeight: 700,
    });
    drawSvgText(page, fonts, row[1], 272, y + 25, 16, "#2f3742");
  });
}

function drawApprovalPanel(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  approvers: ApprovalPdfUser[],
  totalCount: number,
  layout: ApprovalPdfLayout,
) {
  const panelLayout = getApprovalPanelLayout(totalCount);
  const columnWidth = panelLayout.width / panelLayout.columns;

  drawSvgText(page, fonts, "결재란", panelLayout.x, 356, 18, layout.accentFill, {
    fontWeight: 700,
  });
  drawSvgRect(
    page,
    panelLayout.x,
    panelLayout.y,
    panelLayout.width,
    panelLayout.height,
    "#ffffff",
    layout.heroStroke,
    2,
  );

  approvers.forEach((approver, index) => {
    const rowIndex = Math.floor(index / panelLayout.columns);
    const columnIndex = index % panelLayout.columns;
    const cellX = panelLayout.x + columnIndex * columnWidth;
    const cellY = panelLayout.y + rowIndex * panelLayout.rowHeight;
    const cellCenterX = cellX + columnWidth / 2;

    drawSvgRect(
      page,
      cellX,
      cellY,
      columnWidth,
      34,
      layout.infoLabelFill,
      layout.heroStroke,
      1,
    );
    drawSvgText(
      page,
      fonts,
      `${index + 1}차`,
      cellCenterX,
      cellY + 23,
      14,
      "#394150",
      {
        align: "middle",
        fontWeight: 700,
      },
    );
    drawSvgRect(
      page,
      cellX,
      cellY + 34,
      columnWidth,
      72,
      "#ffffff",
      layout.heroStroke,
      1,
    );
    drawSvgText(
      page,
      fonts,
      approver.name,
      cellCenterX,
      cellY + 78,
      17,
      "#171b22",
      {
        align: "middle",
        fontWeight: 700,
      },
    );
    drawSvgRect(
      page,
      cellX,
      cellY + 106,
      columnWidth,
      panelLayout.rowHeight - 106,
      "#ffffff",
      layout.heroStroke,
      1,
    );
    drawSvgText(
      page,
      fonts,
      approver.departmentName ?? "",
      cellCenterX,
      cellY + 127,
      12,
      "#697386",
      {
        align: "middle",
      },
    );
    drawSvgText(
      page,
      fonts,
      approver.positionName ?? "",
      cellCenterX,
      cellY + 145,
      12,
      "#697386",
      {
        align: "middle",
      },
    );
  });
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

function drawTemplateFocusPanel(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  input: ApprovalPdfInput,
  layout: ApprovalPdfLayout,
  y: number,
) {
  const cards = [
    ["문서유형", layout.badgeLabel],
    [layout.reviewLabel, layout.reviewValue],
    ["결재선", `${input.approvers.length}명`],
  ];

  drawSvgRect(page, 118, y, 1004, 118, layout.focusFill, layout.heroStroke, 2);
  drawSvgText(page, fonts, layout.focusTitle, 150, y + 35, 19, layout.accentFill, {
    fontWeight: 700,
  });

  cards.forEach(([label, value], index) => {
    const x = 150 + index * 310;

    drawSvgRect(page, x, y + 54, 270, 42, "#ffffff", layout.heroStroke, 1);
    drawSvgText(page, fonts, label, x + 20, y + 81, 14, "#697386", {
      fontWeight: 700,
    });
    drawSvgText(page, fonts, value, x + 118, y + 81, 16, "#171b22", {
      fontWeight: 700,
    });
  });
}

function drawApprovalNotesSection(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  layout: ApprovalPdfLayout,
) {
  drawSvgText(page, fonts, layout.notesTitle, 118, 1390, 19, layout.accentFill, {
    fontWeight: 700,
  });
  drawSvgRect(page, 118, 1420, 1004, 128, layout.focusFill, layout.heroStroke, 2);
  drawSvgText(
    page,
    fonts,
    layout.notesLines[0],
    150,
    1472,
    19,
    "#394150",
  );
  drawSvgText(
    page,
    fonts,
    layout.notesLines[1],
    150,
    1515,
    19,
    "#394150",
  );
}

function drawSvgMultilineText(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  lines: string[],
  x: number,
  y: number,
  fontSize: number,
  lineHeight: number,
  fill: string,
  fontWeight = 400,
) {
  lines.forEach((line, index) => {
    drawSvgText(
      page,
      fonts,
      line,
      x,
      y + index * lineHeight,
      fontSize,
      fill,
      { fontWeight },
    );
  });
}

function drawSvgRect(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke?: string,
  strokeWidth = 0,
) {
  page.drawRectangle({
    x: svgToPdfX(x),
    y: svgToPdfRectY(y, height),
    width: svgToPdfWidth(width),
    height: svgToPdfHeight(height),
    color: hexColor(fill),
    borderColor: stroke ? hexColor(stroke) : undefined,
    borderWidth: stroke ? svgToPdfSize(strokeWidth) : undefined,
  });
}

function drawSvgLine(
  page: PDFPage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  strokeWidth: number,
) {
  page.drawLine({
    start: {
      x: svgToPdfX(x1),
      y: svgToPdfY(y1),
    },
    end: {
      x: svgToPdfX(x2),
      y: svgToPdfY(y2),
    },
    thickness: svgToPdfSize(strokeWidth),
    color: hexColor(stroke),
  });
}

function drawSvgText(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fill: string,
  options: {
    align?: TextAlign;
    fontWeight?: number;
  } = {},
) {
  drawPdfText(
    page,
    fonts,
    text,
    svgToPdfX(x),
    svgToPdfY(y),
    svgToPdfSize(fontSize),
    fill,
    options,
  );
}

function drawPdfText(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fill: string,
  options: {
    align?: TextAlign;
    fontWeight?: number;
    opacity?: number;
  } = {},
) {
  if (!text) {
    return;
  }

  const font = fonts.korean;
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const align = options.align ?? "start";
  const drawX =
    align === "middle" ? x - textWidth / 2 : align === "end" ? x - textWidth : x;
  const color = hexColor(fill);
  const boldOffset = (options.fontWeight ?? 400) >= 700 ? fontSize * 0.018 : 0;

  page.drawText(text, {
    x: drawX,
    y,
    size: fontSize,
    font,
    color,
    opacity: options.opacity,
  });

  if (boldOffset > 0) {
    page.drawText(text, {
      x: drawX + boldOffset,
      y,
      size: fontSize,
      font,
      color,
      opacity: options.opacity,
    });
  }
}

function svgToPdfX(value: number) {
  return value * pdfScaleX;
}

function svgToPdfY(value: number) {
  return pageHeight - value * pdfScaleY;
}

function svgToPdfRectY(y: number, height: number) {
  return pageHeight - (y + height) * pdfScaleY;
}

function svgToPdfWidth(value: number) {
  return value * pdfScaleX;
}

function svgToPdfHeight(value: number) {
  return value * pdfScaleY;
}

function svgToPdfSize(value: number) {
  return value * pdfScale;
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

function wrapSvgTextLines(
  fonts: ApprovalPdfFonts,
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines: number,
) {
  return wrapMeasuredLines(
    fonts.korean,
    text,
    svgToPdfSize(fontSize),
    svgToPdfWidth(maxWidth),
    maxLines,
  );
}

function wrapMeasuredLines(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines: number,
) {
  const sourceLines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .flatMap((line) =>
      wrapMeasuredLine(font, line.trim(), fontSize, maxWidth),
    );
  const lines = sourceLines.filter(Boolean);

  if (lines.length === 0) {
    return ["-"];
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const visibleLines = lines.slice(0, maxLines);
  visibleLines[visibleLines.length - 1] = fitMeasuredLineWithSuffix(
    font,
    visibleLines[visibleLines.length - 1],
    " ...",
    fontSize,
    maxWidth,
  );

  return visibleLines;
}

function wrapMeasuredLine(
  font: PDFFont,
  line: string,
  fontSize: number,
  maxWidth: number,
) {
  if (!line) {
    return [""];
  }

  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (isMeasuredTextWithinWidth(font, next, fontSize, maxWidth)) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
      current = "";
    }

    if (isMeasuredTextWithinWidth(font, word, fontSize, maxWidth)) {
      current = word;
      continue;
    }

    const wordLines = wrapMeasuredWord(font, word, fontSize, maxWidth);
    lines.push(...wordLines.slice(0, -1));
    current = wordLines[wordLines.length - 1] ?? "";
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function wrapMeasuredWord(
  font: PDFFont,
  word: string,
  fontSize: number,
  maxWidth: number,
) {
  const lines: string[] = [];
  let current = "";

  for (const character of Array.from(word)) {
    const next = `${current}${character}`;

    if (isMeasuredTextWithinWidth(font, next, fontSize, maxWidth)) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    current = character;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function fitMeasuredLineWithSuffix(
  font: PDFFont,
  line: string,
  suffix: string,
  fontSize: number,
  maxWidth: number,
) {
  let text = line.trimEnd();

  while (
    text.length > 0 &&
    !isMeasuredTextWithinWidth(font, `${text}${suffix}`, fontSize, maxWidth)
  ) {
    text = Array.from(text).slice(0, -1).join("").trimEnd();
  }

  return text ? `${text}${suffix}` : suffix.trim();
}

function isMeasuredTextWithinWidth(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number,
) {
  return font.widthOfTextAtSize(text, fontSize) <= maxWidth;
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

function createGeneratedApprovalPdfStorageKey(
  provider: AttachmentStorageProvider,
) {
  return `${getAttachmentStorageKeyPrefix(provider)}${generatedApprovalPdfStorageSegment}${randomUUID()}.pdf`;
}

function isCurrentGeneratedApprovalPdfStorageKey(storageKey: string) {
  const normalizedKey = storageKey.replace(/\\/g, "/");

  return (
    normalizedKey.startsWith(generatedApprovalPdfStorageSegment) ||
    normalizedKey.includes(`/${generatedApprovalPdfStorageSegment}`)
  );
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

async function embedApprovalPdfFonts(
  pdf: PDFDocument,
): Promise<ApprovalPdfFonts> {
  pdf.registerFontkit(fontkit);

  return {
    korean: await pdf.embedFont(readFileSync(pdfKoreanFontPath), {
      subset: false,
    }),
  };
}

function hexColor(value: string) {
  const normalized = value.replace("#", "").trim();
  const hex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : normalized;
  const color = Number.parseInt(hex, 16);

  return rgb(
    ((color >> 16) & 255) / 255,
    ((color >> 8) & 255) / 255,
    (color & 255) / 255,
  );
}

async function ensureGeneratedApprovalPdfAttachment(
  document: {
    id: string;
    documentNo: string | null;
    title: string;
  },
  actorId: string,
) {
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

function drawGeneratedApprovalStamp(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  placement: {
    x: number;
    top: number;
    size: number;
  },
  name: string,
) {
  const centerX = placement.x + placement.size / 2;
  const centerY = page.getHeight() - placement.top - placement.size / 2;
  const red = hexColor("#c82333");
  const safeName = name.trim().slice(0, 5) || "승인";

  page.drawCircle({
    x: centerX,
    y: centerY,
    size: placement.size / 2,
    borderColor: red,
    borderWidth: placement.size * 0.065,
    borderOpacity: 0.92,
  });
  page.drawCircle({
    x: centerX,
    y: centerY,
    size: placement.size * 0.4,
    borderColor: red,
    borderWidth: placement.size * 0.018,
    borderOpacity: 0.62,
  });
  drawPdfText(
    page,
    fonts,
    "승인",
    centerX,
    centerY + placement.size * 0.04,
    placement.size * 0.23,
    "#c82333",
    {
      align: "middle",
      fontWeight: 800,
      opacity: 0.92,
    },
  );
  drawPdfText(
    page,
    fonts,
    safeName,
    centerX,
    centerY - placement.size * 0.21,
    placement.size * 0.14,
    "#c82333",
    {
      align: "middle",
      fontWeight: 700,
      opacity: 0.92,
    },
  );
}

async function getApprovalStampImageBuffer(source: ApprovalStampImageSource) {
  if (!source.signatureImageStorageProvider || !source.signatureImageStorageKey) {
    throw new Error("등록된 결재 도장/서명 이미지가 없습니다.");
  }

  const storedFile = await readStoredAttachmentFile({
    storageProvider: source.signatureImageStorageProvider,
    storageKey: source.signatureImageStorageKey,
  });

  return readableStreamToBuffer(storedFile.body);
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
