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
  isLunchBoxDate,
  parseLunchBoxDateValue,
} from "@/lib/lunch-box-counts-core";
import {
  formatLunchBoxWon,
  formatLunchBoxWorkMinutes,
  type LunchBoxHiredWorkerSummary,
  type LunchBoxOperationsChartData,
} from "@/lib/lunch-box-operations-core";

export type LunchBoxHiredWorkerPdfOrientation = "landscape" | "portrait";

type LunchBoxHiredWorkerPdfInput = {
  data: LunchBoxOperationsChartData;
  generatedAt: Date;
  orientation?: LunchBoxHiredWorkerPdfOrientation;
};

type ChartSeries = {
  color: ReturnType<typeof rgb>;
  dashArray?: number[];
  label: string;
  periodTotal: number;
  values: Array<number | null>;
};

type ChartLayout = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type DetailRow =
  | {
      date: string;
      kind: "worker";
      laborCost: number;
      shiftRanges: string;
      totalMinutes: number;
      workerName: string;
    }
  | {
      date: string;
      kind: "daily-total";
      laborCost: number;
      totalMinutes: number;
    };

type MeasuredDetailRow = DetailRow & {
  height: number;
  shiftLines: string[];
  workerLines: string[];
};

type DetailColumnWidths = {
  date: number;
  laborCost: number;
  shiftRanges: number;
  totalMinutes: number;
  workerName: number;
};

const documentTitle = "별도 고용 인력 근무·지급 현황";
const koreanFontPath = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NanumGothic-Regular.ttf",
);
const a4Portrait: [number, number] = [PageSizes.A4[0], PageSizes.A4[1]];
const a4Landscape: [number, number] = [PageSizes.A4[1], PageSizes.A4[0]];
const pageMargin = 30;
const pageFooterHeight = 34;
const bodyTextColor = rgb(0.09, 0.11, 0.14);
const mutedTextColor = rgb(0.37, 0.42, 0.49);
const accentColor = rgb(0.1, 0.42, 0.41);
const accentStrongColor = rgb(0.06, 0.31, 0.3);
const accentBackgroundColor = rgb(0.94, 0.98, 0.97);
const chartBackgroundColor = rgb(0.985, 0.99, 0.995);
const tableHeaderColor = rgb(0.94, 0.95, 0.97);
const alternateRowColor = rgb(0.985, 0.988, 0.992);
const gridColor = rgb(0.84, 0.87, 0.9);
const borderColor = rgb(0.74, 0.78, 0.83);
const workerColors = [
  rgb(0.05, 0.36, 0.35),
  rgb(0.13, 0.36, 0.69),
  rgb(0.76, 0.29, 0.14),
  rgb(0.42, 0.24, 0.64),
  rgb(0.68, 0.14, 0.1),
  rgb(0.11, 0.42, 0.27),
  rgb(0.62, 0.18, 0.45),
  rgb(0.11, 0.37, 0.48),
  rgb(0.48, 0.32, 0),
  rgb(0.31, 0.27, 0.68),
] as const;
const dashPatterns: number[][] = [
  [6, 2],
  [2, 2],
  [8, 2, 2, 2],
  [10, 3],
];

export async function createLunchBoxHiredWorkerPdf({
  data,
  generatedAt,
  orientation = "portrait",
}: LunchBoxHiredWorkerPdfInput) {
  validateChartData(data);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(koreanFontPath), {
    subset: false,
  });
  const pageSize = orientation === "landscape" ? a4Landscape : a4Portrait;
  const workerNames = createWorkerNames(data);
  const workerSummaries = createWorkerSummaries(data, workerNames);
  const workersPerChartPage = orientation === "landscape" ? 9 : 7;
  const workerChunks =
    workerNames.length > 0
      ? chunkItems(workerNames, workersPerChartPage)
      : [[]];
  const yAxisMaximum = createYAxisMaximum(
    data.points.flatMap((point) => [
      point.laborCost,
      ...point.hiredWorkers.map((worker) => worker.laborCost),
    ]),
  );

  pdf.setTitle(documentTitle);
  pdf.setSubject(
    `${formatChartRange(data)} 별도 고용 인력의 일별 근무시간 및 지급액`,
  );
  pdf.setKeywords(["도시락", "별도 고용", "고용비", "근무시간"]);
  pdf.setCreator("바자울 사내 시스템");
  pdf.setProducer("바자울 사내 시스템");
  pdf.setCreationDate(generatedAt);
  pdf.setModificationDate(generatedAt);

  workerChunks.forEach((workerChunk, pageIndex) => {
    const page = pdf.addPage(pageSize);
    const series = createChartSeries(data, workerChunk, workerNames);

    drawChartPage({
      chartPageCount: workerChunks.length,
      chartPageNumber: pageIndex + 1,
      data,
      font,
      generatedAt,
      orientation,
      page,
      series,
      workerChunk,
      workerNames,
      yAxisMaximum,
    });
  });

  if (data.points.length > 0) {
    drawWorkerSummaryPages({
      data,
      font,
      generatedAt,
      orientation,
      pageSize,
      pdf,
      summaries: workerSummaries,
    });
    drawDailyDetailPages({
      data,
      font,
      generatedAt,
      orientation,
      pageSize,
      pdf,
    });
  }

  drawPageNumbers(pdf, font);

  return pdf.save();
}

function drawChartPage({
  chartPageCount,
  chartPageNumber,
  data,
  font,
  generatedAt,
  orientation,
  page,
  series,
  workerChunk,
  workerNames,
  yAxisMaximum,
}: {
  chartPageCount: number;
  chartPageNumber: number;
  data: LunchBoxOperationsChartData;
  font: PDFFont;
  generatedAt: Date;
  orientation: LunchBoxHiredWorkerPdfOrientation;
  page: PDFPage;
  series: ChartSeries[];
  workerChunk: string[];
  workerNames: string[];
  yAxisMaximum: number;
}) {
  const { height, width } = page.getSize();
  const workerRangeLabel = formatWorkerRangeLabel({
    chartPageNumber,
    workerChunk,
    workerNames,
  });
  let cursorY = drawDocumentHeader({
    font,
    generatedAt,
    page,
    subtitle: `${formatChartRange(data)} · 고용 기록일 ${formatInteger(
      data.points.length,
    )}일 · 차트 ${chartPageNumber}/${chartPageCount} · ${workerRangeLabel}`,
  });

  if (chartPageNumber === 1) {
    cursorY = drawKpiStrip(page, font, data, cursorY - 3);
  }

  page.drawText("고용비 추이", {
    x: pageMargin,
    y: cursorY - 13,
    size: 10,
    font,
    color: bodyTextColor,
  });
  cursorY -= 22;

  const legendBottom = drawChartLegend(page, font, series, {
    orientation,
    top: cursorY,
    width: width - pageMargin * 2,
    x: pageMargin,
  });
  const chartBottom = pageFooterHeight + 20;
  const chartLayout: ChartLayout = {
    x: pageMargin + 49,
    y: chartBottom,
    width: width - pageMargin * 2 - 62,
    height: Math.max(112, legendBottom - chartBottom - 15),
  };

  if (data.points.length === 0) {
    drawEmptyChart(page, font, chartLayout);
    return;
  }

  const dates = data.points.map((point) => point.date);

  drawChartAxes({
    dates,
    font,
    layout: chartLayout,
    orientation,
    page,
    yAxisMaximum,
  });
  drawChartSeries(page, series, chartLayout, yAxisMaximum);

  const description =
    "선이 끊긴 날짜는 해당 인력의 별도 고용 근무 기록이 없는 날입니다.";
  const descriptionSize = fitFontSize(
    font,
    description,
    width - pageMargin * 2,
    7,
    5.8,
  );
  page.drawText(description, {
    x: pageMargin,
    y: pageFooterHeight + 2,
    size: descriptionSize,
    font,
    color: mutedTextColor,
  });

  if (chartLayout.height <= 0 || height <= 0) {
    throw new Error("별도 고용 PDF 차트 영역을 계산하지 못했습니다.");
  }
}

function drawDocumentHeader({
  font,
  generatedAt,
  page,
  subtitle,
}: {
  font: PDFFont;
  generatedAt: Date;
  page: PDFPage;
  subtitle: string;
}) {
  const { height, width } = page.getSize();
  const generatedLabel = `PDF 생성 ${formatGeneratedAt(generatedAt)}`;
  const generatedWidth = font.widthOfTextAtSize(generatedLabel, 7.2);

  page.drawRectangle({
    x: pageMargin,
    y: height - 37,
    width: 44,
    height: 3,
    color: accentColor,
  });
  page.drawText(generatedLabel, {
    x: width - pageMargin - generatedWidth,
    y: height - 38,
    size: 7.2,
    font,
    color: mutedTextColor,
  });
  page.drawText(documentTitle, {
    x: pageMargin,
    y: height - 65,
    size: 17.5,
    font,
    color: bodyTextColor,
  });
  page.drawText(subtitle, {
    x: pageMargin,
    y: height - 82,
    size: fitFontSize(
      font,
      subtitle,
      width - pageMargin * 2,
      8.2,
      6.2,
    ),
    font,
    color: mutedTextColor,
  });

  return height - 94;
}

function drawKpiStrip(
  page: PDFPage,
  font: PDFFont,
  data: LunchBoxOperationsChartData,
  top: number,
) {
  const { width } = page.getSize();
  const metrics = [
    ["전체 고용비", formatLunchBoxWon(data.totalLaborCost)],
    ["고용 인력", `${formatInteger(createWorkerNames(data).length)}명`],
    ["고용 기록일", `${formatInteger(data.points.length)}일`],
    ["총 근무시간", formatLunchBoxWorkMinutes(data.totalMinutes)],
  ] as const;
  const stripWidth = width - pageMargin * 2;
  const metricWidth = stripWidth / metrics.length;
  const stripHeight = 42;
  const bottom = top - stripHeight;

  page.drawRectangle({
    x: pageMargin,
    y: bottom,
    width: stripWidth,
    height: stripHeight,
    color: accentBackgroundColor,
    borderColor: gridColor,
    borderWidth: 0.6,
  });

  metrics.forEach(([label, value], index) => {
    const x = pageMargin + metricWidth * index;

    if (index > 0) {
      page.drawLine({
        start: { x, y: bottom },
        end: { x, y: top },
        thickness: 0.5,
        color: gridColor,
      });
    }

    page.drawText(label, {
      x: x + 9,
      y: bottom + 25,
      size: 6.8,
      font,
      color: mutedTextColor,
    });
    page.drawText(value, {
      x: x + 9,
      y: bottom + 8,
      size: fitFontSize(font, value, metricWidth - 18, 11, 7.5),
      font,
      color: index === 0 ? accentStrongColor : bodyTextColor,
    });
  });

  return bottom - 4;
}

function drawChartLegend(
  page: PDFPage,
  font: PDFFont,
  series: ChartSeries[],
  {
    orientation,
    top,
    width,
    x,
  }: {
    orientation: LunchBoxHiredWorkerPdfOrientation;
    top: number;
    width: number;
    x: number;
  },
) {
  const columnCount = Math.min(
    series.length,
    orientation === "landscape" ? 3 : 2,
  );
  const resolvedColumnCount = Math.max(1, columnCount);
  const columnGap = 10;
  const rowHeight = 17;
  const columnWidth =
    (width - columnGap * (resolvedColumnCount - 1)) / resolvedColumnCount;
  const rowCount = Math.ceil(series.length / resolvedColumnCount);
  const legendHeight = rowCount * rowHeight + 7;
  const bottom = top - legendHeight;

  page.drawRectangle({
    x,
    y: bottom,
    width,
    height: legendHeight,
    color: accentBackgroundColor,
    borderColor: gridColor,
    borderWidth: 0.55,
  });

  series.forEach((item, index) => {
    const columnIndex = index % resolvedColumnCount;
    const rowIndex = Math.floor(index / resolvedColumnCount);
    const itemX = x + columnIndex * (columnWidth + columnGap) + 8;
    const itemY = top - rowIndex * rowHeight - 12;
    const text = `${item.label} · 기간합계 ${formatLunchBoxWon(
      item.periodTotal,
    )}`;

    page.drawLine({
      start: { x: itemX, y: itemY + 2.5 },
      end: { x: itemX + 19, y: itemY + 2.5 },
      thickness: index === 0 ? 1.8 : 1.2,
      color: item.color,
      dashArray: item.dashArray,
    });
    page.drawCircle({
      x: itemX + 19,
      y: itemY + 2.5,
      size: 1.55,
      color: item.color,
    });
    page.drawText(text, {
      x: itemX + 25,
      y: itemY,
      size: fitFontSize(font, text, columnWidth - 37, 7.1, 5.2),
      font,
      color: bodyTextColor,
    });
  });

  return bottom;
}

function drawChartAxes({
  dates,
  font,
  layout,
  orientation,
  page,
  yAxisMaximum,
}: {
  dates: string[];
  font: PDFFont;
  layout: ChartLayout;
  orientation: LunchBoxHiredWorkerPdfOrientation;
  page: PDFPage;
  yAxisMaximum: number;
}) {
  page.drawRectangle({
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
    color: chartBackgroundColor,
    borderColor,
    borderWidth: 0.7,
  });

  const yTickCount = 5;

  for (let index = 0; index <= yTickCount; index += 1) {
    const value = (yAxisMaximum / yTickCount) * index;
    const y = layout.y + (layout.height * index) / yTickCount;
    const label = formatWonAxisValue(Math.round(value));
    const labelWidth = font.widthOfTextAtSize(label, 6.8);

    page.drawLine({
      start: { x: layout.x, y },
      end: { x: layout.x + layout.width, y },
      thickness: index === 0 ? 0.75 : 0.4,
      color: index === 0 ? borderColor : gridColor,
    });
    page.drawText(label, {
      x: layout.x - labelWidth - 7,
      y: y - 2.4,
      size: 6.8,
      font,
      color: mutedTextColor,
    });
  }

  page.drawText("원", {
    x: layout.x - 28,
    y: layout.y + layout.height + 5,
    size: 7,
    font,
    color: mutedTextColor,
  });

  const tickIndices = createXAxisTickIndices(
    dates.length,
    orientation === "landscape" ? 12 : 8,
  );

  for (const index of tickIndices) {
    const x = getChartX(index, dates.length, layout);
    const label = formatAxisDate(dates[index]);
    const labelWidth = font.widthOfTextAtSize(label, 6.6);

    page.drawLine({
      start: { x, y: layout.y },
      end: { x, y: layout.y - 4 },
      thickness: 0.55,
      color: borderColor,
    });
    page.drawText(label, {
      x: x - labelWidth / 2,
      y: layout.y - 15,
      size: 6.6,
      font,
      color: mutedTextColor,
    });
  }

  const axisLabel = "별도 고용 근무 기록일 순서";
  const axisLabelWidth = font.widthOfTextAtSize(axisLabel, 6.8);
  page.drawText(axisLabel, {
    x: layout.x + (layout.width - axisLabelWidth) / 2,
    y: layout.y - 29,
    size: 6.8,
    font,
    color: mutedTextColor,
  });
}

function drawChartSeries(
  page: PDFPage,
  series: ChartSeries[],
  layout: ChartLayout,
  yAxisMaximum: number,
) {
  for (const [seriesIndex, item] of series.entries()) {
    for (let index = 1; index < item.values.length; index += 1) {
      const previousValue = item.values[index - 1];
      const value = item.values[index];

      if (previousValue === null || value === null) {
        continue;
      }

      page.drawLine({
        start: {
          x: getChartX(index - 1, item.values.length, layout),
          y: getChartY(previousValue, yAxisMaximum, layout),
        },
        end: {
          x: getChartX(index, item.values.length, layout),
          y: getChartY(value, yAxisMaximum, layout),
        },
        thickness: seriesIndex === 0 ? 1.8 : 1.05,
        color: item.color,
        dashArray: item.dashArray,
      });
    }

    item.values.forEach((value, index) => {
      if (value === null) {
        return;
      }

      page.drawCircle({
        x: getChartX(index, item.values.length, layout),
        y: getChartY(value, yAxisMaximum, layout),
        size: seriesIndex === 0 ? 1.85 : 1.45,
        color: item.color,
      });
    });
  }
}

function drawEmptyChart(
  page: PDFPage,
  font: PDFFont,
  layout: ChartLayout,
) {
  page.drawRectangle({
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
    color: chartBackgroundColor,
    borderColor,
    borderWidth: 0.7,
  });
  const title = "표시할 별도 고용 근무 기록이 없습니다.";
  const detail =
    "별도 고용 근무와 지급액이 등록되면 기록일 순서대로 표시됩니다.";
  const titleSize = fitFontSize(font, title, layout.width - 24, 11, 7.5);
  const detailSize = fitFontSize(font, detail, layout.width - 24, 8, 6);
  const titleWidth = font.widthOfTextAtSize(title, titleSize);
  const detailWidth = font.widthOfTextAtSize(detail, detailSize);

  page.drawText(title, {
    x: layout.x + (layout.width - titleWidth) / 2,
    y: layout.y + layout.height / 2 + 7,
    size: titleSize,
    font,
    color: bodyTextColor,
  });
  page.drawText(detail, {
    x: layout.x + (layout.width - detailWidth) / 2,
    y: layout.y + layout.height / 2 - 10,
    size: detailSize,
    font,
    color: mutedTextColor,
  });
}

function drawWorkerSummaryPages({
  data,
  font,
  generatedAt,
  pageSize,
  pdf,
  summaries,
}: {
  data: LunchBoxOperationsChartData;
  font: PDFFont;
  generatedAt: Date;
  orientation: LunchBoxHiredWorkerPdfOrientation;
  pageSize: [number, number];
  pdf: PDFDocument;
  summaries: LunchBoxHiredWorkerSummary[];
}) {
  if (summaries.length === 0) {
    return;
  }

  const [, pageHeight] = pageSize;
  const tableTop = pageHeight - 128;
  const tableHeaderHeight = 22;
  const rowHeight = 25;
  const availableHeight = tableTop - pageFooterHeight - tableHeaderHeight - 7;
  const rowsPerPage = Math.max(1, Math.floor(availableHeight / rowHeight));
  const pages = chunkItems(summaries, rowsPerPage);

  pages.forEach((pageSummaries, pageIndex) => {
    const page = pdf.addPage(pageSize);
    const firstWorker = pageIndex * rowsPerPage + 1;
    const lastWorker = firstWorker + pageSummaries.length - 1;
    let cursorY = drawDocumentHeader({
      font,
      generatedAt,
      page,
      subtitle: `${formatChartRange(data)} · 인력 ${firstWorker}~${lastWorker} / ${summaries.length}명`,
    });

    page.drawText("인력별 누계", {
      x: pageMargin,
      y: cursorY - 10,
      size: 11,
      font,
      color: bodyTextColor,
    });
    page.drawText("같은 이름의 근무 기록을 전체 기간 기준으로 합산합니다.", {
      x: pageMargin + 66,
      y: cursorY - 9,
      size: 7,
      font,
      color: mutedTextColor,
    });
    cursorY -= 34;
    cursorY = drawSummaryTableHeader(page, font, cursorY);

    pageSummaries.forEach((summary, rowIndex) => {
      drawSummaryTableRow({
        font,
        page,
        rowHeight,
        rowIndex,
        summary,
        top: cursorY,
      });
      cursorY -= rowHeight;
    });
  });
}

function drawSummaryTableHeader(page: PDFPage, font: PDFFont, top: number) {
  const { width } = page.getSize();
  const tableWidth = width - pageMargin * 2;
  const columns = createSummaryColumns(tableWidth);
  const height = 22;
  const bottom = top - height;

  page.drawRectangle({
    x: pageMargin,
    y: bottom,
    width: tableWidth,
    height,
    color: tableHeaderColor,
    borderColor,
    borderWidth: 0.65,
  });
  drawTableVerticalLines(page, columns.slice(0, -1), top, bottom);
  drawTableHeaderText(page, font, "고용 인력", pageMargin + 7, bottom + 7);
  drawRightAlignedText(
    page,
    font,
    "근무일",
    pageMargin + columns[1] - 7,
    bottom + 7,
    7.2,
    mutedTextColor,
  );
  drawRightAlignedText(
    page,
    font,
    "총 근무시간",
    pageMargin + columns[2] - 7,
    bottom + 7,
    7.2,
    mutedTextColor,
  );
  drawRightAlignedText(
    page,
    font,
    "총 지급액",
    pageMargin + columns[3] - 7,
    bottom + 7,
    7.2,
    mutedTextColor,
  );

  return bottom;
}

function drawSummaryTableRow({
  font,
  page,
  rowHeight,
  rowIndex,
  summary,
  top,
}: {
  font: PDFFont;
  page: PDFPage;
  rowHeight: number;
  rowIndex: number;
  summary: LunchBoxHiredWorkerSummary;
  top: number;
}) {
  const { width } = page.getSize();
  const tableWidth = width - pageMargin * 2;
  const columns = createSummaryColumns(tableWidth);
  const bottom = top - rowHeight;
  const textY = bottom + (rowHeight - 7.5) / 2;

  page.drawRectangle({
    x: pageMargin,
    y: bottom,
    width: tableWidth,
    height: rowHeight,
    color: rowIndex % 2 === 1 ? alternateRowColor : rgb(1, 1, 1),
    borderColor: gridColor,
    borderWidth: 0.45,
  });
  drawTableVerticalLines(page, columns.slice(0, -1), top, bottom);
  page.drawText(summary.workerName, {
    x: pageMargin + 7,
    y: textY,
    size: fitFontSize(font, summary.workerName, columns[0] - 14, 8, 5.5),
    font,
    color: bodyTextColor,
  });
  drawRightAlignedText(
    page,
    font,
    `${formatInteger(summary.workdayCount)}일`,
    pageMargin + columns[1] - 7,
    textY,
    8,
    bodyTextColor,
  );
  drawRightAlignedText(
    page,
    font,
    formatLunchBoxWorkMinutes(summary.totalMinutes),
    pageMargin + columns[2] - 7,
    textY,
    8,
    bodyTextColor,
  );
  drawRightAlignedText(
    page,
    font,
    formatLunchBoxWon(summary.laborCost),
    pageMargin + columns[3] - 7,
    textY,
    8,
    accentStrongColor,
  );
}

function drawDailyDetailPages({
  data,
  font,
  generatedAt,
  orientation,
  pageSize,
  pdf,
}: {
  data: LunchBoxOperationsChartData;
  font: PDFFont;
  generatedAt: Date;
  orientation: LunchBoxHiredWorkerPdfOrientation;
  pageSize: [number, number];
  pdf: PDFDocument;
}) {
  const [pageWidth, pageHeight] = pageSize;
  const tableWidth = pageWidth - pageMargin * 2;
  const columnWidths = createDetailColumnWidths(tableWidth, orientation);
  const rows = createDetailRows(data).map((row) =>
    measureDetailRow(row, font, columnWidths),
  );
  const tableTop = pageHeight - 128;
  const tableHeaderHeight = 22;
  const availableBodyHeight =
    tableTop - tableHeaderHeight - pageFooterHeight - 7;
  const pageRows = paginateMeasuredRows(rows, availableBodyHeight);

  pageRows.forEach((rowsOnPage, pageIndex) => {
    const page = pdf.addPage(pageSize);
    const firstDate = rowsOnPage[0]?.date ?? data.startDate;
    const lastDate = rowsOnPage.at(-1)?.date ?? data.endDate;
    let cursorY = drawDocumentHeader({
      font,
      generatedAt,
      page,
      subtitle: `${formatDateRange(firstDate, lastDate)} · 상세 ${pageIndex + 1}/${pageRows.length}`,
    });

    page.drawText("날짜별 근무·지급 내역", {
      x: pageMargin,
      y: cursorY - 10,
      size: 11,
      font,
      color: bodyTextColor,
    });
    page.drawText("사람별 시간대·총시간·지급액과 날짜별 합계를 표시합니다.", {
      x: pageMargin + 118,
      y: cursorY - 9,
      size: fitFontSize(
        font,
        "사람별 시간대·총시간·지급액과 날짜별 합계를 표시합니다.",
        pageWidth - pageMargin * 2 - 122,
        7,
        5.8,
      ),
      font,
      color: mutedTextColor,
    });
    cursorY -= 34;
    cursorY = drawDetailTableHeader(
      page,
      font,
      cursorY,
      columnWidths,
    );

    rowsOnPage.forEach((row, rowIndex) => {
      drawDetailTableRow({
        columnWidths,
        font,
        page,
        row,
        rowIndex,
        top: cursorY,
      });
      cursorY -= row.height;
    });
  });
}

function drawDetailTableHeader(
  page: PDFPage,
  font: PDFFont,
  top: number,
  widths: DetailColumnWidths,
) {
  const tableWidth = sumDetailColumnWidths(widths);
  const columns = createDetailColumns(widths);
  const height = 22;
  const bottom = top - height;

  page.drawRectangle({
    x: pageMargin,
    y: bottom,
    width: tableWidth,
    height,
    color: tableHeaderColor,
    borderColor,
    borderWidth: 0.65,
  });
  drawTableVerticalLines(page, columns.slice(0, -1), top, bottom);
  drawTableHeaderText(page, font, "날짜", pageMargin + 6, bottom + 7);
  drawTableHeaderText(
    page,
    font,
    "고용 인력",
    pageMargin + columns[0] + 6,
    bottom + 7,
  );
  drawTableHeaderText(
    page,
    font,
    "근무 시간대",
    pageMargin + columns[1] + 6,
    bottom + 7,
  );
  drawRightAlignedText(
    page,
    font,
    "총 근무시간",
    pageMargin + columns[3] - 6,
    bottom + 7,
    7.2,
    mutedTextColor,
  );
  drawRightAlignedText(
    page,
    font,
    "지급액",
    pageMargin + columns[4] - 6,
    bottom + 7,
    7.2,
    mutedTextColor,
  );

  return bottom;
}

function drawDetailTableRow({
  columnWidths,
  font,
  page,
  row,
  rowIndex,
  top,
}: {
  columnWidths: DetailColumnWidths;
  font: PDFFont;
  page: PDFPage;
  row: MeasuredDetailRow;
  rowIndex: number;
  top: number;
}) {
  const tableWidth = sumDetailColumnWidths(columnWidths);
  const columns = createDetailColumns(columnWidths);
  const bottom = top - row.height;
  const backgroundColor =
    row.kind === "daily-total"
      ? accentBackgroundColor
      : rowIndex % 2 === 1
        ? alternateRowColor
        : rgb(1, 1, 1);
  const singleLineY = bottom + (row.height - 7.4) / 2;

  page.drawRectangle({
    x: pageMargin,
    y: bottom,
    width: tableWidth,
    height: row.height,
    color: backgroundColor,
    borderColor: row.kind === "daily-total" ? borderColor : gridColor,
    borderWidth: row.kind === "daily-total" ? 0.6 : 0.45,
  });
  drawTableVerticalLines(page, columns.slice(0, -1), top, bottom);
  page.drawText(formatFullDateWithWeekday(row.date), {
    x: pageMargin + 6,
    y: singleLineY,
    size: fitFontSize(
      font,
      formatFullDateWithWeekday(row.date),
      columnWidths.date - 12,
      7.2,
      5.5,
    ),
    font,
    color: bodyTextColor,
  });

  if (row.kind === "daily-total") {
    page.drawText("일 합계", {
      x: pageMargin + columns[0] + 6,
      y: singleLineY,
      size: 7.8,
      font,
      color: accentStrongColor,
    });
    page.drawText("해당 날짜 별도 고용 합계", {
      x: pageMargin + columns[1] + 6,
      y: singleLineY,
      size: fitFontSize(
        font,
        "해당 날짜 별도 고용 합계",
        columnWidths.shiftRanges - 12,
        7.2,
        5.5,
      ),
      font,
      color: mutedTextColor,
    });
  } else {
    drawTextLines({
      color: bodyTextColor,
      font,
      fontSize: 7.4,
      lines: row.workerLines,
      page,
      top,
      x: pageMargin + columns[0] + 6,
    });
    drawTextLines({
      color: mutedTextColor,
      font,
      fontSize: 7.2,
      lines: row.shiftLines,
      page,
      top,
      x: pageMargin + columns[1] + 6,
    });
  }

  drawRightAlignedText(
    page,
    font,
    formatLunchBoxWorkMinutes(row.totalMinutes),
    pageMargin + columns[3] - 6,
    singleLineY,
    7.4,
    bodyTextColor,
  );
  drawRightAlignedText(
    page,
    font,
    formatLunchBoxWon(row.laborCost),
    pageMargin + columns[4] - 6,
    singleLineY,
    7.4,
    row.kind === "daily-total" ? accentStrongColor : bodyTextColor,
  );
}

function createChartSeries(
  data: LunchBoxOperationsChartData,
  workerChunk: string[],
  allWorkerNames: string[],
): ChartSeries[] {
  const workerIndexByName = new Map(
    allWorkerNames.map((workerName, index) => [workerName, index]),
  );
  const totalValues = data.points.map((point) =>
    toNonNegativeInteger(point.laborCost),
  );

  return [
    {
      color: accentColor,
      label: "일별 고용비 합계",
      periodTotal: sumValues(totalValues),
      values: totalValues,
    },
    ...workerChunk.map((workerName) => {
      const workerIndex = workerIndexByName.get(workerName) ?? 0;
      const values = data.points.map((point) => {
        const worker = point.hiredWorkers.find(
          (item) => item.workerName === workerName,
        );

        return worker ? toNonNegativeInteger(worker.laborCost) : null;
      });

      return {
        color: workerColors[workerIndex % workerColors.length],
        dashArray:
          dashPatterns[
            Math.floor(workerIndex / workerColors.length) %
              dashPatterns.length
          ],
        label: workerName,
        periodTotal: sumValues(values),
        values,
      };
    }),
  ];
}

function createWorkerNames(data: LunchBoxOperationsChartData) {
  const names = new Set(
    data.workerNames.map((workerName) => workerName.trim()).filter(Boolean),
  );

  for (const point of data.points) {
    for (const worker of point.hiredWorkers) {
      const workerName = worker.workerName.trim();

      if (workerName) {
        names.add(workerName);
      }
    }
  }

  return Array.from(names).sort((left, right) =>
    left.localeCompare(right, "ko"),
  );
}

function createWorkerSummaries(
  data: LunchBoxOperationsChartData,
  workerNames: string[],
) {
  const providedByName = new Map(
    data.workerSummaries.map((summary) => [summary.workerName, summary]),
  );
  const derivedByName = new Map<string, LunchBoxHiredWorkerSummary>();

  for (const point of data.points) {
    for (const worker of point.hiredWorkers) {
      const summary = derivedByName.get(worker.workerName) ?? {
        laborCost: 0,
        totalMinutes: 0,
        workdayCount: 0,
        workerName: worker.workerName,
      };

      summary.laborCost += toNonNegativeInteger(worker.laborCost);
      summary.totalMinutes += toNonNegativeInteger(worker.totalMinutes);
      summary.workdayCount += 1;
      derivedByName.set(worker.workerName, summary);
    }
  }

  return workerNames.map((workerName) => {
    const summary = providedByName.get(workerName) ??
      derivedByName.get(workerName) ?? {
        laborCost: 0,
        totalMinutes: 0,
        workdayCount: 0,
        workerName,
      };

    return {
      laborCost: toNonNegativeInteger(summary.laborCost),
      totalMinutes: toNonNegativeInteger(summary.totalMinutes),
      workdayCount: toNonNegativeInteger(summary.workdayCount),
      workerName,
    };
  });
}

function createDetailRows(data: LunchBoxOperationsChartData): DetailRow[] {
  return data.points.flatMap((point) => [
    ...point.hiredWorkers.map((worker): DetailRow => ({
      date: point.date,
      kind: "worker",
      laborCost: toNonNegativeInteger(worker.laborCost),
      shiftRanges: worker.shifts
        .map((shift) => `${shift.startTime}~${shift.endTime}`)
        .join(" / "),
      totalMinutes: toNonNegativeInteger(worker.totalMinutes),
      workerName: worker.workerName,
    })),
    {
      date: point.date,
      kind: "daily-total" as const,
      laborCost: toNonNegativeInteger(point.laborCost),
      totalMinutes: toNonNegativeInteger(point.totalMinutes),
    },
  ]);
}

function measureDetailRow(
  row: DetailRow,
  font: PDFFont,
  widths: DetailColumnWidths,
): MeasuredDetailRow {
  if (row.kind === "daily-total") {
    return {
      ...row,
      height: 23,
      shiftLines: [],
      workerLines: [],
    };
  }

  const workerLines = wrapText(
    font,
    row.workerName,
    7.4,
    widths.workerName - 12,
  );
  const shiftLines = wrapText(
    font,
    row.shiftRanges || "시간대 없음",
    7.2,
    widths.shiftRanges - 12,
  );
  const lineCount = Math.max(workerLines.length, shiftLines.length, 1);

  return {
    ...row,
    height: Math.max(25, lineCount * 9.2 + 10),
    shiftLines,
    workerLines,
  };
}

function paginateMeasuredRows(
  rows: MeasuredDetailRow[],
  availableHeight: number,
) {
  const pages: MeasuredDetailRow[][] = [];
  let currentPage: MeasuredDetailRow[] = [];
  let remainingHeight = availableHeight;

  for (const row of rows) {
    if (currentPage.length > 0 && row.height > remainingHeight) {
      pages.push(currentPage);
      currentPage = [];
      remainingHeight = availableHeight;
    }

    currentPage.push(row);
    remainingHeight -= row.height;
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}

function createSummaryColumns(tableWidth: number) {
  return [
    tableWidth * 0.47,
    tableWidth * 0.61,
    tableWidth * 0.8,
    tableWidth,
  ];
}

function createDetailColumnWidths(
  tableWidth: number,
  orientation: LunchBoxHiredWorkerPdfOrientation,
): DetailColumnWidths {
  const date = orientation === "landscape" ? tableWidth * 0.135 : 88;
  const workerName = tableWidth * 0.205;
  const shiftRanges = tableWidth * 0.285;
  const totalMinutes = tableWidth * 0.155;

  return {
    date,
    laborCost:
      tableWidth - date - workerName - shiftRanges - totalMinutes,
    shiftRanges,
    totalMinutes,
    workerName,
  };
}

function createDetailColumns(widths: DetailColumnWidths) {
  return [
    widths.date,
    widths.date + widths.workerName,
    widths.date + widths.workerName + widths.shiftRanges,
    widths.date +
      widths.workerName +
      widths.shiftRanges +
      widths.totalMinutes,
    sumDetailColumnWidths(widths),
  ];
}

function sumDetailColumnWidths(widths: DetailColumnWidths) {
  return (
    widths.date +
    widths.workerName +
    widths.shiftRanges +
    widths.totalMinutes +
    widths.laborCost
  );
}

function drawTableVerticalLines(
  page: PDFPage,
  columnEnds: number[],
  top: number,
  bottom: number,
) {
  for (const columnEnd of columnEnds) {
    const x = pageMargin + columnEnd;

    page.drawLine({
      start: { x, y: bottom },
      end: { x, y: top },
      thickness: 0.4,
      color: gridColor,
    });
  }
}

function drawTableHeaderText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
) {
  page.drawText(text, {
    x,
    y,
    size: 7.2,
    font,
    color: mutedTextColor,
  });
}

function drawRightAlignedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  right: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  const width = font.widthOfTextAtSize(text, size);

  page.drawText(text, {
    x: right - width,
    y,
    size,
    font,
    color,
  });
}

function drawTextLines({
  color,
  font,
  fontSize,
  lines,
  page,
  top,
  x,
}: {
  color: ReturnType<typeof rgb>;
  font: PDFFont;
  fontSize: number;
  lines: string[];
  page: PDFPage;
  top: number;
  x: number;
}) {
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: top - 7 - fontSize - index * 9.2,
      size: fontSize,
      font,
      color,
    });
  });
}

function drawPageNumbers(pdf: PDFDocument, font: PDFFont) {
  const pages = pdf.getPages();

  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const label = `${index + 1} / ${pages.length}`;
    const labelWidth = font.widthOfTextAtSize(label, 7);

    page.drawText(label, {
      x: width - pageMargin - labelWidth,
      y: 18,
      size: 7,
      font,
      color: mutedTextColor,
    });
  });
}

function validateChartData(data: LunchBoxOperationsChartData) {
  if (data.points.some((point) => !isLunchBoxDate(point.date))) {
    throw new Error("별도 고용 차트의 근무 날짜가 올바르지 않습니다.");
  }

  if (
    (data.startDate !== null && !isLunchBoxDate(data.startDate)) ||
    (data.endDate !== null && !isLunchBoxDate(data.endDate))
  ) {
    throw new Error("별도 고용 차트의 조회 기간이 올바르지 않습니다.");
  }
}

function createYAxisMaximum(values: number[]) {
  const maximum = Math.max(0, ...values.map(toNonNegativeInteger));

  if (maximum <= 5_000) {
    return 5_000;
  }

  const roughStep = maximum / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = factor * magnitude;

  return Math.max(step * 5, Math.ceil(maximum / step) * step);
}

function createXAxisTickIndices(pointCount: number, maximumTicks: number) {
  if (pointCount <= 0) {
    return [];
  }

  if (pointCount <= maximumTicks) {
    return Array.from({ length: pointCount }, (_, index) => index);
  }

  const indices = new Set<number>([0, pointCount - 1]);
  const step = (pointCount - 1) / (maximumTicks - 1);

  for (let index = 1; index < maximumTicks - 1; index += 1) {
    indices.add(Math.round(index * step));
  }

  return Array.from(indices).sort((left, right) => left - right);
}

function getChartX(index: number, pointCount: number, layout: ChartLayout) {
  if (pointCount <= 1) {
    return layout.x + layout.width / 2;
  }

  return layout.x + (layout.width * index) / (pointCount - 1);
}

function getChartY(value: number, maximum: number, layout: ChartLayout) {
  return (
    layout.y +
    (layout.height * Math.min(maximum, toNonNegativeInteger(value))) / maximum
  );
}

function formatChartRange(data: LunchBoxOperationsChartData) {
  return formatDateRange(data.startDate, data.endDate);
}

function formatDateRange(
  startDate: string | null,
  endDate: string | null,
) {
  if (!startDate || !endDate) {
    return "고용 기록 기간 없음";
  }

  return `${formatFullDate(startDate)} ~ ${formatFullDate(endDate)}`;
}

function formatFullDate(value: string) {
  const [year, month, day] = value.split("-");

  return `${year}.${month}.${day}.`;
}

function formatFullDateWithWeekday(value: string) {
  return `${formatFullDate(value)}(${getWeekdayLabel(value)})`;
}

function formatAxisDate(value: string) {
  const [, month, day] = value.split("-");

  return `${Number(month)}/${Number(day)}(${getWeekdayLabel(value)})`;
}

function getWeekdayLabel(value: string) {
  const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

  return weekdayLabels[parseLunchBoxDateValue(value).getUTCDay()];
}

function formatGeneratedAt(value: Date) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).formatToParts(value);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("year")}.${getPart("month")}.${getPart("day")}. ${getPart("hour")}:${getPart("minute")}`;
}

function formatWorkerRangeLabel({
  workerChunk,
  workerNames,
}: {
  chartPageNumber: number;
  workerChunk: string[];
  workerNames: string[];
}) {
  if (workerChunk.length === 0) {
    return "고용 인력 없음";
  }

  const first = Math.max(0, workerNames.indexOf(workerChunk[0])) + 1;
  const last = Math.min(workerNames.length, first + workerChunk.length - 1);

  return `고용 인력 ${first}~${last} / ${workerNames.length}명`;
}

function formatWonAxisValue(value: number) {
  const amount = toNonNegativeInteger(value);

  if (amount >= 100_000_000) {
    return `${formatCompactNumber(amount / 100_000_000)}억`;
  }

  if (amount >= 10_000) {
    return `${formatCompactNumber(amount / 10_000)}만`;
  }

  return formatInteger(amount);
}

function formatCompactNumber(value: number) {
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: 1,
  });
}

function formatInteger(value: number) {
  return toNonNegativeInteger(value).toLocaleString("ko-KR");
}

function toNonNegativeInteger(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function sumValues(values: Array<number | null>) {
  return values.reduce<number>(
    (sum, value) => sum + (value === null ? 0 : toNonNegativeInteger(value)),
    0,
  );
}

function fitFontSize(
  font: PDFFont,
  text: string,
  maxWidth: number,
  preferredSize: number,
  minimumSize: number,
) {
  const width = font.widthOfTextAtSize(text, preferredSize);

  if (width <= maxWidth || width === 0) {
    return preferredSize;
  }

  return Math.max(minimumSize, preferredSize * (maxWidth / width));
}

function wrapText(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number,
) {
  const characters = Array.from(text || " ");
  const lines: string[] = [];
  let currentLine = "";

  for (const character of characters) {
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

  if (currentLine || lines.length === 0) {
    lines.push(currentLine.trim() || " ");
  }

  return lines;
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
