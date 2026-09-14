import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFPage, grayscale, rgb } from "pdf-lib";
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
  getDocumentTemplateDisplayRows,
  type DocumentTemplateDisplayRow,
} from "@/lib/draft-template-content";
import { prisma } from "@/lib/prisma";
import {
  generatedApprovalPdfStorageSegment,
  findCurrentGeneratedApprovalPdfAttachment,
  syncGeneratedApprovalPdf,
} from "@/lib/generated-approval-pdf-attachments";
import {
  approvalPdfInk,
  approvalPdfPaper,
  getApprovalPdfLayout,
  type ApprovalPdfLayout,
  type ApprovalPdfLayoutKind,
} from "@/lib/generated-approval-pdf-layout";
import {
  ApprovalStepStatus,
  AuditAction,
  DocumentStatus,
  Prisma,
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

type SharpConstructor = (typeof import("sharp"))["default"];
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
const headerMetaValueX = 1122;
const headerMetaValueWidth = 260;
const infoPanelX = 118;
const infoPanelY = 288;
const infoPanelWidth = 560;
const infoPanelLabelWidth = 132;
const infoPanelRowHeight = 38;
const infoPanelTitleY = infoPanelY - 14;
const approvalPanelX = 718;
const approvalPanelY = infoPanelY;
const approvalPanelWidth = 404;
const approvalPanelRowHeight = 174;
const approvalPanelTitleY = infoPanelTitleY;
const documentTitleMaxWidth = 1004;
const documentTitleY = 158;
const documentTitleFontSize = 30;
const documentTitleLineHeight = 34;
const documentTitleMaxLines = 3;
const bodyTextFontSize = 16;
const bodyTextLineHeight = 30;
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
const continuationTableY = 256;
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
const meetingBorderColor = approvalPdfInk;
const meetingTitleY = 170;
const meetingFirstTableY = 250;
const meetingContinuationTableY = 96;
const meetingTableMaxBottomY = 1666;
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
  return syncGeneratedApprovalPdf(documentId, actorId, createGeneratedApprovalPdfFile);
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
      updatedAt: true,
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
          decisionType: true,
          proxyApprovedBy: {
            select: { name: true, signatureImageStorageProvider: true, signatureImageStorageKey: true },
          },
          actedBy: {
            select: { name: true, signatureImageStorageProvider: true, signatureImageStorageKey: true },
          },
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
    { id: document.id },
    actorId,
  );
  const originalName = createStampedApprovalPdfOriginalName(
    document.documentNo,
    document.title,
    document.status,
  );
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
  const auditRequestData = await getCurrentAuditLogRequestData();

  try {
    await persistAttachmentFiles([file]);

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "ApprovalDocument" WHERE "id" = ${documentId} FOR UPDATE
      `);
      const latestDocument = await tx.approvalDocument.findUnique({
        where: { id: documentId },
        select: { updatedAt: true },
      });
      const latestSource = await findCurrentGeneratedApprovalPdfAttachment(tx, documentId);
      if (latestSource?.id !== sourceAttachment.id ||
          latestSource.storageKey !== sourceAttachment.storageKey ||
          latestDocument?.updatedAt.getTime() !== document.updatedAt.getTime()) {
        throw new Error("결재본 PDF 생성 중 문서가 변경되었습니다. 최신 문서로 다시 시도하세요.");
      }
      const existingAttachment = await findStampedApprovalPdfAttachment(tx, {
        documentId,
        sourceAttachmentId: sourceAttachment.id,
      });
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
            stampActors: stamps.map((stamp) => ({ order: stamp.order, name: stamp.source.name, isProxy: Boolean(stamp.source.isProxy) })),
            generatedApprovalPdfType:
              document.status === DocumentStatus.APPROVED
                ? "FINAL_APPROVED"
                : "IN_PROGRESS",
            replacedAttachmentId: existingAttachment?.id ?? null,
          },
        },
      });

      return { attachment, previousFile: existingAttachment };
    });

    if (result.previousFile) {
      await removeStoredAttachmentFiles([result.previousFile]).catch(() => undefined);
    }

    return result.attachment;
  } catch (error) {
    await removeStoredAttachmentFiles([file]).catch(() => undefined);
    throw error;
  }
}

export const attachFinalApprovedApprovalPdfToDocument =
  attachStampedApprovalPdfToDocument;

async function findStampedApprovalPdfAttachment(db: Prisma.TransactionClient, {
  documentId,
  sourceAttachmentId,
}: {
  documentId: string;
  sourceAttachmentId: string;
}) {
  const logs = await db.auditLog.findMany({
    where: {
      documentId,
      action: AuditAction.UPDATE_DRAFT,
      targetType: "Attachment",
      OR: [
        { metadata: { path: ["generatedApprovalPdfType"], equals: "IN_PROGRESS" } },
        { metadata: { path: ["generatedApprovalPdfType"], equals: "FINAL_APPROVED" } },
        { message: "결재본 PDF를 자동 갱신했습니다." },
        { message: "최종 승인본 PDF를 자동 생성했습니다." },
      ],
    },
    select: { targetId: true },
  });
  return db.attachment.findFirst({
    where: {
      documentId,
      signedSourceAttachmentId: sourceAttachmentId,
      NOT: { originalName: { contains: "[효력 취소]" } },
      id: { in: logs.map((log) => log.targetId) },
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
    const originalPlacement = getApprovalStampPlacement(
      stamp.order,
      approvalStepCount,
      layoutKind,
    );
    const placement = stamp.source.isProxy ? {
      ...originalPlacement, x: originalPlacement.x + 4, size: originalPlacement.size - 8,
    } : originalPlacement;
    if (stamp.source.isProxy) {
      const label = `대리 · ${stamp.source.name}`;
      const labelWidth = layoutKind === "meeting" ? 43
        : approvalPanelWidth * pdfScaleX / getVisibleApprovalColumnCount(approvalStepCount) - 4;
      const fontSize = Math.min(6, labelWidth / Math.max(1, fonts.korean.widthOfTextAtSize(label, 1)));
      drawPdfText(page, fonts, label, originalPlacement.x + originalPlacement.size / 2,
        page.getHeight() - originalPlacement.top - originalPlacement.size + 1,
        fontSize, approvalPdfInk, { align: "middle", fontWeight: 700 });
    }

    if (
      stamp.source.signatureImageStorageProvider &&
      stamp.source.signatureImageStorageKey
    ) {
      const imageBuffer = await getApprovalStampImageBuffer(stamp.source);
      const embeddedStamp = await embedApprovalStampImage(pdf, imageBuffer);
      const scale = Math.min(
        placement.size / embeddedStamp.width,
        placement.size / embeddedStamp.height,
      );
      const width = embeddedStamp.width * scale;
      const height = embeddedStamp.height * scale;
      const y = page.getHeight() - placement.top - (placement.size + height) / 2;

      page.drawImage(embeddedStamp.image, {
        x: placement.x + (placement.size - width) / 2,
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

/** Served derivative only: retained evidence bytes in storage are never altered. */
export async function markInvalidApprovalPdf(sourceBuffer: Buffer) {
  const pdf = await PDFDocument.load(sourceBuffer);
  const fonts = await embedApprovalPdfFonts(pdf);
  for (const page of pdf.getPages()) {
    const width = page.getWidth();
    const height = page.getHeight();
    page.drawRectangle({ x: 0, y: height - 33, width, height: 33, color: hexColor("#ffffff") });
    drawPdfText(page, fonts, "효력 취소 · 이전 결재 이력", width / 2, height - 21, 13,
      approvalPdfInk, { align: "middle", fontWeight: 800 });
    // Center label remains visible if the top margin is cropped during printing.
    const label = "효력 취소";
    drawPdfText(page, fonts, label, width / 2, height / 2, Math.min(48, width / 7),
      approvalPdfInk, { align: "middle", fontWeight: 800, opacity: 0.24 });
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
  const titleLines = wrapSvgTextLines(
    fonts, input.title, documentTitleFontSize,
    documentTitleMaxWidth, documentTitleMaxLines,
  );
  const infoBottom = infoPanelY + infoPanelRowHeight * 4;
  const bodyTop = Math.max(infoBottom, getApprovalPanelBottomY(input.approvers.length)) + 48;
  const templateDisplayRows = input.templateSchema
    ? getDocumentTemplateDisplayRows(input.templateSchema, input.content)
    : [];

  drawSvgText(page, fonts, "사회적협동조합 청소년자립학교", 118, 108, 17, approvalPdfInk);
  // A document whose title is already its form name needs no second form label.
  if (input.title.replace(/\s+/g, "") !== input.templateName.replace(/\s+/g, "")) {
    drawSvgFittedText(page, fonts, input.templateName, 1122, 108, 19, approvalPdfInk, 460, {
      align: "end",
      fontWeight: 700,
    });
  }
  drawSvgMultilineText(page, fonts, titleLines, 118, documentTitleY,
    documentTitleFontSize, documentTitleLineHeight, approvalPdfInk, 700);
  drawSvgLine(page, 118, 250, 1122, 250, approvalPdfInk, 1);

  drawInfoPanel(page, fonts, input, documentNo, issuedAt, layout);
  drawApprovalPanel(page, fonts, input.approvers, input.approvers.length, layout);

  if (templateDisplayRows.length > 0) {
    drawDocumentTemplateTablePages(
      pdf, page, fonts, templateDisplayRows, layout, bodyTop, 1548, input, documentNo,
    );
  } else {
    drawTextBodyPages(pdf, page, fonts, input, layout, bodyTop, documentNo);
  }

  for (const [index, documentPage] of pdf.getPages().entries()) {
    drawApprovalDocumentFooter(documentPage, fonts, index + 1, pdf.getPageCount());
  }
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
      approvalPdfPaper,
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
      approvalPdfPaper,
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
      approvalPdfInk,
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
    approvalPdfPaper,
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
    approvalPdfPaper,
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
      approvalPdfInk,
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

function drawTextBodyPages(
  pdf: PDFDocument,
  firstPage: PDFPage,
  fonts: ApprovalPdfFonts,
  input: ApprovalPdfInput,
  layout: ApprovalPdfLayout,
  bodyTop: number,
  documentNo: string,
) {
  const lines = wrapSvgTextLines(fonts, input.content, bodyTextFontSize, 1004, Number.MAX_SAFE_INTEGER);
  let page = firstPage;
  let top = bodyTop;
  let lineIndex = 0;

  drawSvgText(page, fonts, layout.bodyTitle, 118, top, 19, approvalPdfInk, { fontWeight: 700 });
  top += 44;
  while (lineIndex < lines.length) {
    const capacity = Math.max(0, Math.floor((1548 - top) / bodyTextLineHeight) + 1);
    if (capacity > 0) {
      const pageLines = lines.slice(lineIndex, lineIndex + capacity);
      drawSvgMultilineText(page, fonts, pageLines, 118, top,
        bodyTextFontSize, bodyTextLineHeight, approvalPdfInk);
      lineIndex += pageLines.length;
    }
    if (lineIndex < lines.length) {
      page = pdf.addPage([pageWidth, pageHeight]);
      drawApprovalDocumentContinuationPageFrame(page, fonts, input, documentNo);
      top = continuationTableY;
    }
  }
}

function drawDocumentTemplateTablePages(
  pdf: PDFDocument,
  firstPage: PDFPage,
  fonts: ApprovalPdfFonts,
  rows: DocumentTemplateDisplayRow[],
  layout: ApprovalPdfLayout,
  tableY: number,
  firstPageMaxBottomY: number,
  input: ApprovalPdfInput,
  documentNo: string,
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
    tableY,
  );

  sections.slice(1).forEach((section) => {
    const page = pdf.addPage([pageWidth, pageHeight]);
    drawApprovalDocumentContinuationPageFrame(page, fonts, input, documentNo);
    drawDocumentTemplateTableSection(
      page,
      fonts,
      section.rows,
      layout,
      continuationTableY,
    );
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
  tableY: number,
) {
  const lastRowLayout = rowLayouts.at(-1);
  const tableBottomY = lastRowLayout
    ? lastRowLayout.y + lastRowLayout.height
    : tableY;

  if (rowLayouts.length === 0) {
    drawSvgRect(
      page,
      templateTableX,
      tableY,
      templateTableWidth,
      templateTableMinRowHeight,
      approvalPdfPaper,
      approvalPdfInk,
      2,
    );
    drawSvgText(page, fonts, "-", 150, tableY + 38, 15, approvalPdfInk);

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
    approvalPdfPaper,
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
    approvalPdfInk,
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
    approvalPdfInk,
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
  documentNo: string,
) {
  // Keep only the identity needed to match a loose continuation sheet.
  drawSvgText(page, fonts, "문서번호", headerMetaLabelX, 108, 13, approvalPdfInk, { fontWeight: 700 });
  drawSvgFittedText(page, fonts, documentNo, headerMetaValueX, 108, 17,
    approvalPdfInk, headerMetaValueWidth, { align: "end", fontWeight: 700 });
  const titleLines = wrapSvgTextLines(fonts, input.title, 22, 1004, 3);
  drawSvgMultilineText(page, fonts, titleLines, 118, 158, 22, 28, approvalPdfInk, 700);
  drawSvgLine(page, 118, 230, 1122, 230, approvalPdfInk, 1);
}

function drawApprovalDocumentFooter(
  page: PDFPage,
  fonts: ApprovalPdfFonts,
  pageNumber: number,
  pageCount: number,
) {
  drawSvgText(page, fonts, `${pageNumber} / ${pageCount}`, 620, 1642, 14,
    approvalPdfInk, { align: "middle" });
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
    approvalPdfPaper,
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
      approvalPdfPaper,
      layout.heroStroke,
      1,
    );
    drawSvgText(page, fonts, row[0], infoPanelX + 24, y + 25, 16, approvalPdfInk, {
      fontWeight: 700,
    });
    drawSvgFittedText(
      page,
      fonts,
      row[1],
      valueX + 22,
      y + 25,
      16,
      approvalPdfInk,
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
    "결재",
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
    approvalPdfPaper,
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
      approvalPdfInk,
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
    const nameWidth = columnWidth - 16;
    const measuredNameWidth = fonts.korean.widthOfTextAtSize(approver.name, svgToPdfSize(17));
    const nameFontSize = Math.max(12, Math.min(17,
      17 * svgToPdfWidth(nameWidth - 2) / Math.max(1, measuredNameWidth),
    ));

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
      approvalPdfInk,
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
      approvalPdfPaper,
      layout.heroStroke,
      1,
    );
    drawSvgRect(
      page,
      cellX,
      cellY + 106,
      columnWidth,
      panelLayout.rowHeight - 106,
      approvalPdfPaper,
      layout.heroStroke,
      1,
    );
    // Keep identity below the reserved stamp area so approval ink never
    // overprints the approver name on the stamped copy.
    drawSvgFittedText(
      page,
      fonts,
      approver.name,
      cellCenterX,
      cellY + 126,
      nameFontSize,
      approvalPdfInk,
      nameWidth,
      {
        align: "middle",
        fontWeight: 700,
      },
    );
    drawSvgFittedText(
      page,
      fonts,
      approver.departmentName ?? "",
      cellCenterX,
      cellY + 146,
      12,
      approvalPdfInk,
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
      cellY + 164,
      12,
      approvalPdfInk,
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

  const red = ((color >> 16) & 255) / 255;
  const green = ((color >> 8) & 255) / 255;
  const blue = (color & 255) / 255;

  // DeviceGray avoids asking printers to compose neutral text from color inks.
  return red === green && green === blue
    ? grayscale(red)
    : rgb(red, green, blue);
}

async function ensureGeneratedApprovalPdfAttachment(
  document: { id: string },
  actorId: string,
) {
  return attachGeneratedApprovalPdfToDocument(document.id, actorId);
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
  const maxStampSize = Math.min(columnWidth * scaleX, 72 * scaleY) - 8;
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
  const ink = hexColor(approvalPdfInk);
  const safeName = name.trim().slice(0, 5) || "승인";

  page.drawCircle({
    x: centerX,
    y: centerY,
    size: placement.size / 2,
    borderColor: ink,
    borderWidth: placement.size * 0.065,
    borderOpacity: 0.92,
  });
  page.drawCircle({
    x: centerX,
    y: centerY,
    size: placement.size * 0.4,
    borderColor: ink,
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
    approvalPdfInk,
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
    approvalPdfInk,
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

async function getSharp(): Promise<SharpConstructor> {
  const sharpModule = await import("sharp");

  return sharpModule.default;
}
