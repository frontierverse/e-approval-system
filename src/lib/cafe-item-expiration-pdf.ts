import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PageSizes, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import {
  formatCafeItemDate,
  getCafeItemUsageDday,
  type CafeItem,
} from "@/lib/cafe-items-core";

type CafeExpiringFoodsPdfInput = {
  days: number;
  items: CafeItem[];
  today: string;
};

type CafeExpiringFoodsPdfColumn = {
  align?: "center" | "right" | "left";
  key: keyof CafeExpiringFoodsPdfRow;
  label: string;
  width: number;
};

type CafeExpiringFoodsPdfRow = {
  dday: string;
  expirationDate: string;
  name: string;
  price: string;
  purchaseReason: string;
  purchasedAt: string;
  rowNumber: string;
};

const pdfKoreanFontPath = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NanumGothic-Regular.ttf",
);
const pageMargin = 34;
const titleFontSize = 17;
const subtitleFontSize = 9;
const tableFontSize = 8;
const tableLineHeight = 11;
const tableHeaderHeight = 24;
const tableCellPaddingX = 5;
const tableCellPaddingY = 5;
const minRowHeight = 28;
const footerFontSize = 8;
const bodyTextColor = rgb(0.09, 0.1, 0.13);
const mutedTextColor = rgb(0.39, 0.45, 0.53);
const borderColor = rgb(0.78, 0.82, 0.88);
const headerBackgroundColor = rgb(0.9, 0.96, 0.95);
const rowStripeColor = rgb(0.98, 0.99, 1);
const warningColor = rgb(0.49, 0.32, 0);

const columns: CafeExpiringFoodsPdfColumn[] = [
  { key: "rowNumber", label: "번호", width: 32, align: "center" },
  { key: "name", label: "물품명", width: 108 },
  { key: "purchasedAt", label: "구매일", width: 70, align: "center" },
  { key: "expirationDate", label: "유통기한", width: 76, align: "center" },
  { key: "dday", label: "남은 기간", width: 62, align: "center" },
  { key: "price", label: "가격", width: 70, align: "right" },
  { key: "purchaseReason", label: "구매 사유", width: 109 },
];

export async function createCafeExpiringFoodsPdf({
  days,
  items,
  today,
}: CafeExpiringFoodsPdfInput) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(pdfKoreanFontPath), {
    subset: false,
  });
  const rows = items.map((item, index) => createCafeExpiringFoodsPdfRow(item, today, index));
  const title = `유통기한 ${days}일 이내 식품 목록`;
  const rowPages = paginateRows(font, rows);
  const pages = rowPages.length > 0 ? rowPages : [[]];

  pages.forEach((pageRows, index) => {
    const page = pdf.addPage(PageSizes.A4);
    const pageLabel = pages.length > 1 ? ` · ${index + 1}/${pages.length}쪽` : "";

    drawCafeExpiringFoodsPage({
      font,
      page,
      pageNumber: index + 1,
      rows: pageRows,
      subtitle: `기준일 ${formatCafeItemDate(today)} · ${rows.length}개${pageLabel}`,
      title,
    });
  });

  return pdf.save();
}

function drawCafeExpiringFoodsPage({
  font,
  page,
  pageNumber,
  rows,
  subtitle,
  title,
}: {
  font: PDFFont;
  page: PDFPage;
  pageNumber: number;
  rows: CafeExpiringFoodsPdfRow[];
  subtitle: string;
  title: string;
}) {
  const { height, width } = page.getSize();
  const tableWidth = columns.reduce((total, column) => total + column.width, 0);
  const tableX = (width - tableWidth) / 2;
  const titleY = height - pageMargin - titleFontSize;
  let cursorY = height - pageMargin - 56;

  page.drawText(title, {
    x: pageMargin,
    y: titleY,
    size: titleFontSize,
    font,
    color: bodyTextColor,
  });
  page.drawText(subtitle, {
    x: pageMargin,
    y: titleY - 18,
    size: subtitleFontSize,
    font,
    color: mutedTextColor,
  });

  drawTableHeader(page, font, tableX, cursorY, tableWidth);
  cursorY -= tableHeaderHeight;

  if (rows.length === 0) {
    drawEmptyTableRow(page, font, tableX, cursorY, tableWidth);
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
          color: rowStripeColor,
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

  drawFooter(page, font, pageNumber);
}

function drawTableHeader(
  page: PDFPage,
  font: PDFFont,
  tableX: number,
  y: number,
  tableWidth: number,
) {
  page.drawRectangle({
    x: tableX,
    y: y - tableHeaderHeight,
    width: tableWidth,
    height: tableHeaderHeight,
    color: headerBackgroundColor,
  });

  let cellX = tableX;
  for (const column of columns) {
    drawCellBorder(page, cellX, y - tableHeaderHeight, column.width, tableHeaderHeight);
    drawTextInCell(page, font, column.label, {
      align: "center",
      color: bodyTextColor,
      height: tableHeaderHeight,
      width: column.width,
      x: cellX,
      y: y - tableHeaderHeight,
      maxLines: 1,
    });
    cellX += column.width;
  }
}

function drawTableRow(
  page: PDFPage,
  font: PDFFont,
  row: CafeExpiringFoodsPdfRow,
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

    drawCellBorder(page, cellX, y, column.width, rowHeight);
    drawTextInCell(page, font, value, {
      align: column.align ?? "left",
      color: column.key === "dday" ? warningColor : bodyTextColor,
      height: rowHeight,
      width: column.width,
      x: cellX,
      y,
    });
    cellX += column.width;
  }
}

function drawEmptyTableRow(
  page: PDFPage,
  font: PDFFont,
  tableX: number,
  cursorY: number,
  tableWidth: number,
) {
  const rowHeight = 56;
  const y = cursorY - rowHeight;

  drawCellBorder(page, tableX, y, tableWidth, rowHeight);
  drawTextInCell(page, font, "유통기한이 15일 이내로 남은 식품이 없습니다.", {
    align: "center",
    color: mutedTextColor,
    height: rowHeight,
    width: tableWidth,
    x: tableX,
    y,
    maxLines: 1,
  });
}

function drawFooter(page: PDFPage, font: PDFFont, pageNumber: number) {
  const { width } = page.getSize();
  const text = `${pageNumber}`;
  const textWidth = font.widthOfTextAtSize(text, footerFontSize);

  page.drawText(text, {
    x: (width - textWidth) / 2,
    y: pageMargin / 2,
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
    borderWidth: 0.6,
  });
}

function drawTextInCell(
  page: PDFPage,
  font: PDFFont,
  text: string,
  {
    align,
    color,
    height,
    maxLines,
    width,
    x,
    y,
  }: {
    align: "center" | "right" | "left";
    color: ReturnType<typeof rgb>;
    height: number;
    maxLines?: number;
    width: number;
    x: number;
    y: number;
  },
) {
  const textWidth = width - tableCellPaddingX * 2;
  const lines = wrapText(font, text, tableFontSize, textWidth, maxLines ?? 3);
  const blockHeight = lines.length * tableLineHeight;
  const startY = y + height - tableCellPaddingY - tableFontSize;
  const adjustedStartY =
    blockHeight + tableCellPaddingY * 2 < height
      ? y + (height + blockHeight) / 2 - tableFontSize
      : startY;

  lines.forEach((line, lineIndex) => {
    const lineWidth = font.widthOfTextAtSize(line, tableFontSize);
    const textX =
      align === "center"
        ? x + (width - lineWidth) / 2
        : align === "right"
          ? x + width - tableCellPaddingX - lineWidth
          : x + tableCellPaddingX;

    page.drawText(line, {
      x: textX,
      y: adjustedStartY - lineIndex * tableLineHeight,
      size: tableFontSize,
      font,
      color,
    });
  });
}

function getRowHeight(font: PDFFont, row: CafeExpiringFoodsPdfRow) {
  const maxLineCount = Math.max(
    ...columns.map((column) => {
      const textWidth = column.width - tableCellPaddingX * 2;
      return wrapText(font, row[column.key], tableFontSize, textWidth, 3).length;
    }),
  );

  return Math.max(
    minRowHeight,
    maxLineCount * tableLineHeight + tableCellPaddingY * 2,
  );
}

function paginateRows(font: PDFFont, rows: CafeExpiringFoodsPdfRow[]) {
  const [, pageHeight] = PageSizes.A4;
  const tableTop = pageHeight - pageMargin - 56;
  const availableHeight =
    tableTop - tableHeaderHeight - (pageMargin + footerFontSize + 12);
  const pages: CafeExpiringFoodsPdfRow[][] = [];
  let currentRows: CafeExpiringFoodsPdfRow[] = [];
  let currentHeight = 0;

  for (const row of rows) {
    const rowHeight = getRowHeight(font, row);

    if (
      currentRows.length > 0 &&
      currentHeight + rowHeight > availableHeight
    ) {
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
  maxLines: number,
) {
  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    let currentLine = "";

    for (const token of Array.from(paragraph)) {
      const nextLine = currentLine ? `${currentLine}${token}` : token;

      if (
        currentLine &&
        font.widthOfTextAtSize(nextLine, fontSize) > maxWidth
      ) {
        lines.push(currentLine);
        currentLine = token;
      } else {
        currentLine = nextLine;
      }

      if (lines.length >= maxLines) {
        return appendEllipsis(font, lines, fontSize, maxWidth);
      }
    }

    lines.push(currentLine);

    if (lines.length >= maxLines) {
      return appendEllipsis(font, lines, fontSize, maxWidth);
    }
  }

  return lines.length > 0 ? lines : [""];
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

function createCafeExpiringFoodsPdfRow(
  item: CafeItem,
  today: string,
  index: number,
): CafeExpiringFoodsPdfRow {
  return {
    dday: getCafeItemUsageDday(item, today).label,
    expirationDate: formatCafeItemDate(item.expirationDate),
    name: item.name,
    price: formatPrice(item.priceWon),
    purchaseReason: item.purchaseReason || "미입력",
    purchasedAt: formatCafeItemDate(item.purchasedAt),
    rowNumber: String(index + 1),
  };
}

function formatPrice(value: number | null) {
  if (value === null) {
    return "미입력";
  }

  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}
