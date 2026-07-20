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
import {
  extractDisplayContentFromTemplate,
  getDocumentTemplateDisplayRows,
  type DocumentTemplateDisplayRow,
} from "@/lib/draft-template-content";
import { prisma } from "@/lib/prisma";
import {
  getApprovalPdfLayout,
  type ApprovalPdfLayout,
  type ApprovalPdfLayoutKind,
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

export type ApprovalPdfInput = {
  documentNo: string | null;
  title: string;
  category: string;
  content: string;
  templateName: string;
  templateSchema?: unknown;
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
const headerMetaLabelX = 790;
const headerMetaValueX = 1018;
const headerMetaValueWidth = 210;
const infoPanelX = 118;
const infoPanelY = 414;
const infoPanelWidth = 560;
const infoPanelLabelWidth = 132;
const infoPanelRowHeight = 38;
const infoPanelTitleY = 400;
const approvalPanelX = 718;
const approvalPanelY = infoPanelY;
const approvalPanelWidth = 404;
const approvalPanelRowHeight = 150;
const approvalPanelTitleY = infoPanelTitleY;
const heroTemplateNameMaxWidth = 520;
const heroTemplateNameFontSize = 30;
const heroTitleMaxWidth = 430;
const heroTitleY = 332;
const heroTitleFontSize = 16;
const heroTitleLineHeight = 18;
const heroTitleMaxLines = 2;
const bodyTextFontSize = 16;
const bodyTextLineHeight = 30;
const bodyTextMaxChars = 58;
const templateTableX = 118;
const templateTableWidth = 1004;
const templateTableLabelWidth = 214;
const templateTablePaddingX = 24;
const templateTablePaddingTop = 29;
const templateTablePaddingBottom = 18;
const templateTableLabelFontSize = 15;
const templateTableValueFontSize = 15;
const templateTableLineHeight = 24;
const templateTableMinRowHeight = 58;
const templateTableMaxWrappedLines = 500;
const continuationBodyTitleY = 350;
const continuationTableY = 382;
const continuationTableMaxBottomY = 1548;
const meetingTableX = 118;
const meetingTableWidth = 1004;
const meetingLabelWidth = 158;
const meetingCellPaddingX = 20;
const meetingLineHeight = 26;
const meetingInfoRowHeight = 50;
const meetingBlockFirstBaseline = 34;
const meetingBlockPaddingBottom = 16;
const meetingFontSize = 15;
const meetingHeadingFontSize = 18;
const meetingBorderColor = "#16181d";
const meetingTitleY = 170;
const meetingFirstTableY = 250;
const meetingContinuationTableY = 96;
const meetingTableMaxBottomY = 1666;
const generatedApprovalPdfStorageSegment = "generated-approval-pdf-v5/";
const approvalDocumentFooterText =
  "본 문서는 전자결재 시스템에서 생성된 원본문서이며, 최종 승인 시 결재란에 승인 기록이 반영됩니다.";
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
      templateId: true,
      submittedAt: true,
      createdAt: true,
      drafterId: true,
      template: {
        select: {
          name: true,
          schema: true,
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
      template: {
        select: {
          name: true,
        },
      },
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
    layoutKind: getApprovalPdfLayout(document.template.name).kind,
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
  layoutKind,
  originalName,
  sourceBuffer,
  stamps,
}: {
  approvalStepCount: number;
  layoutKind: ApprovalPdfLayoutKind;
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
    layoutKind,
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
  layoutKind: ApprovalPdfLayoutKind = "general",
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
      layoutKind,
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

export async function createApprovalDocumentPdfBuffer(input: ApprovalPdfInput) {
  const pdf = await PDFDocument.create();
  const fonts = await embedApprovalPdfFonts(pdf);
  const page = pdf.addPage([pageWidth, pageHeight]);

  drawApprovalDocumentPage(pdf, page, fonts, input);

  return Buffer.from(await pdf.save());
}

function drawApprovalDocumentPage(
  pdf: PDFDocument,
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  input: ApprovalPdfInput,
) {
  const layout = getApprovalPdfLayout(input.templateName);

  if (layout.kind === "meeting") {
    const meetingDisplayRows = input.templateSchema
      ? getDocumentTemplateDisplayRows(input.templateSchema, input.content)
      : [];

    if (meetingDisplayRows.length > 0) {
      drawMeetingMinutesDocumentPages(pdf, page, fonts, input, meetingDisplayRows);
      return;
    }
  }

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
  const summaryBottom = infoPanelY + infoPanelRowHeight * 5 + 4;
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
  const templateDisplayRows = input.templateSchema
    ? getDocumentTemplateDisplayRows(input.templateSchema, input.content)
    : [];
  const bodyTextMaxLines = Math.max(
    1,
    Math.floor((bodyRectHeight - 54) / bodyTextLineHeight),
  );
  const bodyLines = wrapLines(
    input.content,
    bodyTextMaxChars,
    bodyTextMaxLines,
  );

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
  drawApprovalHeaderMetadata(page, fonts, layout, documentNo, issuedAt);

  drawSvgRect(page, 118, 232, 1004, 128, layout.heroFill, layout.heroStroke, 2);
  drawSvgRect(page, 118, 232, 14, 128, layout.accentFill);
  drawSvgText(page, fonts, layout.badgeLabel, 154, 266, 16, layout.accentFill, {
    fontWeight: 700,
  });
  drawSvgFittedText(
    page,
    fonts,
    input.templateName,
    154,
    309,
    heroTemplateNameFontSize,
    "#171b22",
    heroTemplateNameMaxWidth,
    {
      fontWeight: 800,
    },
  );
  drawSvgMultilineText(
    page,
    fonts,
    titleLines,
    154,
    heroTitleY,
    heroTitleFontSize,
    heroTitleLineHeight,
    "#171b22",
    700,
  );

  drawInfoPanel(page, fonts, input, documentNo, issuedAt, layout);
  drawApprovalPanel(page, fonts, approvers, input.approvers.length, layout);
  drawTemplateFocusPanel(page, fonts, input, layout, focusPanelTop);

  const structuredBodyBottom =
    templateDisplayRows.length > 0
      ? drawDocumentTemplateTablePages(
          pdf,
          page,
          fonts,
          templateDisplayRows,
          layout,
          bodyTitleY,
          bodyRectY,
          1548,
          input,
          documentNo,
          issuedAt,
        )
      : null;

  if (structuredBodyBottom === null) {
    drawTextBodySection(
      page,
      fonts,
      layout,
      bodyLines,
      bodyTitleY,
      bodyRectY,
      bodyRectHeight,
    );
  }

  if (
    structuredBodyBottom === null
      ? shouldRenderNotes
      : !structuredBodyBottom.hasContinuation &&
        structuredBodyBottom.firstPageBottomY + 64 <= notesTitleY
  ) {
    drawApprovalNotesSection(page, fonts, layout);
  }

  drawApprovalDocumentFooter(page, fonts);
}

type MeetingMinutesInfoCell = {
  label: string;
  value: string;
  labelWidth: number;
  valueWidth: number;
};

type MeetingMinutesSegment =
  | {
      kind: "info";
      cells: MeetingMinutesInfoCell[];
    }
  | {
      kind: "block";
      label: string;
      value: string;
    };

function drawMeetingMinutesDocumentPages(
  pdf: PDFDocument,
  firstPage: PDFPage,
  fonts: ApprovalPdfFonts,
  input: ApprovalPdfInput,
  rows: DocumentTemplateDisplayRow[],
) {
  const segments = createMeetingMinutesSegments(rows);
  let page = firstPage;
  let y = meetingFirstTableY;
  let pageTableTop = meetingFirstTableY;

  drawSvgText(page, fonts, "회의록", 620, meetingTitleY, 46, meetingBorderColor, {
    align: "middle",
    fontWeight: 800,
  });

  function finishPageOutline() {
    if (y > pageTableTop) {
      drawMeetingMinutesTableOutline(page, pageTableTop, y);
    }
  }

  function moveToNextPage() {
    finishPageOutline();
    page = pdf.addPage([pageWidth, pageHeight]);
    y = meetingContinuationTableY;
    pageTableTop = meetingContinuationTableY;
  }

  for (const segment of segments) {
    if (segment.kind === "info") {
      if (y + meetingInfoRowHeight > meetingTableMaxBottomY) {
        moveToNextPage();
      }

      drawMeetingMinutesInfoRow(page, fonts, y, segment.cells);
      y += meetingInfoRowHeight;
      continue;
    }

    const valueMaxWidth =
      meetingTableWidth - meetingLabelWidth - meetingCellPaddingX * 2;
    const lines = wrapMeetingMinutesBlockLines(
      fonts,
      segment.value,
      valueMaxWidth,
    );
    let lineIndex = 0;

    while (lineIndex < lines.length) {
      const remainingHeight = meetingTableMaxBottomY - y;
      const fittingLineCount =
        Math.floor(
          (remainingHeight -
            meetingBlockFirstBaseline -
            meetingBlockPaddingBottom) /
            meetingLineHeight,
        ) + 1;

      if (fittingLineCount < 1) {
        moveToNextPage();
        continue;
      }

      const visibleLines = lines.slice(lineIndex, lineIndex + fittingLineCount);
      const rowHeight = Math.max(
        meetingInfoRowHeight,
        meetingBlockFirstBaseline +
          (visibleLines.length - 1) * meetingLineHeight +
          meetingBlockPaddingBottom,
      );

      drawMeetingMinutesBlockRow(
        page,
        fonts,
        y,
        rowHeight,
        segment.label,
        visibleLines,
      );
      y += rowHeight;
      lineIndex += visibleLines.length;

      if (lineIndex < lines.length) {
        moveToNextPage();
      }
    }
  }

  finishPageOutline();

  let writerY = y + 46;

  if (writerY > svgHeight - 60) {
    page = pdf.addPage([pageWidth, pageHeight]);
    writerY = meetingContinuationTableY + 30;
  }

  drawSvgText(
    page,
    fonts,
    `작성자: ${input.drafter.name}`,
    meetingTableX + meetingTableWidth - meetingCellPaddingX,
    writerY,
    16,
    meetingBorderColor,
    {
      align: "end",
      fontWeight: 700,
    },
  );
}

function createMeetingMinutesSegments(
  rows: DocumentTemplateDisplayRow[],
): MeetingMinutesSegment[] {
  const rowByName = new Map(rows.map((row) => [row.name, row]));
  const consumedNames = new Set<string>();
  const segments: MeetingMinutesSegment[] = [];
  const fullValueWidth = meetingTableWidth - meetingLabelWidth;

  function takeRow(name: string) {
    const row = rowByName.get(name);

    if (row) {
      consumedNames.add(name);
    }

    return row;
  }

  const meetingTitleRow = takeRow("meetingTitle");

  if (meetingTitleRow) {
    segments.push({
      kind: "info",
      cells: [
        {
          label: meetingTitleRow.label,
          value: meetingTitleRow.value,
          labelWidth: meetingLabelWidth,
          valueWidth: fullValueWidth,
        },
      ],
    });
  }

  const meetingDateRow = takeRow("meetingDate");
  const locationRow = takeRow("location");

  if (meetingDateRow || locationRow) {
    segments.push({
      kind: "info",
      cells: [
        {
          label: meetingDateRow?.label ?? "일시",
          value: formatMeetingMinutesDate(meetingDateRow?.value ?? ""),
          labelWidth: meetingLabelWidth,
          valueWidth: 372,
        },
        {
          label: locationRow?.label ?? "장소",
          value: locationRow?.value ?? "",
          labelWidth: 130,
          valueWidth: 344,
        },
      ],
    });
  }

  for (const name of ["attendees", "host"]) {
    const row = takeRow(name);

    if (row) {
      segments.push({
        kind: "info",
        cells: [
          {
            label: row.label,
            value: row.value,
            labelWidth: meetingLabelWidth,
            valueWidth: fullValueWidth,
          },
        ],
      });
    }
  }

  for (const name of [
    "agenda",
    "discussion",
    "specialNotes",
    "followUpSchedule",
  ]) {
    const row = takeRow(name);

    if (row) {
      segments.push({
        kind: "block",
        label: row.label,
        value: row.value,
      });
    }
  }

  for (const row of rows) {
    if (consumedNames.has(row.name)) {
      continue;
    }

    segments.push({
      kind: "block",
      label: row.label,
      value: row.value,
    });
  }

  return segments;
}

function drawMeetingMinutesInfoRow(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  y: number,
  cells: MeetingMinutesInfoCell[],
) {
  const textBaselineY = y + meetingInfoRowHeight / 2 + 6;
  let x = meetingTableX;

  for (const cell of cells) {
    drawSvgRect(
      page,
      x,
      y,
      cell.labelWidth,
      meetingInfoRowHeight,
      "#ffffff",
      meetingBorderColor,
      1.5,
    );
    drawSvgText(
      page,
      fonts,
      cell.label,
      x + cell.labelWidth / 2,
      textBaselineY,
      meetingFontSize,
      meetingBorderColor,
      {
        align: "middle",
        fontWeight: 700,
      },
    );
    drawSvgRect(
      page,
      x + cell.labelWidth,
      y,
      cell.valueWidth,
      meetingInfoRowHeight,
      "#ffffff",
      meetingBorderColor,
      1.5,
    );
    drawSvgFittedText(
      page,
      fonts,
      cell.value || "-",
      x + cell.labelWidth + meetingCellPaddingX,
      textBaselineY,
      meetingFontSize,
      "#16181d",
      cell.valueWidth - meetingCellPaddingX * 2,
    );
    x += cell.labelWidth + cell.valueWidth;
  }
}

type MeetingMinutesBlockLine = {
  fontSize: number;
  fontWeight: number;
  text: string;
};

function wrapMeetingMinutesBlockLines(
  fonts: ApprovalPdfFonts,
  value: string,
  maxWidth: number,
): MeetingMinutesBlockLine[] {
  const lines: MeetingMinutesBlockLine[] = [];
  const sourceLines = (value || "-")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  for (const sourceLine of sourceLines) {
    const trimmedLine = sourceLine.trim();

    if (!trimmedLine) {
      continue;
    }

    const isAgendaHeading = /^안건\s*\d+\s*\./.test(trimmedLine);
    const isSectionHeading = ["논의 내용", "논의내용", "결정 사항", "결정사항"].includes(
      trimmedLine,
    );
    const fontSize = isAgendaHeading ? meetingHeadingFontSize : meetingFontSize;
    const fontWeight = isAgendaHeading || isSectionHeading ? 700 : 400;

    for (const wrappedLine of wrapSvgTextLines(
      fonts,
      trimmedLine,
      fontSize,
      maxWidth,
      templateTableMaxWrappedLines,
    )) {
      lines.push({
        fontSize,
        fontWeight,
        text: wrappedLine,
      });
    }
  }

  if (lines.length === 0) {
    return [
      {
        fontSize: meetingFontSize,
        fontWeight: 400,
        text: "-",
      },
    ];
  }

  return lines;
}

function drawMeetingMinutesBlockRow(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  y: number,
  height: number,
  label: string,
  lines: MeetingMinutesBlockLine[],
) {
  drawSvgRect(
    page,
    meetingTableX,
    y,
    meetingLabelWidth,
    height,
    "#ffffff",
    meetingBorderColor,
    1.5,
  );
  drawSvgText(
    page,
    fonts,
    label,
    meetingTableX + meetingLabelWidth / 2,
    y + height / 2 + 6,
    meetingFontSize,
    meetingBorderColor,
    {
      align: "middle",
      fontWeight: 700,
    },
  );
  drawSvgRect(
    page,
    meetingTableX + meetingLabelWidth,
    y,
    meetingTableWidth - meetingLabelWidth,
    height,
    "#ffffff",
    meetingBorderColor,
    1.5,
  );
  lines.forEach((line, index) => {
    drawSvgText(
      page,
      fonts,
      line.text,
      meetingTableX + meetingLabelWidth + meetingCellPaddingX,
      y + meetingBlockFirstBaseline + index * meetingLineHeight,
      line.fontSize,
      "#16181d",
      {
        fontWeight: line.fontWeight,
      },
    );
  });
}

function drawMeetingMinutesTableOutline(
  page: PDFPage,
  topY: number,
  bottomY: number,
) {
  const rightX = meetingTableX + meetingTableWidth;

  drawSvgLine(page, meetingTableX, topY, rightX, topY, meetingBorderColor, 3);
  drawSvgLine(page, meetingTableX, bottomY, rightX, bottomY, meetingBorderColor, 3);
  drawSvgLine(page, meetingTableX, topY, meetingTableX, bottomY, meetingBorderColor, 3);
  drawSvgLine(page, rightX, topY, rightX, bottomY, meetingBorderColor, 3);
}

function formatMeetingMinutesDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const [year, month, day] = value.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(Date.UTC(year, month - 1, day)));

  return `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}.(${weekday})`;
}

function drawTextBodySection(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  layout: ApprovalPdfLayout,
  bodyLines: string[],
  bodyTitleY: number,
  bodyRectY: number,
  bodyRectHeight: number,
) {
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
}

function drawDocumentTemplateTablePages(
  pdf: PDFDocument,
  firstPage: PDFPage,
  fonts: ApprovalPdfFonts,
  rows: DocumentTemplateDisplayRow[],
  layout: ApprovalPdfLayout,
  bodyTitleY: number,
  tableY: number,
  firstPageMaxBottomY: number,
  input: ApprovalPdfInput,
  documentNo: string,
  issuedAt: string,
) {
  const sections = paginateDocumentTemplateTableRows(
    fonts,
    rows,
    tableY,
    firstPageMaxBottomY,
    continuationTableY,
    continuationTableMaxBottomY,
  );
  const firstSection = sections[0] ?? {
    bottomY: tableY,
    rows: [],
  };

  drawDocumentTemplateTableSection(
    firstPage,
    fonts,
    firstSection.rows,
    layout,
    layout.bodyTitle,
    bodyTitleY,
    tableY,
  );

  sections.slice(1).forEach((section, index) => {
    const page = pdf.addPage([pageWidth, pageHeight]);
    const pageNumber = index + 2;

    drawApprovalDocumentContinuationPageFrame(
      page,
      fonts,
      input,
      layout,
      documentNo,
      issuedAt,
      pageNumber,
    );
    drawDocumentTemplateTableSection(
      page,
      fonts,
      section.rows,
      layout,
      `${layout.bodyTitle} 계속`,
      continuationBodyTitleY,
      continuationTableY,
    );
    drawApprovalDocumentFooter(page, fonts, `${pageNumber}페이지`);
  });

  return {
    firstPageBottomY: firstSection.bottomY,
    hasContinuation: sections.length > 1,
  };
}

function drawDocumentTemplateTableSection(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  rowLayouts: DocumentTemplateTableRowLayout[],
  layout: ApprovalPdfLayout,
  title: string,
  bodyTitleY: number,
  tableY: number,
) {
  const lastRowLayout = rowLayouts.at(-1);
  const tableBottomY = lastRowLayout
    ? lastRowLayout.y + lastRowLayout.height
    : tableY;

  drawSvgText(
    page,
    fonts,
    title,
    118,
    bodyTitleY,
    19,
    layout.accentFill,
    {
      fontWeight: 700,
    },
  );

  if (rowLayouts.length === 0) {
    drawSvgRect(
      page,
      templateTableX,
      tableY,
      templateTableWidth,
      templateTableMinRowHeight,
      "#ffffff",
      "#d6dbe3",
      2,
    );
    drawSvgText(page, fonts, "-", 150, tableY + 38, 15, "#697386");

    return tableY + templateTableMinRowHeight;
  }

  rowLayouts.forEach((rowLayout) => {
    drawDocumentTemplateTableRow(page, fonts, rowLayout, layout);
  });

  return tableBottomY;
}

function drawDocumentTemplateTableRow(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  rowLayout: DocumentTemplateTableRowLayout,
  layout: ApprovalPdfLayout,
) {
  const valueX = templateTableX + templateTableLabelWidth;
  const valueWidth = templateTableWidth - templateTableLabelWidth;
  const labelLines = wrapSvgTextLines(
    fonts,
    rowLayout.label,
    templateTableLabelFontSize,
    templateTableLabelWidth - templateTablePaddingX * 2,
    2,
  );

  drawSvgRect(
    page,
    templateTableX,
    rowLayout.y,
    templateTableLabelWidth,
    rowLayout.height,
    layout.infoLabelFill,
    layout.heroStroke,
    1,
  );
  drawSvgRect(
    page,
    valueX,
    rowLayout.y,
    valueWidth,
    rowLayout.height,
    "#ffffff",
    layout.heroStroke,
    1,
  );

  drawSvgMultilineText(
    page,
    fonts,
    labelLines,
    templateTableX + templateTablePaddingX,
    rowLayout.y + templateTablePaddingTop,
    templateTableLabelFontSize,
    templateTableLineHeight,
    "#394150",
    700,
  );
  drawSvgMultilineText(
    page,
    fonts,
    rowLayout.lines,
    valueX + templateTablePaddingX,
    rowLayout.y + templateTablePaddingTop,
    templateTableValueFontSize,
    templateTableLineHeight,
    "#2f3742",
  );
}

type DocumentTemplateTableRowLayout = {
  height: number;
  label: string;
  lines: string[];
  row: DocumentTemplateDisplayRow;
  y: number;
};

type DocumentTemplateTableSection = {
  bottomY: number;
  rows: DocumentTemplateTableRowLayout[];
};

function paginateDocumentTemplateTableRows(
  fonts: ApprovalPdfFonts,
  rows: DocumentTemplateDisplayRow[],
  firstTableY: number,
  firstMaxBottomY: number,
  nextTableY: number,
  nextMaxBottomY: number,
): DocumentTemplateTableSection[] {
  const sections: DocumentTemplateTableSection[] = [];
  let currentRows: DocumentTemplateTableRowLayout[] = [];
  let currentY = firstTableY;
  let currentMaxBottomY = firstMaxBottomY;

  function finishSection() {
    sections.push({
      bottomY: currentRows.at(-1)
        ? currentRows[currentRows.length - 1].y +
          currentRows[currentRows.length - 1].height
        : currentY,
      rows: currentRows,
    });
    currentRows = [];
    currentY = nextTableY;
    currentMaxBottomY = nextMaxBottomY;
  }

  for (const row of rows) {
    const lines = getDocumentTemplateTableValueLines(fonts, row);
    let lineIndex = 0;
    let continued = false;

    while (lineIndex < lines.length) {
      const label = continued ? `${row.label} (계속)` : row.label;
      const labelLineCount = getDocumentTemplateTableLabelLineCount(
        fonts,
        label,
      );
      let remainingHeight = currentMaxBottomY - currentY;

      if (
        remainingHeight <
        getDocumentTemplateTableRowHeight(Math.max(1, labelLineCount))
      ) {
        finishSection();
        remainingHeight = currentMaxBottomY - currentY;
      }

      let fittingLineCount = getDocumentTemplateTableFittingLineCount(
        remainingHeight,
      );

      if (fittingLineCount <= 0) {
        finishSection();
        remainingHeight = currentMaxBottomY - currentY;
        fittingLineCount = getDocumentTemplateTableFittingLineCount(
          remainingHeight,
        );
      }

      const visibleLineCount = Math.max(
        1,
        Math.min(fittingLineCount, lines.length - lineIndex),
      );
      const visibleLines = lines.slice(lineIndex, lineIndex + visibleLineCount);
      const rowHeight = getDocumentTemplateTableRowHeight(
        Math.max(labelLineCount, visibleLines.length),
      );

      if (rowHeight > remainingHeight && currentRows.length > 0) {
        finishSection();
        continue;
      }

      currentRows.push({
        height: Math.min(rowHeight, currentMaxBottomY - currentY),
        label,
        lines: visibleLines,
        row,
        y: currentY,
      });
      currentY += Math.min(rowHeight, currentMaxBottomY - currentY);
      lineIndex += visibleLineCount;
      continued = true;

      if (lineIndex < lines.length) {
        finishSection();
      }
    }
  }

  if (currentRows.length > 0 || sections.length === 0) {
    sections.push({
      bottomY: currentRows.at(-1)
        ? currentRows[currentRows.length - 1].y +
          currentRows[currentRows.length - 1].height
        : currentY,
      rows: currentRows,
    });
  }

  return sections;
}

function getDocumentTemplateTableValueLines(
  fonts: ApprovalPdfFonts,
  row: DocumentTemplateDisplayRow,
) {
  const valueMaxWidth =
    templateTableWidth - templateTableLabelWidth - templateTablePaddingX * 2;

  return wrapSvgTextLines(
    fonts,
    row.value || "-",
    templateTableValueFontSize,
    valueMaxWidth,
    templateTableMaxWrappedLines,
  );
}

function getDocumentTemplateTableRowHeight(lineCount: number) {
  return Math.max(
    templateTableMinRowHeight,
    templateTablePaddingTop +
      templateTablePaddingBottom +
      lineCount * templateTableLineHeight,
  );
}

function getDocumentTemplateTableLabelLineCount(
  fonts: ApprovalPdfFonts,
  label: string,
) {
  return wrapSvgTextLines(
    fonts,
    label,
    templateTableLabelFontSize,
    templateTableLabelWidth - templateTablePaddingX * 2,
    2,
  ).length;
}

function getDocumentTemplateTableFittingLineCount(remainingHeight: number) {
  return Math.floor(
    (remainingHeight - templateTablePaddingTop - templateTablePaddingBottom) /
      templateTableLineHeight,
  );
}

function drawApprovalDocumentContinuationPageFrame(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  input: ApprovalPdfInput,
  layout: ApprovalPdfLayout,
  documentNo: string,
  issuedAt: string,
  pageNumber: number,
) {
  const titleLines = wrapSvgTextLines(fonts, input.title, 17, 650, 2);

  drawSvgRect(page, 0, 0, svgWidth, svgHeight, layout.pageFill);
  drawSvgRect(page, 78, 72, 1084, 1610, "#ffffff", "#d6dbe3", 2);
  drawSvgRect(page, 78, 72, 1084, 118, layout.headerFill);
  drawSvgText(page, fonts, `${layout.headerTitle} 계속`, 118, 132, 27, "#ffffff", {
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
  drawApprovalHeaderMetadata(
    page,
    fonts,
    layout,
    `${documentNo} · ${pageNumber}페이지`,
    issuedAt,
  );

  drawSvgRect(page, 118, 220, 1004, 82, layout.heroFill, layout.heroStroke, 2);
  drawSvgRect(page, 118, 220, 14, 82, layout.accentFill);
  drawSvgText(page, fonts, input.templateName, 154, 253, 22, "#171b22", {
    fontWeight: 800,
  });
  drawSvgMultilineText(
    page,
    fonts,
    titleLines,
    154,
    280,
    17,
    22,
    "#394150",
    700,
  );
}

function drawApprovalHeaderMetadata(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  layout: ApprovalPdfLayout,
  documentNo: string,
  issuedAt: string,
) {
  drawSvgText(page, fonts, "문서번호", headerMetaLabelX, 132, 13, layout.subtitleFill, {
    fontWeight: 700,
  });
  drawSvgFittedText(
    page,
    fonts,
    documentNo,
    headerMetaValueX,
    132,
    17,
    "#ffffff",
    headerMetaValueWidth,
    {
      align: "end",
      fontWeight: 700,
    },
  );
  drawSvgText(page, fonts, "작성일시", headerMetaLabelX, 164, 13, layout.subtitleFill, {
    fontWeight: 700,
  });
  drawSvgFittedText(
    page,
    fonts,
    issuedAt,
    headerMetaValueX,
    164,
    15,
    layout.subtitleFill,
    headerMetaValueWidth,
    {
      align: "end",
    },
  );
}

function drawApprovalDocumentFooter(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  suffix?: string,
) {
  drawSvgLine(page, 118, 1602, 1122, 1602, "#d6dbe3", 2);
  drawSvgText(
    page,
    fonts,
    suffix ? `${approvalDocumentFooterText} · ${suffix}` : approvalDocumentFooterText,
    118,
    1642,
    16,
    "#697386",
  );
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
    ["문서양식", input.templateName],
    ["작성자", `${input.drafter.name} / ${input.drafter.positionName ?? "-"}`],
    ["소속", input.drafter.departmentName ?? "-"],
    ["작성일시", issuedAt],
  ];
  const valueX = infoPanelX + infoPanelLabelWidth;
  const valueWidth = infoPanelWidth - infoPanelLabelWidth;

  drawSvgText(page, fonts, "문서 정보", infoPanelX, infoPanelTitleY, 18, layout.accentFill, {
    fontWeight: 700,
  });

  drawSvgRect(
    page,
    infoPanelX,
    infoPanelY,
    infoPanelWidth,
    rows.length * infoPanelRowHeight,
    "#ffffff",
    layout.heroStroke,
    2,
  );

  rows.forEach((row, index) => {
    const y = infoPanelY + index * infoPanelRowHeight;

    drawSvgRect(
      page,
      infoPanelX,
      y,
      infoPanelLabelWidth,
      infoPanelRowHeight,
      layout.infoLabelFill,
      layout.heroStroke,
      1,
    );
    drawSvgRect(
      page,
      valueX,
      y,
      valueWidth,
      infoPanelRowHeight,
      "#ffffff",
      layout.heroStroke,
      1,
    );
    drawSvgText(page, fonts, row[0], infoPanelX + 24, y + 25, 16, "#394150", {
      fontWeight: 700,
    });
    drawSvgFittedText(
      page,
      fonts,
      row[1],
      valueX + 22,
      y + 25,
      16,
      "#2f3742",
      valueWidth - 44,
    );
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

  drawSvgText(
    page,
    fonts,
    `결재란 · ${totalCount}명`,
    panelLayout.x,
    approvalPanelTitleY,
    18,
    layout.accentFill,
    {
      fontWeight: 700,
    },
  );
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

  if (approvers.length === 0) {
    drawSvgText(
      page,
      fonts,
      "지정된 결재자가 없습니다.",
      panelLayout.x + panelLayout.width / 2,
      panelLayout.y + panelLayout.height / 2 + 8,
      16,
      "#697386",
      {
        align: "middle",
      },
    );

    return;
  }

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
    drawSvgFittedText(
      page,
      fonts,
      approver.name,
      cellCenterX,
      cellY + 78,
      17,
      "#171b22",
      columnWidth - 32,
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
    drawSvgFittedText(
      page,
      fonts,
      approver.departmentName ?? "",
      cellCenterX,
      cellY + 127,
      12,
      "#697386",
      columnWidth - 24,
      {
        align: "middle",
      },
    );
    drawSvgFittedText(
      page,
      fonts,
      approver.positionName ?? "",
      cellCenterX,
      cellY + 145,
      12,
      "#697386",
      columnWidth - 24,
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

function drawSvgFittedText(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fill: string,
  maxWidth: number,
  options: {
    align?: TextAlign;
    fontWeight?: number;
  } = {},
) {
  const fittedText = fitTextToPdfWidth(
    fonts.korean,
    text,
    svgToPdfSize(fontSize),
    svgToPdfWidth(maxWidth),
  );

  drawPdfText(
    page,
    fonts,
    fittedText,
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

function fitTextToPdfWidth(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number,
) {
  const normalizedText = text.trim() || "-";

  if (font.widthOfTextAtSize(normalizedText, fontSize) <= maxWidth) {
    return normalizedText;
  }

  const suffix = "...";

  if (font.widthOfTextAtSize(suffix, fontSize) > maxWidth) {
    return "";
  }

  let low = 0;
  let high = normalizedText.length;
  let best = "";

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const candidate = `${normalizedText.slice(0, midpoint).trimEnd()}${suffix}`;

    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      best = candidate;
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  return best || suffix;
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

function getApprovalStampPlacement(
  order: number,
  approvalStepCount: number,
  layoutKind: ApprovalPdfLayoutKind = "general",
) {
  if (layoutKind === "meeting") {
    return getMeetingMinutesStampPlacement(order, approvalStepCount);
  }

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

function getMeetingMinutesStampPlacement(
  order: number,
  approvalStepCount: number,
) {
  const size = 36;
  const stepGap = 100;
  const rightEdgeCenterX = meetingTableX + meetingTableWidth - 54;
  const centerX =
    rightEdgeCenterX - (approvalStepCount - order) * stepGap;

  return {
    x: centerX * pdfScaleX - size / 2,
    top: 118 * pdfScaleY,
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
