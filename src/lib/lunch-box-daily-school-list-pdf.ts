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
  createLunchBoxServingOrderGroups,
  getLunchBoxCountTotal,
  isLunchBoxDate,
  lunchBoxDailyChecklistShortFieldLabels,
  lunchBoxServingCountFields,
  type LunchBoxCountRow,
  type LunchBoxDailyChecklistView,
  type LunchBoxDailySchoolChecklistData,
  type LunchBoxServingCountField,
  type LunchBoxServingOrderGroups,
  type LunchBoxServingOrderItem,
} from "@/lib/lunch-box-counts-core";

export type LunchBoxDailySchoolListPdfOrientation =
  | "landscape"
  | "portrait";

type LunchBoxDailySchoolListPdfInput = {
  checklist: LunchBoxDailySchoolChecklistData;
  generatedAt: Date;
  orientation?: LunchBoxDailySchoolListPdfOrientation;
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

type ServingOrderColumnKey =
  | "rank"
  | "schoolName"
  | "label"
  | "preservation"
  | "count";

type ServingOrderColumn = {
  align: "center" | "left" | "right";
  key: ServingOrderColumnKey;
  label: string;
  width: number;
};

type RankedServingOrderItem = {
  item: LunchBoxServingOrderItem;
  rank: number;
};

type ServingOrderPage = {
  packingItems: RankedServingOrderItem[];
  servingItems: RankedServingOrderItem[];
};

type DailySchoolPdfLayout = {
  checklistColumnCount: number;
  orientation: LunchBoxDailySchoolListPdfOrientation;
  packingWidth: number;
  pageSize: [number, number];
  separateServingCalculation: boolean;
  servingColumnCount: number;
  servingRowsPerColumn: number;
  servingTableTopOffset: number;
};

const koreanFontPath = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NanumGothic-Regular.ttf",
);
const portraitA4: [number, number] = [PageSizes.A4[0], PageSizes.A4[1]];
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
const servingOrderTableGap = 7;
const servingOrderSectionGap = 14;
const servingOrderTableHeaderHeight = 18;
const servingOrderRowHeight = 18;
const servingOrderSectionFontSize = 9;
const servingOrderBodyFontSize = 7.1;
const servingOrderHeaderFontSize = 6.8;
const bodyTextColor = rgb(0.09, 0.1, 0.12);
const mutedTextColor = rgb(0.41, 0.45, 0.51);
const accentColor = rgb(0.06, 0.33, 0.32);
const packingSectionColor = rgb(0.18, 0.31, 0.49);
const checkedRowColor = rgb(0.91, 0.96, 0.93);
const borderColor = rgb(0.89, 0.91, 0.94);
const strongBorderColor = rgb(0.81, 0.84, 0.88);
const landscapeLayout: DailySchoolPdfLayout = {
  checklistColumnCount: 3,
  orientation: "landscape",
  packingWidth: 190,
  pageSize: landscapeA4,
  separateServingCalculation: false,
  servingColumnCount: 3,
  servingRowsPerColumn: 25,
  servingTableTopOffset: 88,
};
const portraitLayout: DailySchoolPdfLayout = {
  checklistColumnCount: 2,
  orientation: "portrait",
  packingWidth: 170,
  pageSize: portraitA4,
  separateServingCalculation: true,
  servingColumnCount: 2,
  servingRowsPerColumn: 38,
  servingTableTopOffset: 102,
};

export async function createLunchBoxDailySchoolListPdf({
  checklist,
  generatedAt,
  orientation = "landscape",
}: LunchBoxDailySchoolListPdfInput) {
  if (!isLunchBoxDate(checklist.grid.date)) {
    throw new Error("날짜별 학교 목록 인쇄 날짜가 올바르지 않습니다.");
  }

  const view = createLunchBoxDailyChecklistView(checklist);
  const layout =
    orientation === "portrait" ? portraitLayout : landscapeLayout;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(koreanFontPath), {
    subset: false,
  });
  const tableWidth = getTableWidth(
    layout.pageSize[0],
    layout.checklistColumnCount,
  );
  const tableColumns = createTableColumns(tableWidth, view);
  const pageColumns =
    view.rows.length === 0
      ? [[[]]]
      : layout.orientation === "portrait"
        ? paginatePortraitColumns(
            font,
            view.rows,
            tableColumns,
            layout.pageSize[1],
            layout.checklistColumnCount,
          )
        : paginateColumns(
            font,
            view.columns,
            tableColumns,
            layout.pageSize[1],
          );
  const servingOrderGroups = createLunchBoxServingOrderGroups(view.rows);
  const servingOrderPages =
    view.rows.length === 0
      ? []
      : paginateServingOrderGroups(servingOrderGroups, layout);
  const pageCount = pageColumns.length + servingOrderPages.length;

  pdf.setTitle(`${view.dateLabel} 날짜별 학교 목록`);
  pdf.setSubject(
    "선택한 날짜의 학교별 도시락 수량, 준비 완료 체크, 대용량 보냉백 배치 및 도시락 포장 목록",
  );
  pdf.setCreator("바자울 사내 시스템");
  pdf.setProducer("바자울 사내 시스템");
  pdf.setCreationDate(generatedAt);
  pdf.setModificationDate(generatedAt);

  pageColumns.forEach((columns, pageIndex) => {
    const page = pdf.addPage(layout.pageSize);

    drawPage({
      columns,
      font,
      page,
      pageCount,
      pageNumber: pageIndex + 1,
      tableColumns,
      tableWidth,
      view,
    });
  });

  servingOrderPages.forEach((servingOrderPage, pageIndex) => {
    const page = pdf.addPage(layout.pageSize);

    drawServingOrderPage({
      font,
      groups: servingOrderGroups,
      layout,
      page,
      pageCount,
      pageNumber: pageColumns.length + pageIndex + 1,
      servingOrderPage,
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
  const { height } = page.getSize();
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

  drawPageNumber(page, font, pageNumber, pageCount);
}

function drawServingOrderPage({
  font,
  groups,
  layout,
  page,
  pageCount,
  pageNumber,
  servingOrderPage,
  view,
}: {
  font: PDFFont;
  groups: LunchBoxServingOrderGroups;
  layout: DailySchoolPdfLayout;
  page: PDFPage;
  pageCount: number;
  pageNumber: number;
  servingOrderPage: ServingOrderPage;
  view: LunchBoxDailyChecklistView;
}) {
  const { height, width } = page.getSize();
  const innerWidth = width - pageMarginX * 2;
  const servingSectionWidth =
    innerWidth - servingOrderSectionGap - layout.packingWidth;
  const servingTableWidth =
    (servingSectionWidth -
      servingOrderTableGap * (layout.servingColumnCount - 1)) /
    layout.servingColumnCount;
  const packingSectionX =
    pageMarginX + servingSectionWidth + servingOrderSectionGap;
  const tableTop = height - layout.servingTableTopOffset;
  const sectionLabelY =
    height - (layout.separateServingCalculation ? 90 : 76);
  const servingColumns = splitServingOrderColumns(
    servingOrderPage.servingItems,
    layout.servingColumnCount,
  );
  const preservationTargetKeys = createPreservationTargetKeys(view.rows);
  const servingTableColumns =
    createServingOrderTableColumns(servingTableWidth);
  const packingTableColumns = createServingOrderTableColumns(
    layout.packingWidth,
  );
  const servingTotal = groups.servingItems.reduce(
    (sum, item) => sum + item.count,
    0,
  );
  const packingTotal = groups.packingItems.reduce(
    (sum, item) => sum + item.count,
    0,
  );
  const deliveryDriverTotal = view.rows.reduce(
    (sum, row) => sum + row.deliveryDriverCount,
    0,
  );
  const servingCalculation = [
    `총 ${view.totalCount}개`,
    `보존식 ${view.preservationTotal}개`,
    `도시락 포장 ${packingTotal}개`,
    ...(deliveryDriverTotal > 0
      ? [`배송기사 ${deliveryDriverTotal}개`]
      : []),
  ].join(" - ");
  const servingSummary =
    `배식 목록 · ${groups.servingItems.length}개 반 / ${servingTotal}개`;
  const servingSectionLabel = layout.separateServingCalculation
    ? servingSummary
    : `${servingSummary} (${servingCalculation})`;
  const servingSectionLabelFontSize = fitFontSize(
    font,
    servingSectionLabel,
    servingSectionWidth - 4,
    servingOrderSectionFontSize,
    6.5,
  );
  const packingSectionLabel =
    `도시락 포장 목록 · ${groups.packingItems.length}건 / ${packingTotal}개`;
  const packingSectionLabelFontSize = fitFontSize(
    font,
    packingSectionLabel,
    layout.packingWidth - 4,
    servingOrderSectionFontSize,
    6.5,
  );

  page.drawText("대용량 보냉백 배치 순서", {
    x: pageMarginX,
    y: height - 34,
    size: titleFontSize,
    font,
    color: bodyTextColor,
  });
  page.drawText(
    `${view.dateLabel} · 수량이 많은 순 · 학교명과 반 표시`,
    {
      x: pageMarginX,
      y: height - 52,
      size: summaryFontSize,
      font,
      color: mutedTextColor,
    },
  );

  if (layout.separateServingCalculation) {
    const calculationLabel = `${servingTotal}개 (${servingCalculation})`;
    const calculationFontSize = fitFontSize(
      font,
      calculationLabel,
      innerWidth,
      7.8,
      6.5,
    );

    page.drawText(calculationLabel, {
      x: pageMarginX,
      y: height - 70,
      size: calculationFontSize,
      font,
      color: accentColor,
    });
  }

  page.drawText(servingSectionLabel, {
    x: pageMarginX,
    y: sectionLabelY,
    size: servingSectionLabelFontSize,
    font,
    color: accentColor,
  });
  page.drawText(packingSectionLabel, {
    x: packingSectionX,
    y: sectionLabelY,
    size: packingSectionLabelFontSize,
    font,
    color: packingSectionColor,
  });

  page.drawLine({
    start: {
      x: packingSectionX - servingOrderSectionGap / 2,
      y: pageBottom,
    },
    end: {
      x: packingSectionX - servingOrderSectionGap / 2,
      y: tableTop + servingOrderTableHeaderHeight,
    },
    color: strongBorderColor,
    thickness: 0.7,
  });

  servingColumns.forEach((items, columnIndex) => {
    const x =
      pageMarginX +
      columnIndex * (servingTableWidth + servingOrderTableGap);

    drawServingOrderTable(page, font, items, servingTableColumns, {
      preservationTargetKeys,
      tableTop,
      tableWidth: servingTableWidth,
      x,
    });
  });

  drawServingOrderTable(
    page,
    font,
    servingOrderPage.packingItems,
    packingTableColumns,
    {
      preservationTargetKeys,
      tableTop,
      tableWidth: layout.packingWidth,
      x: packingSectionX,
    },
  );

  if (servingOrderPage.servingItems.length === 0) {
    drawServingOrderEmptyState(
      page,
      font,
      "일반 학교의 배식 항목이 없습니다.",
      {
        tableTop,
        width: servingSectionWidth,
        x: pageMarginX,
      },
    );
  }

  if (servingOrderPage.packingItems.length === 0) {
    drawServingOrderEmptyState(
      page,
      font,
      "남초·병설 포장 항목이 없습니다.",
      {
        tableTop,
        width: layout.packingWidth,
        x: packingSectionX,
      },
    );
  }

  drawPageNumber(page, font, pageNumber, pageCount);
}

function drawServingOrderTable(
  page: PDFPage,
  font: PDFFont,
  items: RankedServingOrderItem[],
  columns: ServingOrderColumn[],
  {
    preservationTargetKeys,
    tableTop,
    tableWidth,
    x,
  }: {
    preservationTargetKeys: ReadonlySet<string>;
    tableTop: number;
    tableWidth: number;
    x: number;
  },
) {
  drawServingOrderTableHeader(page, font, columns, {
    tableTop,
    tableWidth,
    x,
  });

  items.forEach((rankedItem, rowIndex) => {
    const y =
      tableTop -
      servingOrderTableHeaderHeight -
      (rowIndex + 1) * servingOrderRowHeight;
    let cellX = x;

    for (const column of columns) {
      drawServingOrderCell(page, font, rankedItem, column, {
        showPreservation: preservationTargetKeys.has(
          getPreservationTargetKey(rankedItem.item),
        ),
        x: cellX,
        y,
      });
      cellX += column.width;
    }

    page.drawLine({
      start: { x, y },
      end: { x: x + tableWidth, y },
      color: borderColor,
      thickness: 0.45,
    });
  });
}

function drawServingOrderTableHeader(
  page: PDFPage,
  font: PDFFont,
  columns: ServingOrderColumn[],
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
  const y = tableTop - servingOrderTableHeaderHeight;

  for (const column of columns) {
    drawCompactSingleLineText(page, font, column.label, {
      align: column.align,
      color: mutedTextColor,
      fontSize: servingOrderHeaderFontSize,
      height: servingOrderTableHeaderHeight,
      minFontSize: 5.4,
      width: column.width,
      x: cellX,
      y,
    });
    cellX += column.width;
  }

  page.drawLine({
    start: { x, y },
    end: { x: x + tableWidth, y },
    color: strongBorderColor,
    thickness: 0.7,
  });
}

function drawServingOrderCell(
  page: PDFPage,
  font: PDFFont,
  { item, rank }: RankedServingOrderItem,
  column: ServingOrderColumn,
  {
    showPreservation,
    x,
    y,
  }: {
    showPreservation: boolean;
    x: number;
    y: number;
  },
) {
  let text: string;

  switch (column.key) {
    case "rank":
      text = String(rank);
      break;
    case "schoolName":
      text = item.schoolName;
      break;
    case "label":
      text = item.label;
      break;
    case "preservation":
      text = showPreservation ? "보존" : "";
      break;
    case "count":
      text = `${item.count}개`;
      break;
  }

  drawCompactSingleLineText(page, font, text, {
    align: column.align,
    color:
      column.key === "preservation" && showPreservation
        ? accentColor
        : column.key === "count"
          ? bodyTextColor
          : column.key === "rank"
            ? mutedTextColor
            : bodyTextColor,
    fontSize: servingOrderBodyFontSize,
    height: servingOrderRowHeight,
    minFontSize: 5.2,
    width: column.width,
    x,
    y,
  });
}

function drawServingOrderEmptyState(
  page: PDFPage,
  font: PDFFont,
  message: string,
  {
    tableTop,
    width,
    x,
  }: {
    tableTop: number;
    width: number;
    x: number;
  },
) {
  const fontSize = 7.5;
  const textWidth = font.widthOfTextAtSize(message, fontSize);

  page.drawText(message, {
    x: x + Math.max(0, (width - textWidth) / 2),
    y: tableTop - servingOrderTableHeaderHeight - 30,
    size: fontSize,
    font,
    color: mutedTextColor,
  });
}

function drawPageNumber(
  page: PDFPage,
  font: PDFFont,
  pageNumber: number,
  pageCount: number,
) {
  if (pageCount <= 1) {
    return;
  }

  const { width } = page.getSize();
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

function drawCompactSingleLineText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  {
    align,
    color,
    fontSize,
    height,
    minFontSize,
    width,
    x,
    y,
  }: {
    align: "center" | "left" | "right";
    color: ReturnType<typeof rgb>;
    fontSize: number;
    height: number;
    minFontSize: number;
    width: number;
    x: number;
    y: number;
  },
) {
  const availableWidth = width - cellPaddingX * 2;
  const fittedFontSize = fitFontSize(
    font,
    text,
    availableWidth,
    fontSize,
    minFontSize,
  );
  const fittedText =
    font.widthOfTextAtSize(text, fittedFontSize) <= availableWidth
      ? text
      : truncateText(font, text, fittedFontSize, availableWidth);
  const textWidth = font.widthOfTextAtSize(fittedText, fittedFontSize);
  const textHeight = font.heightAtSize(fittedFontSize, {
    descender: false,
  });
  const textX =
    align === "right"
      ? x + width - cellPaddingX - textWidth
      : align === "center"
        ? x + (width - textWidth) / 2
        : x + cellPaddingX;

  page.drawText(fittedText, {
    x: textX,
    y: y + (height - textHeight) / 2,
    size: fittedFontSize,
    font,
    color,
  });
}

function createServingOrderTableColumns(
  tableWidth: number,
): ServingOrderColumn[] {
  const rankWidth = 15;
  const labelWidth = 25;
  const preservationWidth = 28;
  const countWidth = 31;

  return [
    {
      key: "rank",
      label: "순",
      width: rankWidth,
      align: "right",
    },
    {
      key: "schoolName",
      label: "학교",
      width:
        tableWidth -
        rankWidth -
        labelWidth -
        preservationWidth -
        countWidth,
      align: "left",
    },
    {
      key: "label",
      label: "반",
      width: labelWidth,
      align: "center",
    },
    {
      key: "preservation",
      label: "보존",
      width: preservationWidth,
      align: "center",
    },
    {
      key: "count",
      label: "수량",
      width: countWidth,
      align: "right",
    },
  ];
}

function createPreservationTargetKeys(
  rows: readonly LunchBoxCountRow[],
): Set<string> {
  const targetKeys = new Set<string>();

  for (const row of rows) {
    if (row.preservationCount < 1) {
      continue;
    }

    const assignedField = row.preservationClass
      ? (`class${row.preservationClass}Count` as LunchBoxServingCountField)
      : null;
    const targetField =
      assignedField && row[assignedField] > 0
        ? assignedField
        : lunchBoxServingCountFields.find((field) => row[field] > 0);

    if (targetField) {
      targetKeys.add(
        getPreservationTargetKey({
          field: targetField,
          schoolId: row.schoolId,
        }),
      );
    }
  }

  return targetKeys;
}

function getPreservationTargetKey({
  field,
  schoolId,
}: Pick<LunchBoxServingOrderItem, "field" | "schoolId">) {
  return `${schoolId}\u0000${field}`;
}

function paginateServingOrderGroups(
  groups: LunchBoxServingOrderGroups,
  layout: DailySchoolPdfLayout,
): ServingOrderPage[] {
  const servingPageCapacity =
    layout.servingRowsPerColumn * layout.servingColumnCount;
  const packingPageCapacity = layout.servingRowsPerColumn;
  const pageCount = Math.max(
    1,
    Math.ceil(groups.servingItems.length / servingPageCapacity),
    Math.ceil(groups.packingItems.length / packingPageCapacity),
  );

  return Array.from({ length: pageCount }, (_, pageIndex) => {
    const servingStart = pageIndex * servingPageCapacity;
    const packingStart = pageIndex * packingPageCapacity;

    return {
      servingItems: groups.servingItems
        .slice(servingStart, servingStart + servingPageCapacity)
        .map((item, index) => ({
          item,
          rank: servingStart + index + 1,
        })),
      packingItems: groups.packingItems
        .slice(packingStart, packingStart + packingPageCapacity)
        .map((item, index) => ({
          item,
          rank: packingStart + index + 1,
        })),
    };
  });
}

function splitServingOrderColumns(
  items: readonly RankedServingOrderItem[],
  columnCount: number,
) {
  const perColumn = Math.ceil(items.length / columnCount);

  return Array.from({ length: columnCount }, (_, columnIndex) =>
    perColumn === 0
      ? []
      : items.slice(
          columnIndex * perColumn,
          (columnIndex + 1) * perColumn,
        ),
  );
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
  pageHeight: number,
) {
  const tableTop = pageHeight - tableTopOffset;
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

function paginatePortraitColumns(
  font: PDFFont,
  rows: readonly LunchBoxCountRow[],
  tableColumns: TableColumn[],
  pageHeight: number,
  columnCount: number,
) {
  const tableTop = pageHeight - tableTopOffset;
  const availableHeight = tableTop - tableHeaderHeight - pageBottom;
  const pages: LunchBoxCountRow[][][] = [];
  let offset = 0;

  while (offset < rows.length) {
    const pageStart = offset;
    const initiallyFilledColumns: LunchBoxCountRow[][] = [];

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const columnRows: LunchBoxCountRow[] = [];
      let height = 0;

      while (offset < rows.length) {
        const row = rows[offset];
        const rowHeight = getRowHeight(font, row, tableColumns);

        if (columnRows.length > 0 && height + rowHeight > availableHeight) {
          break;
        }

        columnRows.push(row);
        height += rowHeight;
        offset += 1;
      }

      initiallyFilledColumns.push(columnRows);
    }

    const pageRows = rows.slice(pageStart, offset);
    pages.push(
      columnCount === 2
        ? balancePortraitPageColumns(
            font,
            pageRows,
            tableColumns,
            availableHeight,
            initiallyFilledColumns,
          )
        : initiallyFilledColumns,
    );
  }

  return pages;
}

function balancePortraitPageColumns(
  font: PDFFont,
  rows: readonly LunchBoxCountRow[],
  tableColumns: TableColumn[],
  availableHeight: number,
  fallbackColumns: LunchBoxCountRow[][],
) {
  if (rows.length < 2) {
    return [Array.from(rows), []];
  }

  const rowHeights = rows.map((row) =>
    getRowHeight(font, row, tableColumns),
  );
  const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0);
  let firstColumnHeight = 0;
  let bestSplit = -1;
  let smallestDifference = Number.POSITIVE_INFINITY;

  for (let split = 1; split < rows.length; split += 1) {
    firstColumnHeight += rowHeights[split - 1];
    const secondColumnHeight = totalHeight - firstColumnHeight;

    if (
      firstColumnHeight > availableHeight ||
      secondColumnHeight > availableHeight
    ) {
      continue;
    }

    const difference = Math.abs(firstColumnHeight - secondColumnHeight);

    if (difference < smallestDifference) {
      bestSplit = split;
      smallestDifference = difference;
    }
  }

  return bestSplit > 0
    ? [Array.from(rows.slice(0, bestSplit)), Array.from(rows.slice(bestSplit))]
    : fallbackColumns;
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

function getTableWidth(pageWidth: number, columnCount: number) {
  return (
    (pageWidth -
      pageMarginX * 2 -
      tableGap * (columnCount - 1)) /
    columnCount
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

function truncateText(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number,
) {
  const ellipsis = "…";
  const characters = Array.from(text);
  let truncated = "";

  for (const character of characters) {
    const nextText = `${truncated}${character}${ellipsis}`;

    if (font.widthOfTextAtSize(nextText, fontSize) > maxWidth) {
      break;
    }

    truncated += character;
  }

  return truncated ? `${truncated}${ellipsis}` : "";
}
