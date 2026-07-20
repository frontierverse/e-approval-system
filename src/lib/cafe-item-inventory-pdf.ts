import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PageSizes, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import {
  formatCafeItemDate,
  getCafeItemCategoryLabel,
  getCafeItemUsageDday,
  type CafeItemInventoryItem,
} from "@/lib/cafe-items-core";

type CafeItemInventoryPdfInput = {
  generatedAt: Date;
  items: CafeItemInventoryItem[];
  today: string;
};

type CafeItemInventoryPdfRow = {
  category: string;
  createdAt: string;
  details: string;
  expirationDate: string;
  name: string;
  price: string;
  purchasedAt: string;
  rowNumber: string;
  status: string;
  statusTone: "danger" | "held" | "neutral" | "safe" | "warning";
  updatedAt: string;
};

type CafeItemInventoryPdfColumn = {
  align?: "center" | "left" | "right";
  key: Exclude<keyof CafeItemInventoryPdfRow, "statusTone">;
  label: string;
  maxLines?: number;
  width: number;
};

const koreanFontPath = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NanumGothic-Regular.ttf",
);
const a4LandscapeSize: [number, number] = [PageSizes.A4[1], PageSizes.A4[0]];
const pageMargin = 30;
const tableTopOffset = 146;
const tableHeaderHeight = 29;
const tableFontSize = 7.2;
const tableLineHeight = 9.4;
const tableCellPaddingX = 4;
const tableCellPaddingY = 4;
const minRowHeight = 29;
const footerReservedHeight = 54;
const footerFontSize = 7.2;
const bodyTextColor = rgb(0.08, 0.1, 0.13);
const mutedTextColor = rgb(0.38, 0.42, 0.48);
const accentColor = rgb(0.08, 0.38, 0.37);
const accentBackgroundColor = rgb(0.93, 0.97, 0.97);
const headerTextColor = rgb(1, 1, 1);
const borderColor = rgb(0.8, 0.83, 0.87);
const stripeColor = rgb(0.98, 0.99, 1);
const dangerTextColor = rgb(0.62, 0.16, 0.16);
const dangerBackgroundColor = rgb(1, 0.95, 0.95);
const warningTextColor = rgb(0.47, 0.3, 0);
const warningBackgroundColor = rgb(1, 0.97, 0.88);
const safeTextColor = rgb(0.12, 0.38, 0.22);
const safeBackgroundColor = rgb(0.93, 0.98, 0.95);

const columns: CafeItemInventoryPdfColumn[] = [
  { key: "rowNumber", label: "번호", width: 28, align: "center", maxLines: 1 },
  { key: "name", label: "물품명", width: 105 },
  { key: "category", label: "종류", width: 44, align: "center", maxLines: 2 },
  { key: "status", label: "사용 상태", width: 55, align: "center", maxLines: 3 },
  { key: "purchasedAt", label: "구매일", width: 63, align: "center", maxLines: 2 },
  {
    key: "expirationDate",
    label: "유통기한",
    width: 63,
    align: "center",
    maxLines: 2,
  },
  { key: "createdAt", label: "등록일시", width: 63, align: "center", maxLines: 2 },
  { key: "updatedAt", label: "수정일시", width: 63, align: "center", maxLines: 2 },
  { key: "price", label: "가격", width: 66, align: "right", maxLines: 2 },
  { key: "details", label: "구매·보류 사유", width: 232 },
];

export async function createCafeItemInventoryPdf({
  generatedAt,
  items,
  today,
}: CafeItemInventoryPdfInput) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(koreanFontPath), {
    subset: false,
  });
  const rows = items.map((item, index) =>
    createCafeItemInventoryPdfRow(item, today, index),
  );
  const rowPages = paginateRows(font, rows);
  const pages = rowPages.length > 0 ? rowPages : [[]];
  const summary = createSummary(items, today);

  pdf.setTitle("카페 물품 전체 목록");
  pdf.setSubject("카페 물품의 구매, 유통기한, 등록, 수정 및 관리 상세 목록");
  pdf.setCreator("바자울 사내 시스템");
  pdf.setProducer("바자울 사내 시스템");
  pdf.setCreationDate(generatedAt);
  pdf.setModificationDate(generatedAt);

  pages.forEach((pageRows, pageIndex) => {
    const page = pdf.addPage(a4LandscapeSize);

    drawPage({
      font,
      generatedAt,
      page,
      pageCount: pages.length,
      pageNumber: pageIndex + 1,
      rows: pageRows,
      summary,
      today,
    });
  });

  return pdf.save();
}

function createSummary(items: CafeItemInventoryItem[], today: string) {
  let attentionCount = 0;
  let foodCount = 0;
  let heldCount = 0;

  for (const item of items) {
    const usage = getCafeItemUsageDday(item, today);

    if (item.category === "food") {
      foodCount += 1;
    }
    if (item.expirationHoldReason) {
      heldCount += 1;
    }
    if (usage.status === "expired" || usage.status === "soon") {
      attentionCount += 1;
    }
  }

  return {
    attentionCount,
    foodCount,
    heldCount,
    totalCount: items.length,
  };
}

function drawPage({
  font,
  generatedAt,
  page,
  pageCount,
  pageNumber,
  rows,
  summary,
  today,
}: {
  font: PDFFont;
  generatedAt: Date;
  page: PDFPage;
  pageCount: number;
  pageNumber: number;
  rows: CafeItemInventoryPdfRow[];
  summary: ReturnType<typeof createSummary>;
  today: string;
}) {
  const { height, width } = page.getSize();
  const tableWidth = getTableWidth();
  const tableX = (width - tableWidth) / 2;
  const tableTop = height - tableTopOffset;
  const generatedLabel = `PDF 생성 ${formatPdfDateTime(generatedAt, false)}`;
  const generatedLabelWidth = font.widthOfTextAtSize(generatedLabel, 7.4);

  page.drawRectangle({
    x: tableX,
    y: height - 37,
    width: 46,
    height: 3,
    color: accentColor,
  });
  page.drawText("CAFE INVENTORY", {
    x: tableX + 54,
    y: height - 39,
    size: 7.2,
    font,
    color: accentColor,
  });
  page.drawText(generatedLabel, {
    x: width - pageMargin - generatedLabelWidth,
    y: height - 39,
    size: 7.4,
    font,
    color: mutedTextColor,
  });
  page.drawText("카페 물품 전체 목록", {
    x: tableX,
    y: height - 72,
    size: 19,
    font,
    color: bodyTextColor,
  });
  page.drawText(
    `기준일 ${formatCafeItemDate(today)} · 등록 최신순 · ${formatCount(
      summary.totalCount,
    )}개 · ${pageNumber}/${pageCount}쪽`,
    {
      x: tableX,
      y: height - 93,
      size: 8.7,
      font,
      color: mutedTextColor,
    },
  );

  drawSummary(page, font, {
    summary,
    tableWidth,
    tableX,
    y: tableTop + 10,
  });
  drawTableHeader(page, font, tableX, tableTop);

  let cursorY = tableTop - tableHeaderHeight;

  if (rows.length === 0) {
    drawEmptyRow(page, font, tableX, cursorY, tableWidth);
  } else {
    rows.forEach((row, rowIndex) => {
      const rowHeight = getRowHeight(font, row);
      const rowY = cursorY - rowHeight;

      if (rowIndex % 2 === 1) {
        page.drawRectangle({
          x: tableX,
          y: rowY,
          width: tableWidth,
          height: rowHeight,
          color: stripeColor,
        });
      }

      drawTableRow(page, font, row, {
        rowHeight,
        x: tableX,
        y: rowY,
      });
      cursorY = rowY;
    });
  }

  drawFooter(page, font, {
    pageCount,
    pageNumber,
    tableWidth,
    tableX,
  });
}

function drawSummary(
  page: PDFPage,
  font: PDFFont,
  {
    summary,
    tableWidth,
    tableX,
    y,
  }: {
    summary: ReturnType<typeof createSummary>;
    tableWidth: number;
    tableX: number;
    y: number;
  },
) {
  const metrics = [
    ["전체 물품", `${formatCount(summary.totalCount)}개`],
    ["식품", `${formatCount(summary.foodCount)}개`],
    ["확인 필요", `${formatCount(summary.attentionCount)}개`],
    ["보류", `${formatCount(summary.heldCount)}개`],
  ] as const;
  const summaryHeight = 30;
  const metricWidth = tableWidth / metrics.length;

  page.drawRectangle({
    x: tableX,
    y,
    width: tableWidth,
    height: summaryHeight,
    color: accentBackgroundColor,
    borderColor,
    borderWidth: 0.6,
  });
  page.drawRectangle({
    x: tableX,
    y,
    width: 3,
    height: summaryHeight,
    color: accentColor,
  });

  metrics.forEach(([label, value], index) => {
    const metricX = tableX + metricWidth * index;

    if (index > 0) {
      page.drawLine({
        start: { x: metricX, y: y + 6 },
        end: { x: metricX, y: y + summaryHeight - 6 },
        thickness: 0.5,
        color: borderColor,
      });
    }

    page.drawText(label, {
      x: metricX + 14,
      y: y + 10.5,
      size: 7.7,
      font,
      color: mutedTextColor,
    });
    page.drawText(value, {
      x: metricX + 76,
      y: y + 9.5,
      size: 9.5,
      font,
      color: accentColor,
    });
  });
}

function drawTableHeader(
  page: PDFPage,
  font: PDFFont,
  tableX: number,
  tableTop: number,
) {
  const tableWidth = getTableWidth();

  page.drawRectangle({
    x: tableX,
    y: tableTop - tableHeaderHeight,
    width: tableWidth,
    height: tableHeaderHeight,
    color: accentColor,
  });

  let cellX = tableX;
  for (const column of columns) {
    drawCellBorder(page, cellX, tableTop - tableHeaderHeight, column.width, tableHeaderHeight);
    drawTextInCell(page, font, column.label, {
      align: "center",
      color: headerTextColor,
      fontSize: 7.4,
      height: tableHeaderHeight,
      lineHeight: 9.4,
      maxLines: 2,
      width: column.width,
      x: cellX,
      y: tableTop - tableHeaderHeight,
    });
    cellX += column.width;
  }
}

function drawTableRow(
  page: PDFPage,
  font: PDFFont,
  row: CafeItemInventoryPdfRow,
  {
    rowHeight,
    x,
    y,
  }: {
    rowHeight: number;
    x: number;
    y: number;
  },
) {
  let cellX = x;

  for (const column of columns) {
    const value = row[column.key];
    const isStatus = column.key === "status";
    const tone = isStatus ? getStatusTone(row.statusTone) : undefined;

    if (tone) {
      page.drawRectangle({
        x: cellX,
        y,
        width: column.width,
        height: rowHeight,
        color: tone.background,
        opacity: 0.72,
      });
    }

    drawCellBorder(page, cellX, y, column.width, rowHeight);
    drawTextInCell(page, font, value, {
      align: column.align ?? "left",
      color: tone?.text ?? bodyTextColor,
      fontSize: tableFontSize,
      height: rowHeight,
      lineHeight: tableLineHeight,
      maxLines: column.maxLines,
      width: column.width,
      x: cellX,
      y,
    });
    cellX += column.width;
  }
}

function drawEmptyRow(
  page: PDFPage,
  font: PDFFont,
  tableX: number,
  cursorY: number,
  tableWidth: number,
) {
  const rowHeight = 54;
  const y = cursorY - rowHeight;

  drawCellBorder(page, tableX, y, tableWidth, rowHeight);
  drawTextInCell(page, font, "등록된 카페 물품이 없습니다.", {
    align: "center",
    color: mutedTextColor,
    fontSize: 8.5,
    height: rowHeight,
    lineHeight: 11,
    maxLines: 1,
    width: tableWidth,
    x: tableX,
    y,
  });
}

function drawFooter(
  page: PDFPage,
  font: PDFFont,
  {
    pageCount,
    pageNumber,
    tableWidth,
    tableX,
  }: {
    pageCount: number;
    pageNumber: number;
    tableWidth: number;
    tableX: number;
  },
) {
  const footerY = pageMargin - 1;
  const pageLabel = `${pageNumber} / ${pageCount}`;
  const pageLabelWidth = font.widthOfTextAtSize(pageLabel, footerFontSize);

  page.drawLine({
    start: { x: tableX, y: footerY + 15 },
    end: { x: tableX + tableWidth, y: footerY + 15 },
    thickness: 0.5,
    color: borderColor,
  });
  page.drawText("카페 물품 전체 목록 · 사내 업무용", {
    x: tableX,
    y: footerY,
    size: footerFontSize,
    font,
    color: mutedTextColor,
  });
  page.drawText(pageLabel, {
    x: tableX + tableWidth - pageLabelWidth,
    y: footerY,
    size: footerFontSize,
    font,
    color: mutedTextColor,
  });
}

function drawCellBorder(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor,
    borderWidth: 0.5,
  });
}

function drawTextInCell(
  page: PDFPage,
  font: PDFFont,
  text: string,
  {
    align,
    color,
    fontSize,
    height,
    lineHeight,
    maxLines,
    width,
    x,
    y,
  }: {
    align: "center" | "left" | "right";
    color: ReturnType<typeof rgb>;
    fontSize: number;
    height: number;
    lineHeight: number;
    maxLines?: number;
    width: number;
    x: number;
    y: number;
  },
) {
  const textWidth = width - tableCellPaddingX * 2;
  const lines = wrapText(font, text, fontSize, textWidth, maxLines);
  const blockHeight = fontSize + Math.max(0, lines.length - 1) * lineHeight;
  let currentY = y + (height + blockHeight) / 2 - fontSize;

  for (const line of lines) {
    const lineWidth = font.widthOfTextAtSize(line, fontSize);
    const textX =
      align === "center"
        ? x + (width - lineWidth) / 2
        : align === "right"
          ? x + width - tableCellPaddingX - lineWidth
          : x + tableCellPaddingX;

    page.drawText(line, {
      x: textX,
      y: currentY,
      size: fontSize,
      font,
      color,
    });
    currentY -= lineHeight;
  }
}

function getRowHeight(font: PDFFont, row: CafeItemInventoryPdfRow) {
  const maxLineCount = Math.max(
    ...columns.map((column) =>
      wrapText(
        font,
        row[column.key],
        tableFontSize,
        column.width - tableCellPaddingX * 2,
        column.maxLines,
      ).length,
    ),
  );

  return Math.max(
    minRowHeight,
    tableFontSize + Math.max(0, maxLineCount - 1) * tableLineHeight +
      tableCellPaddingY * 2,
  );
}

function paginateRows(font: PDFFont, rows: CafeItemInventoryPdfRow[]) {
  const pageHeight = a4LandscapeSize[1];
  const tableTop = pageHeight - tableTopOffset;
  const availableHeight =
    tableTop - tableHeaderHeight - footerReservedHeight;
  const pages: CafeItemInventoryPdfRow[][] = [];
  let currentRows: CafeItemInventoryPdfRow[] = [];
  let currentHeight = 0;

  for (const row of rows) {
    const rowHeight = getRowHeight(font, row);

    if (currentRows.length > 0 && currentHeight + rowHeight > availableHeight) {
      pages.push(currentRows);
      currentRows = [];
      currentHeight = 0;
    }

    currentRows.push(row);
    currentHeight += rowHeight;
  }

  if (currentRows.length > 0) {
    pages.push(currentRows);
  }

  return pages;
}

function wrapText(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines?: number,
) {
  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    let currentLine = "";

    for (const character of Array.from(paragraph)) {
      const candidate = `${currentLine}${character}`;

      if (
        currentLine &&
        font.widthOfTextAtSize(candidate, fontSize) > maxWidth
      ) {
        lines.push(currentLine.trimEnd());
        currentLine = character.trimStart();
      } else {
        currentLine = candidate;
      }
    }

    lines.push(currentLine.trimEnd());
  }

  const normalizedLines = lines.length > 0 ? lines : [""];

  if (!maxLines || normalizedLines.length <= maxLines) {
    return normalizedLines;
  }

  return appendEllipsis(
    font,
    normalizedLines.slice(0, maxLines),
    fontSize,
    maxWidth,
  );
}

function appendEllipsis(
  font: PDFFont,
  lines: string[],
  fontSize: number,
  maxWidth: number,
) {
  const nextLines = [...lines];
  const lastIndex = nextLines.length - 1;
  let line = nextLines[lastIndex] ?? "";

  while (
    line.length > 0 &&
    font.widthOfTextAtSize(`${line}...`, fontSize) > maxWidth
  ) {
    line = line.slice(0, -1);
  }

  nextLines[lastIndex] = `${line}...`;

  return nextLines;
}

function createCafeItemInventoryPdfRow(
  item: CafeItemInventoryItem,
  today: string,
  index: number,
): CafeItemInventoryPdfRow {
  const usage = getCafeItemUsageDday(item, today);
  const isHeld = Boolean(item.expirationHoldReason);
  const statusTone = isHeld
    ? "held"
    : usage.status === "expired"
      ? "danger"
      : usage.status === "soon"
        ? "warning"
        : usage.status;

  return {
    category: getCafeItemCategoryLabel(item.category),
    createdAt: formatPdfDateTime(item.createdAt),
    details: [
      `구매 사유: ${formatDetailText(item.purchaseReason, "미입력")}`,
      `보류 사유: ${formatDetailText(
        item.expirationHoldReason,
        "해당 없음",
      )}`,
    ].join("\n"),
    expirationDate:
      item.category === "food"
        ? formatCafeItemDate(item.expirationDate)
        : "해당 없음",
    name: item.name,
    price: formatPrice(item.priceWon),
    purchasedAt: formatCafeItemDate(item.purchasedAt),
    rowNumber: String(index + 1),
    status: `${usage.label}${isHeld ? " · 보류" : ""}\n${formatUsageBasis(
      usage.basisLabel,
    )}`,
    statusTone,
    updatedAt: formatPdfDateTime(item.updatedAt),
  };
}

function getStatusTone(tone: CafeItemInventoryPdfRow["statusTone"]) {
  if (tone === "danger") {
    return { background: dangerBackgroundColor, text: dangerTextColor };
  }

  if (tone === "warning" || tone === "held") {
    return { background: warningBackgroundColor, text: warningTextColor };
  }

  if (tone === "safe") {
    return { background: safeBackgroundColor, text: safeTextColor };
  }

  return { background: stripeColor, text: mutedTextColor };
}

function getTableWidth() {
  return columns.reduce((sum, column) => sum + column.width, 0);
}

function formatUsageBasis(value: string) {
  return value.endsWith(" 기준") ? value.slice(0, -3) : value;
}

function formatPrice(value: number | null) {
  return value === null
    ? "미입력"
    : `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatDetailText(value: string | null, fallback: string) {
  return value?.replace(/\s+/g, " ").trim() || fallback;
}

function formatPdfDateTime(value: Date | string, multiline = true) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "미입력";
  }

  const parts = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const dateLabel = `${getPart("year")}.${getPart("month")}.${getPart("day")}.`;
  const timeLabel = `${getPart("hour")}:${getPart("minute")}`;

  return multiline ? `${dateLabel}\n${timeLabel}` : `${dateLabel} ${timeLabel}`;
}
