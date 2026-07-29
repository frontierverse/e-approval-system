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
  getLunchBoxChartCount,
  isLunchBoxDate,
  parseLunchBoxDateValue,
  type LunchBoxChartData,
  type LunchBoxChartPoint,
} from "@/lib/lunch-box-counts-core";

export type LunchBoxChartPdfKind = "schools" | "total";
export type LunchBoxChartPdfOrientation = "landscape" | "portrait";

type LunchBoxChartPdfInput = {
  chart: LunchBoxChartPdfKind;
  data: LunchBoxChartData;
  generatedAt: Date;
  includePreservation: boolean;
  orientation?: LunchBoxChartPdfOrientation;
};

type ChartSeries = {
  dashArray?: number[];
  color: ReturnType<typeof rgb>;
  label: string;
  periodTotal: number;
  values: number[];
};

type ChartLayout = {
  height: number;
  width: number;
  x: number;
  y: number;
};

const koreanFontPath = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NanumGothic-Regular.ttf",
);
const a4Portrait: [number, number] = [PageSizes.A4[0], PageSizes.A4[1]];
const a4Landscape: [number, number] = [PageSizes.A4[1], PageSizes.A4[0]];
const pageMargin = 32;
const plotBottom = 66;
const schoolsPerLandscapePage = 10;
const schoolsPerPortraitPage = 8;
const bodyTextColor = rgb(0.09, 0.11, 0.14);
const mutedTextColor = rgb(0.37, 0.42, 0.49);
const accentColor = rgb(0.1, 0.42, 0.41);
const accentBackgroundColor = rgb(0.94, 0.98, 0.97);
const chartBackgroundColor = rgb(0.985, 0.99, 0.995);
const gridColor = rgb(0.84, 0.87, 0.9);
const borderColor = rgb(0.74, 0.78, 0.83);
const schoolColors = [
  rgb(0.05, 0.36, 0.35),
  rgb(0.13, 0.36, 0.69),
  rgb(0.76, 0.29, 0.14),
  rgb(0.42, 0.24, 0.64),
  rgb(0.02, 0.5, 0.56),
  rgb(0.67, 0.42, 0.06),
  rgb(0.68, 0.19, 0.39),
  rgb(0.25, 0.43, 0.15),
  rgb(0.24, 0.31, 0.42),
  rgb(0.52, 0.27, 0.12),
] as const;
const dashPatterns: Array<number[] | undefined> = [
  undefined,
  [5, 2],
  [2, 2],
  [7, 2, 2, 2],
];

export async function createLunchBoxChartPdf({
  chart,
  data,
  generatedAt,
  includePreservation,
  orientation = "portrait",
}: LunchBoxChartPdfInput) {
  validateChartData(data);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(koreanFontPath), {
    subset: false,
  });
  const pageSize = orientation === "landscape" ? a4Landscape : a4Portrait;
  const title =
    chart === "total"
      ? "도시락 일자별 총수량 추이"
      : "도시락 학교별 수량 추이";
  const preservationLabel = includePreservation
    ? "보존식 포함"
    : "보존식 제외";

  pdf.setTitle(`${title} · ${preservationLabel}`);
  pdf.setSubject(
    `${formatChartRange(data)} 공급일 기준 도시락 수량 선 차트 · ${preservationLabel}`,
  );
  pdf.setCreator("바자울 사내 시스템");
  pdf.setProducer("바자울 사내 시스템");
  pdf.setCreationDate(generatedAt);
  pdf.setModificationDate(generatedAt);

  if (chart === "total") {
    const page = pdf.addPage(pageSize);
    const totalSeries = createTotalSeries(data, includePreservation);
    const yAxisMaximum = createYAxisMaximum(totalSeries.values);

    drawChartPage({
      data,
      font,
      generatedAt,
      includePreservation,
      orientation,
      page,
      pageCount: 1,
      pageNumber: 1,
      series: [totalSeries],
      title,
      yAxisMaximum,
    });
  } else {
    const allSeries = createSchoolSeries(data, includePreservation);
    const perPage =
      orientation === "landscape"
        ? schoolsPerLandscapePage
        : schoolsPerPortraitPage;
    const pages = chunkItems(allSeries, perPage);
    const pageSeries = pages.length > 0 ? pages : [[]];
    const yAxisMaximum = createYAxisMaximum(
      allSeries.flatMap((series) => series.values),
    );

    pageSeries.forEach((series, pageIndex) => {
      const page = pdf.addPage(pageSize);

      drawChartPage({
        data,
        font,
        generatedAt,
        includePreservation,
        orientation,
        page,
        pageCount: pageSeries.length,
        pageNumber: pageIndex + 1,
        series,
        title,
        yAxisMaximum,
      });
    });
  }

  return pdf.save();
}

function drawChartPage({
  data,
  font,
  generatedAt,
  includePreservation,
  orientation,
  page,
  pageCount,
  pageNumber,
  series,
  title,
  yAxisMaximum,
}: {
  data: LunchBoxChartData;
  font: PDFFont;
  generatedAt: Date;
  includePreservation: boolean;
  orientation: LunchBoxChartPdfOrientation;
  page: PDFPage;
  pageCount: number;
  pageNumber: number;
  series: ChartSeries[];
  title: string;
  yAxisMaximum: number;
}) {
  const { height, width } = page.getSize();
  const generatedLabel = `PDF 생성 ${formatGeneratedAt(generatedAt)}`;
  const generatedWidth = font.widthOfTextAtSize(generatedLabel, 7.2);
  const rangeLabel = formatChartRange(data);
  const preservationLabel = includePreservation
    ? "보존식 포함"
    : "보존식 제외";
  const schoolPageLabel =
    title === "도시락 학교별 수량 추이" && pageCount > 0
      ? ` · 학교 ${formatSchoolPageRange(pageNumber, pageCount, series.length, orientation)}`
      : "";

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
  page.drawText(title, {
    x: pageMargin,
    y: height - 67,
    size: 18,
    font,
    color: bodyTextColor,
  });
  page.drawText(
    `${rangeLabel} · 공급일 ${data.serviceDates.length}일 · ${preservationLabel}${schoolPageLabel}`,
    {
      x: pageMargin,
      y: height - 85,
      size: 8.5,
      font,
      color: mutedTextColor,
    },
  );

  const legendBottom = drawLegend(page, font, series, {
    top: height - 105,
    width: width - pageMargin * 2,
    x: pageMargin,
  });
  const chartLayout: ChartLayout = {
    x: pageMargin + 48,
    y: plotBottom,
    width: width - pageMargin * 2 - 62,
    height: Math.max(120, legendBottom - plotBottom - 16),
  };

  if (data.serviceDates.length === 0) {
    drawEmptyChart(page, font, chartLayout);
  } else {
    drawAxes(page, font, data.serviceDates, chartLayout, yAxisMaximum, orientation);
    drawSeries(page, series, chartLayout, yAxisMaximum);
  }

  drawPageNumber(page, font, pageNumber, pageCount);
}

function drawLegend(
  page: PDFPage,
  font: PDFFont,
  series: ChartSeries[],
  {
    top,
    width,
    x,
  }: {
    top: number;
    width: number;
    x: number;
  },
) {
  const visibleSeries =
    series.length > 0
      ? series
      : [
          {
            color: accentColor,
            label: "표시할 학교 없음",
            periodTotal: 0,
            values: [],
          },
        ];
  const columnCount = visibleSeries.length === 1 ? 1 : 2;
  const columnGap = 12;
  const rowHeight = 18;
  const columnWidth =
    (width - columnGap * (columnCount - 1)) / columnCount;
  const rowCount = Math.ceil(visibleSeries.length / columnCount);

  page.drawRectangle({
    x,
    y: top - rowCount * rowHeight - 5,
    width,
    height: rowCount * rowHeight + 7,
    color: accentBackgroundColor,
    borderColor: gridColor,
    borderWidth: 0.55,
  });

  visibleSeries.forEach((item, index) => {
    const columnIndex = index % columnCount;
    const rowIndex = Math.floor(index / columnCount);
    const itemX = x + columnIndex * (columnWidth + columnGap) + 8;
    const itemY = top - rowIndex * rowHeight - 10;
    const text = `${item.label} · 기간합계 ${formatCount(item.periodTotal)}개`;
    const fontSize = fitFontSize(
      font,
      text,
      columnWidth - 43,
      7.5,
      5.5,
    );

    page.drawLine({
      start: { x: itemX, y: itemY + 2.5 },
      end: { x: itemX + 21, y: itemY + 2.5 },
      thickness: 1.5,
      color: item.color,
      dashArray: item.dashArray,
    });
    page.drawCircle({
      x: itemX + 21,
      y: itemY + 2.5,
      size: 1.7,
      color: item.color,
    });
    page.drawText(text, {
      x: itemX + 28,
      y: itemY,
      size: fontSize,
      font,
      color: bodyTextColor,
    });
  });

  return top - rowCount * rowHeight - 5;
}

function drawAxes(
  page: PDFPage,
  font: PDFFont,
  serviceDates: string[],
  layout: ChartLayout,
  yAxisMaximum: number,
  orientation: LunchBoxChartPdfOrientation,
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

  const yTickCount = 5;

  for (let index = 0; index <= yTickCount; index += 1) {
    const value = (yAxisMaximum / yTickCount) * index;
    const y = layout.y + (layout.height * index) / yTickCount;
    const label = formatCount(Math.round(value));
    const labelWidth = font.widthOfTextAtSize(label, 7);

    page.drawLine({
      start: { x: layout.x, y },
      end: { x: layout.x + layout.width, y },
      thickness: index === 0 ? 0.75 : 0.4,
      color: index === 0 ? borderColor : gridColor,
    });
    page.drawText(label, {
      x: layout.x - labelWidth - 7,
      y: y - 2.5,
      size: 7,
      font,
      color: mutedTextColor,
    });
  }

  page.drawText("개", {
    x: layout.x - 30,
    y: layout.y + layout.height + 5,
    size: 7,
    font,
    color: mutedTextColor,
  });

  const tickIndices = createXAxisTickIndices(
    serviceDates.length,
    orientation === "landscape" ? 12 : 8,
  );

  for (const index of tickIndices) {
    const x = getChartX(index, serviceDates.length, layout);
    const label = formatAxisDate(serviceDates[index]);
    const labelWidth = font.widthOfTextAtSize(label, 6.8);

    page.drawLine({
      start: { x, y: layout.y },
      end: { x, y: layout.y - 4 },
      thickness: 0.55,
      color: borderColor,
    });
    page.drawText(label, {
      x: x - labelWidth / 2,
      y: layout.y - 16,
      size: 6.8,
      font,
      color: mutedTextColor,
    });
  }

  const axisLabel = "주말·공휴일을 제외한 공급일 순서";
  const axisLabelWidth = font.widthOfTextAtSize(axisLabel, 7);
  page.drawText(axisLabel, {
    x: layout.x + (layout.width - axisLabelWidth) / 2,
    y: layout.y - 32,
    size: 7,
    font,
    color: mutedTextColor,
  });
}

function drawSeries(
  page: PDFPage,
  series: ChartSeries[],
  layout: ChartLayout,
  yAxisMaximum: number,
) {
  for (const item of series) {
    for (let index = 1; index < item.values.length; index += 1) {
      page.drawLine({
        start: {
          x: getChartX(index - 1, item.values.length, layout),
          y: getChartY(item.values[index - 1], yAxisMaximum, layout),
        },
        end: {
          x: getChartX(index, item.values.length, layout),
          y: getChartY(item.values[index], yAxisMaximum, layout),
        },
        thickness: series.length === 1 ? 1.8 : 1.15,
        color: item.color,
        dashArray: item.dashArray,
      });
    }

    if (item.values.length === 1) {
      page.drawCircle({
        x: getChartX(0, 1, layout),
        y: getChartY(item.values[0], yAxisMaximum, layout),
        size: 2.4,
        color: item.color,
      });
    } else if (series.length === 1) {
      const markerIndices =
        item.values.length <= 40
          ? item.values.map((_, index) => index)
          : createXAxisTickIndices(item.values.length, 12);

      for (const index of markerIndices) {
        page.drawCircle({
          x: getChartX(index, item.values.length, layout),
          y: getChartY(item.values[index], yAxisMaximum, layout),
          size: 1.8,
          color: item.color,
        });
      }
    }
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
  const title = "표시할 도시락 공급 데이터가 없습니다.";
  const detail = "도시락 수량이 등록되면 공급일 순서대로 차트에 표시됩니다.";
  const titleWidth = font.widthOfTextAtSize(title, 11);
  const detailWidth = font.widthOfTextAtSize(detail, 8);

  page.drawText(title, {
    x: layout.x + (layout.width - titleWidth) / 2,
    y: layout.y + layout.height / 2 + 7,
    size: 11,
    font,
    color: bodyTextColor,
  });
  page.drawText(detail, {
    x: layout.x + (layout.width - detailWidth) / 2,
    y: layout.y + layout.height / 2 - 10,
    size: 8,
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
  const { width } = page.getSize();
  const label = `${pageNumber} / ${pageCount}`;
  const labelWidth = font.widthOfTextAtSize(label, 7);

  page.drawText(label, {
    x: width - pageMargin - labelWidth,
    y: 20,
    size: 7,
    font,
    color: mutedTextColor,
  });
}

function createTotalSeries(
  data: LunchBoxChartData,
  includePreservation: boolean,
): ChartSeries {
  const pointsByDate = new Map(
    data.dailySeries.map((point) => [point.date, point]),
  );
  const values = data.serviceDates.map((date) =>
    getVisibleCount(pointsByDate.get(date), includePreservation),
  );

  return {
    color: accentColor,
    label: "전체 도시락",
    periodTotal: sumCounts(values),
    values,
  };
}

function createSchoolSeries(
  data: LunchBoxChartData,
  includePreservation: boolean,
): ChartSeries[] {
  return data.schoolSeries.map((school, index) => {
    const pointsByDate = new Map(
      school.points.map((point) => [point.date, point]),
    );
    const values = data.serviceDates.map((date) =>
      getVisibleCount(pointsByDate.get(date), includePreservation),
    );

    return {
      color: schoolColors[index % schoolColors.length],
      dashArray:
        dashPatterns[
          Math.floor(index / schoolColors.length) % dashPatterns.length
        ],
      label: school.schoolName,
      periodTotal: sumCounts(values),
      values,
    };
  });
}

function getVisibleCount(
  point: LunchBoxChartPoint | undefined,
  includePreservation: boolean,
) {
  if (!point) {
    return 0;
  }

  return Math.max(0, getLunchBoxChartCount(point, includePreservation));
}

function validateChartData(data: LunchBoxChartData) {
  if (
    data.serviceDates.some((date) => !isLunchBoxDate(date)) ||
    data.dailySeries.some((point) => !isLunchBoxDate(point.date)) ||
    data.schoolSeries.some((school) =>
      school.points.some((point) => !isLunchBoxDate(point.date)),
    )
  ) {
    throw new Error("도시락 차트의 공급 날짜가 올바르지 않습니다.");
  }

  if (
    (data.startDate !== null && !isLunchBoxDate(data.startDate)) ||
    (data.endDate !== null && !isLunchBoxDate(data.endDate))
  ) {
    throw new Error("도시락 차트의 조회 기간이 올바르지 않습니다.");
  }
}

function createYAxisMaximum(values: number[]) {
  const maximum = Math.max(0, ...values);

  if (maximum <= 5) {
    return 5;
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

  return [...indices].sort((left, right) => left - right);
}

function getChartX(index: number, pointCount: number, layout: ChartLayout) {
  if (pointCount <= 1) {
    return layout.x + layout.width / 2;
  }

  return layout.x + (layout.width * index) / (pointCount - 1);
}

function getChartY(value: number, maximum: number, layout: ChartLayout) {
  return layout.y + (layout.height * Math.max(0, value)) / maximum;
}

function formatChartRange(data: LunchBoxChartData) {
  if (!data.startDate || !data.endDate) {
    return "공급 기간 없음";
  }

  return `${formatFullDate(data.startDate)} ~ ${formatFullDate(data.endDate)}`;
}

function formatFullDate(value: string) {
  const [year, month, day] = value.split("-");

  return `${year}.${month}.${day}.`;
}

function formatAxisDate(value: string) {
  const [, month, day] = value.split("-");
  const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];
  const weekday = weekdayLabels[parseLunchBoxDateValue(value).getUTCDay()];

  return `${Number(month)}/${Number(day)}(${weekday})`;
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

function formatSchoolPageRange(
  pageNumber: number,
  pageCount: number,
  pageSchoolCount: number,
  orientation: LunchBoxChartPdfOrientation,
) {
  const perPage =
    orientation === "landscape"
      ? schoolsPerLandscapePage
      : schoolsPerPortraitPage;
  const first = (pageNumber - 1) * perPage + 1;
  const last = first + Math.max(0, pageSchoolCount - 1);

  return pageSchoolCount > 0
    ? `${first}~${last} · ${pageNumber}/${pageCount}쪽`
    : `0개교 · ${pageNumber}/${pageCount}쪽`;
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

function sumCounts(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
