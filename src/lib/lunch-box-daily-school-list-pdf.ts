import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PageSizes,
  type PDFFont,
  type PDFPage,
  rgb,
} from "pdf-lib";
import {
  createLunchBoxDailyChecklistView,
  getLunchBoxCountTotal,
  isLunchBoxDate,
  lunchBoxDailyChecklistShortFieldLabels,
  type LunchBoxCountRow,
  type LunchBoxDailyChecklistView,
  type LunchBoxDailySchoolChecklistData,
  type LunchBoxServingCountField,
} from "@/lib/lunch-box-counts-core";

type LunchBoxDailySchoolListPdfInput = {
  checklist: LunchBoxDailySchoolChecklistData;
  generatedAt: Date;
};

type TableColumnKey =
  | "check"
  | "schoolName"
  | "preservation"
  | LunchBoxServingCountField
  | "deliveryDriverCount"
  | "total";

type TableColumn = {
  align: "left" | "right";
  key: TableColumnKey;
  label: string;
  width: number;
};

const koreanFontPath = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NanumGothic-Regular.ttf",
);
const landscapeA4: [number, number] = [PageSizes.A4[1], PageSizes.A4[0]];
const pageMarginX = 24;
const pageBottom = 28;
const tableGap = 10;
const tableTopOffset = 72;
const tableHeaderHeight = 20;
const bodyFontSize = 7.2;
const headerFontSize = 6.7;
const bodyLineHeight = 8.8;
const minRowHeight = 20;
const cellPaddingX = 3;
const cellPaddingY = 2.2;
const titleFontSize = 14.5;
const summaryFontSize = 8.5;
const pageNumberFontSize = 7;
const bodyTextColor = rgb(0.09, 0.1, 0.12);
const mutedTextColor = rgb(0.41, 0.45, 0.51);
const accentColor = rgb(0.06, 0.33, 0.32);
const checkedRowColor = rgb(0.91, 0.96, 0.93);
const borderColor = rgb(0.89, 0.91, 0.94);
const strongBorderColor = rgb(0.81, 0.84, 0.88);

export async function createLunchBoxDailySchoolListPdf({
  checklist,
  generatedAt,
}: LunchBoxDailySchoolListPdfInput) {
  if (!isLunchBoxDate(checklist.grid.date)) {
    throw new Error("날짜별 학교 목록 인쇄 날짜가 올바르지 않습니다.");
  }

  const view = createLunchBoxDailyChecklistView(checklist);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(koreanFontPath), {
    subset: false,
  });
  const tableWidth = getTableWidth();
  const tableColumns = createTableColumns(tableWidth, view);
  const pageColumns =
    view.rows.length === 0
      ? [[[]]]
      : paginateColumns(font, view.columns, tableColumns);

  pdf.setTitle(`${view.dateLabel} 날짜별 학교 목록`);
  pdf.setSubject("선택한 날짜의 학교별 도시락 수량과 준비 완료 체크 목록");
  pdf.setCreator("바자울 사내 시스템");
  pdf.setProducer("바자울 사내 시스템");
  pdf.setCreationDate(generatedAt);
  pdf.setModificationDate(generatedAt);

  pageColumns.forEach((columns, pageIndex) => {
    const page = pdf.addPage(landscapeA4);

    drawPage({
      columns,
      font,
      page,
      pageCount: pageColumns.length,
      pageNumber: pageIndex + 1,
      tableColumns,
      tableWidth,
      view,
    });
  });

  return pdf.save();
}

function drawPage({
  columns,
  font,
  page,
  pageCount,
  pageNumber,
  tableColumns,
  tableWidth,
  view,
}: {
  columns: LunchBoxCountRow[][];
  font: PDFFont;
  page: PDFPage;
  pageCount: number;
  pageNumber: number;
  tableColumns: TableColumn[];
  tableWidth: number;
  view: LunchBoxDailyChecklistView;
}) {
  const { height, width } = page.getSize();
  const titleY = height - 34;
  const summaryY = height - 52;
  const tableTop = height - tableTopOffset;

  page.drawText("날짜별 학교 목록", {
    x: pageMarginX,
    y: titleY,
    size: titleFontSize,
    font,
    color: bodyTextColor,
  });
  page.drawText(view.summaryLabel, {
    x: pageMarginX,
    y: summaryY,
    size: summaryFontSize,
    font,
    color: mutedTextColor,
  });

  if (view.progressLabel) {
    const summaryWidth = font.widthOfTextAtSize(
      view.summaryLabel,
      summaryFontSize,
    );

    page.drawText(view.progressLabel, {
      x: pageMarginX + summaryWidth + 12,
      y: summaryY,
      size: summaryFontSize,
      font,
      color: accentColor,
    });
  }

  if (view.rows.length === 0) {
    drawEmptyState(page, font, view, tableTop);
  } else {
    const checkedSchoolIdSet = new Set(view.checkedSchoolIds);

    columns.forEach((rows, columnIndex) => {
      if (columnIndex >= view.columns.length) {
        return;
      }

      const x = pageMarginX + columnIndex * (tableWidth + tableGap);

      drawTableHeader(page, font, tableColumns, {
        tableTop,
        tableWidth,
        x,
      });
      drawTableRows(page, font, rows, tableColumns, checkedSchoolIdSet, {
        tableTop: tableTop - tableHeaderHeight,
        tableWidth,
        x,
      });
    });
  }

  if (pageCount > 1) {
    const label = `${pageNumber} / ${pageCount}`;
    const labelWidth = font.widthOfTextAtSize(label, pageNumberFontSize);

    page.drawText(label, {
      x: width - pageMarginX - labelWidth,
      y: 12,
      size: pageNumberFontSize,
      font,
      color: mutedTextColor,
    });
  }
}

function drawEmptyState(
  page: PDFPage,
  font: PDFFont,
  view: LunchBoxDailyChecklistView,
  tableTop: number,
) {
  const { width } = page.getSize();
  const title = "이 날짜에 배정된 학교가 없습니다";
  const description = `${view.dateLabel}에는 등록된 도시락 수량이 없습니다. 전날이나 다음날을 확인하세요.`;
  const titleSize = 11;
  const descriptionSize = 8.5;
  const titleWidth = font.widthOfTextAtSize(title, titleSize);
  const descriptionWidth = font.widthOfTextAtSize(
    description,
    descriptionSize,
  );

  page.drawLine({
    start: { x: pageMarginX, y: tableTop },
    end: { x: width - pageMarginX, y: tableTop },
    color: borderColor,
    thickness: 0.6,
  });
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: tableTop - 72,
    size: titleSize,
    font,
    color: bodyTextColor,
  });
  page.drawText(description, {
    x: (width - descriptionWidth) / 2,
    y: tableTop - 92,
    size: descriptionSize,
    font,
    color: mutedTextColor,
  });
}

function drawTableHeader(
  page: PDFPage,
  font: PDFFont,
  columns: TableColumn[],
  {
    tableTop,
    tableWidth,
    x,
  }: {
    tableTop: number;
    tableWidth: number;
    x: number;
  },
) {
  let cellX = x;
  const cellY = tableTop - tableHeaderHeight;

  for (const column of columns) {
    if (column.label) {
      drawSingleLineText(page, font, column.label, {
        align: column.align,
        color: mutedTextColor,
        fontSize: headerFontSize,
        height: tableHeaderHeight,
        width: column.width,
        x: cellX,
        y: cellY,
      });
    }

    cellX += column.width;
  }

  page.drawLine({
    start: { x, y: cellY },
    end: { x: x + tableWidth, y: cellY },
    color: strongBorderColor,
    thickness: 0.7,
  });
}

function drawTableRows(
  page: PDFPage,
  font: PDFFont,
  rows: LunchBoxCountRow[],
  columns: TableColumn[],
  checkedSchoolIdSet: Set<string>,
  {
    tableTop,
    tableWidth,
    x,
  }: {
    tableTop: number;
    tableWidth: number;
    x: number;
  },
) {
  let cursorY = tableTop;

  for (const row of rows) {
    const rowHeight = getRowHeight(font, row, columns);
    const y = cursorY - rowHeight;
    const isChecked = checkedSchoolIdSet.has(row.schoolId);

    if (isChecked) {
      page.drawRectangle({
        x,
        y,
        width: tableWidth,
        height: rowHeight,
        color: checkedRowColor,
      });
    }

    drawTableRow(page, font, row, columns, isChecked, {
      rowHeight,
      x,
      y,
    });
    page.drawLine({
      start: { x, y },
      end: { x: x + tableWidth, y },
      color: borderColor,
      thickness: 0.45,
    });
    cursorY = y;
  }
}

function drawTableRow(
  page: PDFPage,
  font: PDFFont,
  row: LunchBoxCountRow,
  columns: TableColumn[],
  isChecked: boolean,
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
    if (column.key === "check") {
      drawCheckbox(page, isChecked, {
        height: rowHeight,
        width: column.width,
        x: cellX,
        y,
      });
      cellX += column.width;
      continue;
    }

    const value = getCellValue(row, column.key);
    const color =
      column.key === "preservation" && row.preservationCount > 0
        ? accentColor
        : value === "-"
          ? mutedTextColor
          : bodyTextColor;

    if (column.key === "schoolName") {
      drawWrappedText(page, font, value, {
        color,
        height: rowHeight,
        width: column.width,
        x: cellX,
        y,
      });
    } else {
      drawSingleLineText(page, font, value, {
        align: column.align,
        color,
        fontSize: bodyFontSize,
        height: rowHeight,
        width: column.width,
        x: cellX,
        y,
      });
    }

    cellX += column.width;
  }
}

function drawCheckbox(
  page: PDFPage,
  isChecked: boolean,
  {
    height,
    width,
    x,
    y,
  }: {
    height: number;
    width: number;
    x: number;
    y: number;
  },
) {
  const size = 8.5;
  const checkboxX = x + (width - size) / 2;
  const checkboxY = y + (height - size) / 2;

  page.drawRectangle({
    x: checkboxX,
    y: checkboxY,
    width: size,
    height: size,
    borderColor: isChecked ? accentColor : mutedTextColor,
    borderWidth: 0.7,
  });

  if (!isChecked) {
    return;
  }

  page.drawLine({
    start: { x: checkboxX + 1.8, y: checkboxY + 4.2 },
    end: { x: checkboxX + 3.6, y: checkboxY + 2.2 },
    color: accentColor,
    thickness: 1,
  });
  page.drawLine({
    start: { x: checkboxX + 3.5, y: checkboxY + 2.2 },
    end: { x: checkboxX + 7, y: checkboxY + 6.5 },
    color: accentColor,
    thickness: 1,
  });
}

function drawWrappedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  {
    color,
    height,
    width,
    x,
    y,
  }: {
    color: ReturnType<typeof rgb>;
    height: number;
    width: number;
    x: number;
    y: number;
  },
) {
  const lines = wrapText(
    font,
    text,
    bodyFontSize,
    width - cellPaddingX * 2,
  );
  const blockHeight = lines.length * bodyLineHeight;
  const startY = y + (height + blockHeight) / 2 - bodyFontSize;

  lines.forEach((line, index) => {
    page.drawText(line, {
      x: x + cellPaddingX,
      y: startY - index * bodyLineHeight,
      size: bodyFontSize,
      font,
      color,
    });
  });
}

function drawSingleLineText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  {
    align,
    color,
    fontSize,
    height,
    width,
    x,
    y,
  }: {
    align: "left" | "right";
    color: ReturnType<typeof rgb>;
    fontSize: number;
    height: number;
    width: number;
    x: number;
    y: number;
  },
) {
  const fittedFontSize = fitFontSize(
    font,
    text,
    width - cellPaddingX * 2,
    fontSize,
    5.4,
  );
  const textWidth = font.widthOfTextAtSize(text, fittedFontSize);
  const textHeight = font.heightAtSize(fittedFontSize, {
    descender: false,
  });
  const textX =
    align === "right"
      ? x + width - cellPaddingX - textWidth
      : x + cellPaddingX;

  page.drawText(text, {
    x: textX,
    y: y + (height - textHeight) / 2,
    size: fittedFontSize,
    font,
    color,
  });
}

function createTableColumns(
  tableWidth: number,
  view: LunchBoxDailyChecklistView,
): TableColumn[] {
  const checkWidth = 16;
  const preservationWidth = 32;
  const servingWidth = 19;
  const deliveryDriverWidth = 20;
  const totalWidth = 24;
  const nonSchoolWidth =
    checkWidth +
    preservationWidth +
    view.visibleServingFields.length * servingWidth +
    (view.hasDeliveryDriver ? deliveryDriverWidth : 0) +
    totalWidth;
  const schoolWidth = tableWidth - nonSchoolWidth;

  return [
    { key: "check", label: "", width: checkWidth, align: "left" },
    {
      key: "schoolName",
      label: "학교",
      width: schoolWidth,
      align: "left",
    },
    {
      key: "preservation",
      label: "보존식",
      width: preservationWidth,
      align: "right",
    },
    ...view.visibleServingFields.map((field) => ({
      key: field,
      label: lunchBoxDailyChecklistShortFieldLabels[field],
      width: servingWidth,
      align: "right" as const,
    })),
    ...(view.hasDeliveryDriver
      ? [
          {
            key: "deliveryDriverCount" as const,
            label: "기사",
            width: deliveryDriverWidth,
            align: "right" as const,
          },
        ]
      : []),
    {
      key: "total",
      label: "합계",
      width: totalWidth,
      align: "right",
    },
  ];
}

function paginateColumns(
  font: PDFFont,
  columns: LunchBoxCountRow[][],
  tableColumns: TableColumn[],
) {
  const tableTop = landscapeA4[1] - tableTopOffset;
  const availableHeight = tableTop - tableHeaderHeight - pageBottom;
  const offsets = columns.map(() => 0);
  const pages: LunchBoxCountRow[][][] = [];

  while (
    columns.some((column, columnIndex) => offsets[columnIndex] < column.length)
  ) {
    const pageColumns = columns.map((column, columnIndex) => {
      const rows: LunchBoxCountRow[] = [];
      let height = 0;

      while (offsets[columnIndex] < column.length) {
        const row = column[offsets[columnIndex]];
        const rowHeight = getRowHeight(font, row, tableColumns);

        if (rows.length > 0 && height + rowHeight > availableHeight) {
          break;
        }

        rows.push(row);
        height += rowHeight;
        offsets[columnIndex] += 1;
      }

      return rows;
    });

    pages.push(pageColumns);
  }

  return pages;
}

function getRowHeight(
  font: PDFFont,
  row: LunchBoxCountRow,
  columns: TableColumn[],
) {
  const schoolColumn = columns.find((column) => column.key === "schoolName");
  const lines = wrapText(
    font,
    row.schoolName,
    bodyFontSize,
    (schoolColumn?.width ?? 72) - cellPaddingX * 2,
  );

  return Math.max(
    minRowHeight,
    lines.length * bodyLineHeight + cellPaddingY * 2,
  );
}

function getCellValue(row: LunchBoxCountRow, key: TableColumnKey) {
  if (key === "schoolName") {
    return row.schoolName;
  }

  if (key === "preservation") {
    return row.preservationCount > 0
      ? `${row.preservationCount}(${row.preservationClass ?? "-"})`
      : "-";
  }

  if (key === "total") {
    return String(getLunchBoxCountTotal(row));
  }

  if (key === "check") {
    return "";
  }

  return row[key] > 0 ? String(row[key]) : "-";
}

function getTableWidth() {
  return (
    (landscapeA4[0] -
      pageMarginX * 2 -
      tableGap * 2) /
    3
  );
}

function wrapText(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number,
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
  }

  if (currentLine || lines.length === 0) {
    lines.push(currentLine);
  }

  return lines;
}

function fitFontSize(
  font: PDFFont,
  text: string,
  maxWidth: number,
  preferredSize: number,
  minSize: number,
) {
  const textWidth = font.widthOfTextAtSize(text, preferredSize);

  if (textWidth <= maxWidth || textWidth === 0) {
    return preferredSize;
  }

  return Math.max(minSize, preferredSize * (maxWidth / textWidth));
}
