import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PageSizes, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import {
  getLunchBoxCountTotal,
  getLunchBoxSchoolTypeLabel,
  isLunchBoxDate,
  parseLunchBoxDateValue,
  type LunchBoxCountGrid,
  type LunchBoxCountRow,
} from "@/lib/lunch-box-counts-core";

type LunchBoxCountPdfInput = {
  generatedAt: Date;
  grid: LunchBoxCountGrid;
};

type LunchBoxCountPdfRow = {
  class1Count: number;
  class2Count: number;
  class3Count: number;
  class4Count: number;
  linkedCount: number;
  rowNumber: number;
  schoolName: string;
  schoolType: string;
  total: number;
};

type LunchBoxCountPdfColumn = {
  align: "center" | "left" | "right";
  key: keyof LunchBoxCountPdfRow;
  label: string;
  width: number;
};

const koreanFontPath = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NanumGothic-Regular.ttf",
);
const pageMargin = 34;
const titleFontSize = 20;
const dateFontSize = 11;
const generatedAtFontSize = 7.5;
const summaryHeight = 30;
const summaryFontSize = 8.5;
const summaryValueFontSize = 10;
const tableTopOffset = 144;
const tableHeaderHeight = 28;
const tableFontSize = 8.5;
const tableLineHeight = 10.5;
const tableCellPaddingX = 5;
const tableCellPaddingY = 5;
const minRowHeight = 24;
const footerFontSize = 7.5;
const footerReservedHeight = 52;
const bodyTextColor = rgb(0.09, 0.11, 0.14);
const mutedTextColor = rgb(0.38, 0.42, 0.48);
const accentColor = rgb(0.1, 0.42, 0.41);
const accentBackgroundColor = rgb(0.94, 0.98, 0.97);
const summaryBackgroundColor = rgb(0.975, 0.985, 0.985);
const borderColor = rgb(0.81, 0.84, 0.87);
const stripeColor = rgb(0.985, 0.99, 0.995);

const columns: LunchBoxCountPdfColumn[] = [
  { key: "rowNumber", label: "번호", width: 28, align: "center" },
  { key: "schoolName", label: "학교명", width: 169, align: "left" },
  { key: "schoolType", label: "구분", width: 60, align: "center" },
  { key: "class1Count", label: "1반", width: 40, align: "center" },
  { key: "class2Count", label: "2반", width: 40, align: "center" },
  { key: "class3Count", label: "3반", width: 40, align: "center" },
  { key: "class4Count", label: "4반", width: 40, align: "center" },
  { key: "linkedCount", label: "연계형", width: 40, align: "center" },
  { key: "total", label: "합계", width: 50, align: "center" },
];

export async function createLunchBoxCountPdf({
  generatedAt,
  grid,
}: LunchBoxCountPdfInput) {
  if (!isLunchBoxDate(grid.date)) {
    throw new Error("도시락 인쇄 날짜가 올바르지 않습니다.");
  }

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(koreanFontPath), {
    subset: false,
  });
  const rows = createPrintableRows(grid.rows);
  const totalCount = rows.reduce((sum, row) => sum + row.total, 0);
  const rowPages = paginateRows(font, rows);
  const pages = rowPages.length > 0 ? rowPages : [[]];

  pdf.setTitle(`${formatDeliveryDate(grid.date)} 도시락 납품 현황`);
  pdf.setSubject("학교별 도시락 납품 개수");
  pdf.setCreator("바자울 사내 시스템");
  pdf.setProducer("바자울 사내 시스템");
  pdf.setCreationDate(generatedAt);
  pdf.setModificationDate(generatedAt);

  pages.forEach((pageRows, pageIndex) => {
    const page = pdf.addPage(PageSizes.A4);

    drawPage({
      date: grid.date,
      font,
      generatedAt,
      page,
      pageCount: pages.length,
      pageNumber: pageIndex + 1,
      rows: pageRows,
      schoolCount: rows.length,
      totalCount,
    });
  });

  return pdf.save();
}

function createPrintableRows(rows: LunchBoxCountRow[]) {
  const printableRows: LunchBoxCountPdfRow[] = [];

  for (const row of rows) {
    const total = getLunchBoxCountTotal(row);

    if (total < 1) {
      continue;
    }

    printableRows.push({
      class1Count: row.class1Count,
      class2Count: row.class2Count,
      class3Count: row.class3Count,
      class4Count: row.class4Count,
      linkedCount: row.linkedCount,
      rowNumber: printableRows.length + 1,
      schoolName: row.schoolName,
      schoolType: getLunchBoxSchoolTypeLabel(row.schoolType),
      total,
    });
  }

  return printableRows;
}

function drawPage({
  date,
  font,
  generatedAt,
  page,
  pageCount,
  pageNumber,
  rows,
  schoolCount,
  totalCount,
}: {
  date: string;
  font: PDFFont;
  generatedAt: Date;
  page: PDFPage;
  pageCount: number;
  pageNumber: number;
  rows: LunchBoxCountPdfRow[];
  schoolCount: number;
  totalCount: number;
}) {
  const { height, width } = page.getSize();
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const tableX = (width - tableWidth) / 2;
  const tableTop = height - tableTopOffset;
  const generatedLabel = `PDF 생성 ${formatGeneratedAt(generatedAt)}`;
  const generatedLabelWidth = font.widthOfTextAtSize(
    generatedLabel,
    generatedAtFontSize,
  );

  page.drawRectangle({
    x: tableX,
    y: height - 38,
    width: 42,
    height: 3,
    color: accentColor,
  });
  page.drawText(generatedLabel, {
    x: width - pageMargin - generatedLabelWidth,
    y: height - 38,
    size: generatedAtFontSize,
    font,
    color: mutedTextColor,
  });
  page.drawText("도시락 납품 현황", {
    x: tableX,
    y: height - 72,
    size: titleFontSize,
    font,
    color: bodyTextColor,
  });
  page.drawText(formatDeliveryDate(date), {
    x: tableX,
    y: height - 94,
    size: dateFontSize,
    font,
    color: accentColor,
  });

  drawSummary(page, font, {
    schoolCount,
    tableWidth,
    tableX,
    totalCount,
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
    tableX,
    tableWidth,
  });
}

function drawSummary(
  page: PDFPage,
  font: PDFFont,
  {
    schoolCount,
    tableWidth,
    tableX,
    totalCount,
    y,
  }: {
    schoolCount: number;
    tableWidth: number;
    tableX: number;
    totalCount: number;
    y: number;
  },
) {
  const dividerX = tableX + tableWidth / 2;

  page.drawRectangle({
    x: tableX,
    y,
    width: tableWidth,
    height: summaryHeight,
    color: summaryBackgroundColor,
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
  page.drawLine({
    start: { x: dividerX, y: y + 6 },
    end: { x: dividerX, y: y + summaryHeight - 6 },
    thickness: 0.6,
    color: borderColor,
  });

  drawSummaryMetric(page, font, {
    label: "납품 학교",
    value: `${formatCount(schoolCount)}곳`,
    x: tableX + 16,
    y,
  });
  drawSummaryMetric(page, font, {
    label: "총 도시락",
    value: `${formatCount(totalCount)}개`,
    x: dividerX + 16,
    y,
  });
}

function drawSummaryMetric(
  page: PDFPage,
  font: PDFFont,
  {
    label,
    value,
    x,
    y,
  }: {
    label: string;
    value: string;
    x: number;
    y: number;
  },
) {
  page.drawText(label, {
    x,
    y: y + 10.5,
    size: summaryFontSize,
    font,
    color: mutedTextColor,
  });
  page.drawText(value, {
    x: x + 62,
    y: y + 9.5,
    size: summaryValueFontSize,
    font,
    color: accentColor,
  });
}

function drawTableHeader(
  page: PDFPage,
  font: PDFFont,
  tableX: number,
  tableTop: number,
) {
  let cellX = tableX;

  for (const column of columns) {
    page.drawRectangle({
      x: cellX,
      y: tableTop - tableHeaderHeight,
      width: column.width,
      height: tableHeaderHeight,
      color: accentBackgroundColor,
      borderColor,
      borderWidth: 0.6,
    });
    drawCellText(page, font, column.label, {
      align: "center",
      color: bodyTextColor,
      height: tableHeaderHeight,
      maxLines: 1,
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
  row: LunchBoxCountPdfRow,
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
    const value = formatCellValue(row[column.key], column.key);

    page.drawRectangle({
      x: cellX,
      y,
      width: column.width,
      height: rowHeight,
      borderColor,
      borderWidth: 0.6,
    });
    drawCellText(page, font, value, {
      align: column.align,
      color:
        column.key === "total"
          ? accentColor
          : value === "-"
            ? mutedTextColor
            : bodyTextColor,
      height: rowHeight,
      maxLines: column.key === "schoolName" ? 2 : 1,
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
  const rowHeight = 58;
  const y = cursorY - rowHeight;

  page.drawRectangle({
    x: tableX,
    y,
    width: tableWidth,
    height: rowHeight,
    borderColor,
    borderWidth: 0.6,
  });
  drawCellText(
    page,
    font,
    "해당 날짜에 도시락 납품 내역이 없습니다.",
    {
      align: "center",
      color: mutedTextColor,
      height: rowHeight,
      maxLines: 1,
      width: tableWidth,
      x: tableX,
      y,
    },
  );
}

function drawFooter(
  page: PDFPage,
  font: PDFFont,
  {
    pageCount,
    pageNumber,
    tableX,
    tableWidth,
  }: {
    pageCount: number;
    pageNumber: number;
    tableX: number;
    tableWidth: number;
  },
) {
  const note = "합계 1개 이상인 학교만 표시";
  const pageLabel = `${pageNumber} / ${pageCount}`;
  const pageLabelWidth = font.widthOfTextAtSize(pageLabel, footerFontSize);

  page.drawText(note, {
    x: tableX,
    y: pageMargin / 2,
    size: footerFontSize,
    font,
    color: mutedTextColor,
  });
  page.drawText(pageLabel, {
    x: tableX + tableWidth - pageLabelWidth,
    y: pageMargin / 2,
    size: footerFontSize,
    font,
    color: mutedTextColor,
  });
}

function drawCellText(
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
    align: "center" | "left" | "right";
    color: ReturnType<typeof rgb>;
    height: number;
    maxLines: number;
    width: number;
    x: number;
    y: number;
  },
) {
  const lines = wrapText(
    font,
    text,
    tableFontSize,
    width - tableCellPaddingX * 2,
    maxLines,
  );
  const blockHeight = lines.length * tableLineHeight;
  const startY = y + (height + blockHeight) / 2 - tableFontSize;

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
      y: startY - lineIndex * tableLineHeight,
      size: tableFontSize,
      font,
      color,
    });
  });
}

function getRowHeight(font: PDFFont, row: LunchBoxCountPdfRow) {
  const schoolLineCount = wrapText(
    font,
    row.schoolName,
    tableFontSize,
    columns[1].width - tableCellPaddingX * 2,
    2,
  ).length;

  return Math.max(
    minRowHeight,
    schoolLineCount * tableLineHeight + tableCellPaddingY * 2,
  );
}

function paginateRows(font: PDFFont, rows: LunchBoxCountPdfRow[]) {
  const [, pageHeight] = PageSizes.A4;
  const tableTop = pageHeight - tableTopOffset;
  const availableHeight =
    tableTop - tableHeaderHeight - footerReservedHeight;
  const pages: LunchBoxCountPdfRow[][] = [];
  let currentRows: LunchBoxCountPdfRow[] = [];
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
  let currentLine = "";

  for (const character of Array.from(text)) {
    const nextLine = `${currentLine}${character}`;

    if (
      currentLine &&
      font.widthOfTextAtSize(nextLine, fontSize) > maxWidth
    ) {
      lines.push(currentLine);
      currentLine = character;
    } else {
      currentLine = nextLine;
    }

    if (lines.length >= maxLines) {
      return appendEllipsis(font, lines, fontSize, maxWidth);
    }
  }

  if (currentLine || lines.length === 0) {
    lines.push(currentLine);
  }

  return lines.length > maxLines
    ? appendEllipsis(font, lines.slice(0, maxLines), fontSize, maxWidth)
    : lines;
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

function formatCellValue(
  value: LunchBoxCountPdfRow[keyof LunchBoxCountPdfRow],
  key: keyof LunchBoxCountPdfRow,
) {
  if (typeof value === "number") {
    if (
      key !== "rowNumber" &&
      key !== "total" &&
      value === 0
    ) {
      return "-";
    }

    return formatCount(value);
  }

  return value;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatDeliveryDate(value: string) {
  const [year, month, day] = value.split("-");
  const weekdayLabels = [
    "일요일",
    "월요일",
    "화요일",
    "수요일",
    "목요일",
    "금요일",
    "토요일",
  ];
  const weekday = weekdayLabels[parseLunchBoxDateValue(value).getUTCDay()];

  return `${year}년 ${Number(month)}월 ${Number(day)}일 (${weekday})`;
}

function formatGeneratedAt(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = values.hour === "24" ? "00" : values.hour;

  return `${values.year}.${values.month}.${values.day}. ${hour}:${values.minute}`;
}
