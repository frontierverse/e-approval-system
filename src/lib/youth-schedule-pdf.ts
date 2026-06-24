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
  getYouthLearningScheduleEndMinute,
  getYouthLearningScheduleStartMinute,
  type YouthCommonSchedule,
  type YouthLearningSchedule,
  youthCommonScheduleWeekdays,
  youthLearningScheduleEndHour,
  youthLearningScheduleStartHour,
  type YouthProfile,
} from "@/lib/youth-management-core";

type SchedulePdfColumn = {
  id: string;
  label: string;
};

type SchedulePdfItem = {
  columnId: string;
  content: string;
  endMinute: number;
  startMinute: number;
};

type WeeklySchedulePdfSchedule = {
  weekday: number;
  content: string;
  endMinute: number;
  startMinute: number;
};

type SchedulePdfPage = {
  columns: SchedulePdfColumn[];
  schedules: SchedulePdfItem[];
  subtitle: string;
  title: string;
};

export type SchedulePdfOrientation = "landscape" | "portrait";

type SchedulePdfRenderOptions = {
  cardSchedules?: boolean;
  cellFontSize?: number;
  cellLineHeight?: number;
  headerBackgroundColor?: ReturnType<typeof rgb>;
  headerFontSize?: number;
  headerTextColor?: ReturnType<typeof rgb>;
  lunchRowHeightScale?: number;
  lunchRowBackgroundColor?: ReturnType<typeof rgb>;
  orientation?: SchedulePdfOrientation;
  pageBackgroundColor?: ReturnType<typeof rgb>;
  rowStripeBackgroundColor?: ReturnType<typeof rgb>;
  scheduleCardBackgroundColor?: ReturnType<typeof rgb>;
  scheduleCardBorderColor?: ReturnType<typeof rgb>;
  scheduleCardStripeColor?: ReturnType<typeof rgb>;
  showDocumentHeader?: boolean;
  subtitleFontSize?: number;
  tableBottomOffset?: number;
  tableHeaderHeight?: number;
  tableTopOffset?: number;
  timeColumnBackgroundColor?: ReturnType<typeof rgb>;
  timeColumnWidth?: number;
  timeLabelFontSize?: number;
  titleFontSize?: number;
};

const a4PortraitSize: [number, number] = [PageSizes.A4[0], PageSizes.A4[1]];
const a4LandscapeSize: [number, number] = [PageSizes.A4[1], PageSizes.A4[0]];
const pdfKoreanFontPath = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NanumGothic-Regular.ttf",
);
const pageMargin = 32;
const tableHeaderHeight = 30;
const timeColumnWidth = 82;
const tableTextPadding = 5;
const titleFontSize = 18;
const subtitleFontSize = 9;
const headerFontSize = 9;
const timeLabelFontSize = 10;
const defaultCellFontSize = 8;
const defaultCellLineHeight = 10;
const commonScheduleCellFontSize = 13;
const commonScheduleCellLineHeight = 16;
const commonScheduleLunchRowHeightScale = 0.28;
const bodyTextColor = rgb(0.09, 0.1, 0.13);
const mutedTextColor = rgb(0.39, 0.45, 0.53);
const borderColor = rgb(0.78, 0.82, 0.88);
const headerBackgroundColor = rgb(0.96, 0.97, 0.99);
const commonScheduleHeaderBackgroundColor = rgb(0.9, 0.96, 0.95);
const commonScheduleHeaderTextColor = rgb(0.12, 0.27, 0.29);
const commonSchedulePageBackgroundColor = rgb(0.98, 0.99, 1);
const commonScheduleRowStripeBackgroundColor = rgb(0.97, 0.99, 0.99);
const commonScheduleLunchRowBackgroundColor = rgb(1, 0.97, 0.9);
const commonScheduleTimeColumnBackgroundColor = rgb(0.94, 0.96, 0.98);
const commonScheduleCardBackgroundColor = rgb(0.88, 0.97, 0.95);
const commonScheduleCardBorderColor = rgb(0.42, 0.68, 0.66);
const commonScheduleCardStripeColor = rgb(0.09, 0.43, 0.41);

export async function createYouthCommonSchedulePdf({
  orientation = "portrait",
  schedules,
}: {
  orientation?: SchedulePdfOrientation;
  schedules: YouthCommonSchedule[];
}) {
  return createWeeklySchedulePdf({
    orientation,
    schedules,
    title: "공통 일정표",
  });
}

export async function createWorkSchedulePdf({
  orientation = "portrait",
  schedules,
}: {
  orientation?: SchedulePdfOrientation;
  schedules: WeeklySchedulePdfSchedule[];
}) {
  return createWeeklySchedulePdf({
    orientation,
    schedules,
    title: "업무 일정표",
  });
}

async function createWeeklySchedulePdf({
  orientation,
  schedules,
  title,
}: {
  orientation: SchedulePdfOrientation;
  schedules: WeeklySchedulePdfSchedule[];
  title: string;
}) {
  const columns = youthCommonScheduleWeekdays.map((weekday) => ({
    id: String(weekday.value),
    label: weekday.label,
  }));

  return createSchedulePdf([
    {
      columns,
      schedules: schedules.map((schedule) => ({
        columnId: String(schedule.weekday),
        content: schedule.content,
        endMinute: schedule.endMinute,
        startMinute: schedule.startMinute,
      })),
      subtitle: "오전 9시부터 오후 6시까지",
      title,
    },
  ], {
    cardSchedules: true,
    cellFontSize: commonScheduleCellFontSize,
    cellLineHeight: commonScheduleCellLineHeight,
    headerBackgroundColor: commonScheduleHeaderBackgroundColor,
    headerFontSize: 11,
    headerTextColor: commonScheduleHeaderTextColor,
    lunchRowHeightScale: commonScheduleLunchRowHeightScale,
    lunchRowBackgroundColor: commonScheduleLunchRowBackgroundColor,
    orientation,
    pageBackgroundColor: commonSchedulePageBackgroundColor,
    rowStripeBackgroundColor: commonScheduleRowStripeBackgroundColor,
    scheduleCardBackgroundColor: commonScheduleCardBackgroundColor,
    scheduleCardBorderColor: commonScheduleCardBorderColor,
    scheduleCardStripeColor: commonScheduleCardStripeColor,
    showDocumentHeader: false,
    subtitleFontSize: 10,
    tableBottomOffset: 18,
    tableHeaderHeight: 36,
    tableTopOffset: 18,
    timeColumnBackgroundColor: commonScheduleTimeColumnBackgroundColor,
    timeColumnWidth: 92,
    timeLabelFontSize: 10,
    titleFontSize: 22,
  });
}

export async function createYouthLearningProgressPdf({
  schedules,
  selectedDate,
  youths,
}: {
  schedules: YouthLearningSchedule[];
  selectedDate: string;
  youths: YouthProfile[];
}) {
  const youthChunks = chunkItems(youths, 4);
  const pages =
    youthChunks.length > 0
      ? youthChunks
      : [
          [
            {
              id: "empty-youth",
              name: "학생 없음",
            } satisfies Pick<YouthProfile, "id" | "name">,
          ],
        ];

  return createSchedulePdf(
    pages.map((chunk, index) => {
      const columns = chunk.map((youth) => ({
        id: youth.id,
        label: youth.name,
      }));
      const visibleYouthIds = new Set(columns.map((column) => column.id));
      const pageLabel =
        pages.length > 1 ? ` · ${index + 1}/${pages.length}쪽` : "";

      return {
        columns,
        schedules: schedules
          .filter((schedule) => visibleYouthIds.has(schedule.youthId))
          .map((schedule) => ({
            columnId: schedule.youthId,
            content: schedule.content,
            endMinute: schedule.endMinute,
            startMinute: schedule.startMinute,
          })),
        subtitle: `${formatDateWithWeekday(selectedDate)} · 오전 9시부터 오후 6시까지${pageLabel}`,
        title: "학습진도 시간표",
      };
    }),
  );
}

async function createSchedulePdf(
  pages: SchedulePdfPage[],
  options: SchedulePdfRenderOptions = {},
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(pdfKoreanFontPath), {
    subset: false,
  });
  const { orientation = "portrait" } = options;
  const pageSize = getSchedulePdfPageSize(orientation);

  for (const pageInput of pages) {
    const page = pdf.addPage(pageSize);

    drawSchedulePage(page, font, pageInput, options);
  }

  return pdf.save();
}

function getSchedulePdfPageSize(
  orientation: SchedulePdfOrientation,
): [number, number] {
  return orientation === "landscape" ? a4LandscapeSize : a4PortraitSize;
}

function drawSchedulePage(
  page: PDFPage,
  font: PDFFont,
  { columns, schedules, subtitle, title }: SchedulePdfPage,
  {
    cardSchedules = false,
    cellFontSize = defaultCellFontSize,
    cellLineHeight = defaultCellLineHeight,
    headerBackgroundColor: tableHeaderBackgroundColor = headerBackgroundColor,
    headerFontSize: resolvedHeaderFontSize = headerFontSize,
    headerTextColor = bodyTextColor,
    lunchRowHeightScale = 1,
    lunchRowBackgroundColor,
    pageBackgroundColor,
    rowStripeBackgroundColor,
    scheduleCardBackgroundColor,
    scheduleCardBorderColor,
    scheduleCardStripeColor,
    showDocumentHeader = true,
    subtitleFontSize: resolvedSubtitleFontSize = subtitleFontSize,
    tableBottomOffset = 14,
    tableHeaderHeight: resolvedTableHeaderHeight = tableHeaderHeight,
    tableTopOffset = 50,
    timeColumnBackgroundColor,
    timeColumnWidth: resolvedTimeColumnWidth = timeColumnWidth,
    timeLabelFontSize: resolvedTimeLabelFontSize = timeLabelFontSize,
    titleFontSize: resolvedTitleFontSize = titleFontSize,
  }: SchedulePdfRenderOptions = {},
) {
  const { height, width } = page.getSize();
  const tableX = pageMargin;
  const tableTop = height - pageMargin - tableTopOffset;
  const tableBottom = pageMargin + tableBottomOffset;
  const tableWidth = width - pageMargin * 2;
  const tableHeight = tableTop - tableBottom;
  const rowSlots = createSchedulePdfTimeSlots();
  const rowHeights = createSchedulePdfRowHeights(
    rowSlots,
    tableHeight - resolvedTableHeaderHeight,
    lunchRowHeightScale,
  );
  const dataColumnWidth =
    (tableWidth - resolvedTimeColumnWidth) / Math.max(columns.length, 1);
  const columnWidths = [
    resolvedTimeColumnWidth,
    ...columns.map(() => dataColumnWidth),
  ];
  const titleY = height - pageMargin - resolvedTitleFontSize;

  if (pageBackgroundColor) {
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: pageBackgroundColor,
    });
  }

  if (showDocumentHeader && scheduleCardStripeColor) {
    page.drawRectangle({
      x: pageMargin,
      y: titleY - 5,
      width: 4,
      height: resolvedTitleFontSize + 8,
      color: scheduleCardStripeColor,
    });
  }

  if (showDocumentHeader) {
    page.drawText(title, {
      x: scheduleCardStripeColor ? pageMargin + 12 : pageMargin,
      y: titleY,
      size: resolvedTitleFontSize,
      font,
      color: bodyTextColor,
    });
    page.drawText(subtitle, {
      x: scheduleCardStripeColor ? pageMargin + 12 : pageMargin,
      y: height - pageMargin - resolvedTitleFontSize - 17,
      size: resolvedSubtitleFontSize,
      font,
      color: mutedTextColor,
    });
  }

  drawScheduleRowBackgrounds(page, {
    headerHeight: resolvedTableHeaderHeight,
    lunchRowBackgroundColor,
    rowHeights,
    rowSlots,
    rowStripeBackgroundColor,
    tableTop,
    tableWidth,
    tableX,
    timeColumnBackgroundColor,
    timeColumnWidth: resolvedTimeColumnWidth,
  });

  page.drawRectangle({
    x: tableX,
    y: tableTop - resolvedTableHeaderHeight,
    width: tableWidth,
    height: resolvedTableHeaderHeight,
    color: tableHeaderBackgroundColor,
  });

  drawCellText(page, font, "시간", {
    color: headerTextColor,
    fontSize: resolvedHeaderFontSize,
    height: resolvedTableHeaderHeight,
    horizontalAlign: "center",
    maxLines: 1,
    verticalAlign: "middle",
    width: resolvedTimeColumnWidth - tableTextPadding * 2,
    x: tableX + tableTextPadding,
    y: tableTop - resolvedTableHeaderHeight,
  });

  columns.forEach((column, columnIndex) => {
    drawCellText(page, font, column.label, {
      color: headerTextColor,
      fontSize: resolvedHeaderFontSize,
      height: resolvedTableHeaderHeight,
      horizontalAlign: "center",
      maxLines: 1,
      verticalAlign: "middle",
      width: dataColumnWidth - tableTextPadding * 2,
      x:
        tableX +
        resolvedTimeColumnWidth +
        dataColumnWidth * columnIndex +
        tableTextPadding,
      y: tableTop - resolvedTableHeaderHeight,
    });
  });

  let rowTop = tableTop - resolvedTableHeaderHeight;

  rowSlots.forEach((slot, rowIndex) => {
    const rowHeight = rowHeights[rowIndex] ?? 0;
    const rowY = rowTop - rowHeight;

    drawCellText(page, font, slot.label, {
      color: mutedTextColor,
      fontSize: resolvedTimeLabelFontSize,
      height: rowHeight,
      maxLines: 2,
      width: resolvedTimeColumnWidth - tableTextPadding * 2,
      x: tableX + tableTextPadding,
      y: rowY,
    });

    if (!cardSchedules) {
      columns.forEach((column, columnIndex) => {
        const cellSchedules = schedules
          .filter(
            (schedule) =>
              schedule.columnId === column.id &&
              schedule.startMinute < slot.endMinute &&
              schedule.endMinute > slot.startMinute,
          )
          .sort(
            (first, second) =>
              first.startMinute - second.startMinute ||
              first.endMinute - second.endMinute,
          );
        const text = cellSchedules
          .map((schedule) => schedule.content.trim())
          .filter(Boolean)
          .join("\n");

        drawCellText(page, font, text, {
          fontSize: cellFontSize,
          height: rowHeight,
          lineHeight: cellLineHeight,
          maxLines: Math.max(
            1,
            Math.floor((rowHeight - tableTextPadding * 2) / cellLineHeight),
          ),
          width: dataColumnWidth - tableTextPadding * 2,
          x:
            tableX +
            resolvedTimeColumnWidth +
            dataColumnWidth * columnIndex +
            tableTextPadding,
          y: rowY,
        });
      });
    }

    rowTop = rowY;
  });

  drawTableGrid(page, {
    columnWidths,
    headerHeight: resolvedTableHeaderHeight,
    rowHeights,
    tableBottom,
    tableTop,
    tableX,
  });

  if (cardSchedules) {
    drawScheduleCards(page, font, {
      cellFontSize,
      cellLineHeight,
      columns,
      dataColumnWidth,
      rowHeights,
      rowSlots,
      scheduleCardBackgroundColor:
        scheduleCardBackgroundColor ?? commonScheduleCardBackgroundColor,
      scheduleCardBorderColor:
        scheduleCardBorderColor ?? commonScheduleCardBorderColor,
      scheduleCardStripeColor:
        scheduleCardStripeColor ?? commonScheduleCardStripeColor,
      schedules,
      tableHeaderHeight: resolvedTableHeaderHeight,
      tableTop,
      tableX,
      timeColumnWidth: resolvedTimeColumnWidth,
    });
  }
}

function drawScheduleRowBackgrounds(
  page: PDFPage,
  {
    headerHeight,
    lunchRowBackgroundColor,
    rowHeights,
    rowSlots,
    rowStripeBackgroundColor,
    tableTop,
    tableWidth,
    tableX,
    timeColumnBackgroundColor,
    timeColumnWidth,
  }: {
    headerHeight: number;
    lunchRowBackgroundColor?: ReturnType<typeof rgb>;
    rowHeights: number[];
    rowSlots: Array<{
      endMinute: number;
      startMinute: number;
    }>;
    rowStripeBackgroundColor?: ReturnType<typeof rgb>;
    tableTop: number;
    tableWidth: number;
    tableX: number;
    timeColumnBackgroundColor?: ReturnType<typeof rgb>;
    timeColumnWidth: number;
  },
) {
  let rowTop = tableTop - headerHeight;

  rowSlots.forEach((slot, index) => {
    const rowHeight = rowHeights[index] ?? 0;
    const rowY = rowTop - rowHeight;
    const rowColor = isSchedulePdfLunchSlot(slot)
      ? lunchRowBackgroundColor
      : index % 2 === 1
        ? rowStripeBackgroundColor
        : undefined;

    if (rowColor) {
      page.drawRectangle({
        x: tableX,
        y: rowY,
        width: tableWidth,
        height: rowHeight,
        color: rowColor,
      });
    }

    if (timeColumnBackgroundColor) {
      page.drawRectangle({
        x: tableX,
        y: rowY,
        width: timeColumnWidth,
        height: rowHeight,
        color: timeColumnBackgroundColor,
        opacity: 0.78,
      });
    }

    rowTop = rowY;
  });
}

function drawScheduleCards(
  page: PDFPage,
  font: PDFFont,
  {
    cellFontSize,
    cellLineHeight,
    columns,
    dataColumnWidth,
    rowHeights,
    rowSlots,
    scheduleCardBackgroundColor,
    scheduleCardBorderColor,
    scheduleCardStripeColor,
    schedules,
    tableHeaderHeight,
    tableTop,
    tableX,
    timeColumnWidth,
  }: {
    cellFontSize: number;
    cellLineHeight: number;
    columns: SchedulePdfColumn[];
    dataColumnWidth: number;
    rowHeights: number[];
    rowSlots: Array<{
      endMinute: number;
      startMinute: number;
    }>;
    scheduleCardBackgroundColor: ReturnType<typeof rgb>;
    scheduleCardBorderColor: ReturnType<typeof rgb>;
    scheduleCardStripeColor: ReturnType<typeof rgb>;
    schedules: SchedulePdfItem[];
    tableHeaderHeight: number;
    tableTop: number;
    tableX: number;
    timeColumnWidth: number;
  },
) {
  const bodyTop = tableTop - tableHeaderHeight;

  for (const schedule of schedules) {
    const columnIndex = columns.findIndex(
      (column) => column.id === schedule.columnId,
    );

    if (columnIndex < 0 || !schedule.content.trim()) {
      continue;
    }

    const topY = getSchedulePdfMinuteY(
      schedule.startMinute,
      rowSlots,
      rowHeights,
      bodyTop,
    );
    const bottomY = getSchedulePdfMinuteY(
      schedule.endMinute,
      rowSlots,
      rowHeights,
      bodyTop,
    );
    const rawHeight = topY - bottomY;
    const verticalInset = Math.min(5, Math.max(2, rawHeight * 0.08));
    const cardX = tableX + timeColumnWidth + dataColumnWidth * columnIndex + 5;
    const cardY = bottomY + verticalInset;
    const cardWidth = dataColumnWidth - 10;
    const cardHeight = Math.max(12, rawHeight - verticalInset * 2);
    const textPaddingX = 7;
    const textPaddingY = cardHeight < 34 ? 4 : 7;
    const availableTextHeight = Math.max(8, cardHeight - textPaddingY * 2);
    const cardTextBoxWidth = cardWidth - textPaddingX * 2 - 3;
    const cardTextStyle = resolveScheduleCardTextStyle(
      font,
      schedule.content,
      {
        maxFontSize: cellFontSize,
        maxLines: Math.max(1, Math.floor(availableTextHeight / cellLineHeight)),
        maxWidth: cardTextBoxWidth,
        minFontSize: 9,
      },
    );

    page.drawRectangle({
      x: cardX,
      y: cardY,
      width: cardWidth,
      height: cardHeight,
      color: scheduleCardBackgroundColor,
      borderColor: scheduleCardBorderColor,
      borderWidth: 0.8,
    });
    page.drawRectangle({
      x: cardX,
      y: cardY,
      width: 3,
      height: cardHeight,
      color: scheduleCardStripeColor,
    });
    drawCellText(page, font, schedule.content, {
      color: bodyTextColor,
      fontSize: Math.min(cardTextStyle.fontSize, availableTextHeight),
      height: availableTextHeight,
      lineHeight: cardTextStyle.lineHeight,
      maxLines: cardTextStyle.maxLines,
      verticalAlign: "middle",
      width: cardTextBoxWidth,
      x: cardX + textPaddingX,
      y: cardY + textPaddingY,
    });
  }
}

function resolveScheduleCardTextStyle(
  font: PDFFont,
  text: string,
  {
    maxFontSize,
    maxLines,
    maxWidth,
    minFontSize,
  }: {
    maxFontSize: number;
    maxLines: number;
    maxWidth: number;
    minFontSize: number;
  },
) {
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const lineHeight = fontSize + 3;
    const lines = wrapText(font, text, fontSize, maxWidth, Number.MAX_SAFE_INTEGER);

    if (lines.length <= maxLines) {
      return {
        fontSize,
        lineHeight,
        maxLines,
      };
    }
  }

  return {
    fontSize: minFontSize,
    lineHeight: minFontSize + 3,
    maxLines,
  };
}

function drawTableGrid(
  page: PDFPage,
  {
    columnWidths,
    headerHeight,
    rowHeights,
    tableBottom,
    tableTop,
    tableX,
  }: {
    columnWidths: number[];
    headerHeight: number;
    rowHeights: number[];
    tableBottom: number;
    tableTop: number;
    tableX: number;
  },
) {
  let currentX = tableX;

  for (const columnWidth of columnWidths) {
    page.drawLine({
      start: { x: currentX, y: tableBottom },
      end: { x: currentX, y: tableTop },
      thickness: 0.6,
      color: borderColor,
    });
    currentX += columnWidth;
  }

  page.drawLine({
    start: { x: currentX, y: tableBottom },
    end: { x: currentX, y: tableTop },
    thickness: 0.6,
    color: borderColor,
  });
  page.drawLine({
    start: { x: tableX, y: tableTop },
    end: { x: currentX, y: tableTop },
    thickness: 0.6,
    color: borderColor,
  });
  page.drawLine({
    start: { x: tableX, y: tableTop - headerHeight },
    end: { x: currentX, y: tableTop - headerHeight },
    thickness: 0.6,
    color: borderColor,
  });

  let currentY = tableTop - headerHeight;

  for (const rowHeight of rowHeights) {
    currentY -= rowHeight;

    page.drawLine({
      start: { x: tableX, y: currentY },
      end: { x: currentX, y: currentY },
      thickness: 0.6,
      color: borderColor,
    });
  }
}

function drawCellText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  {
    color = bodyTextColor,
    fontSize,
    height,
    horizontalAlign = "left",
    lineHeight,
    maxLines,
    verticalAlign = "top",
    width,
    x,
    y,
  }: {
    color?: ReturnType<typeof rgb>;
    fontSize: number;
    height: number;
    horizontalAlign?: "center" | "left";
    lineHeight?: number;
    maxLines: number;
    verticalAlign?: "middle" | "top";
    width: number;
    x: number;
    y: number;
  },
) {
  if (!text.trim()) {
    return;
  }

  const resolvedLineHeight = lineHeight ?? fontSize + 3;
  const lines = wrapText(font, text, fontSize, width, maxLines);
  const textBlockHeight = fontSize + resolvedLineHeight * (lines.length - 1);
  let currentY =
    verticalAlign === "middle"
      ? y + (height + textBlockHeight) / 2 - fontSize
      : y + height - tableTextPadding - fontSize;

  for (const line of lines) {
    const lineWidth = font.widthOfTextAtSize(line, fontSize);
    const currentX =
      horizontalAlign === "center" ? x + Math.max(0, width - lineWidth) / 2 : x;

    page.drawText(line, {
      x: currentX,
      y: currentY,
      size: fontSize,
      font,
      color,
    });
    currentY -= resolvedLineHeight;
  }
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

  if (lines.length <= maxLines) {
    return lines;
  }

  return lines.slice(0, maxLines);
}

function createSchedulePdfTimeSlots() {
  const slots: Array<{
    endMinute: number;
    label: string;
    startMinute: number;
  }> = [];

  for (
    let hour = youthLearningScheduleStartHour;
    hour < youthLearningScheduleEndHour;
    hour += 1
  ) {
    const startMinute = getYouthLearningScheduleStartMinute(hour);
    const endMinute = Math.min(
      getYouthLearningScheduleStartMinute(hour + 1),
      getYouthLearningScheduleEndMinute(),
    );

    slots.push({
      endMinute,
      label: formatMinuteRange(startMinute, endMinute),
      startMinute,
    });
  }

  return slots;
}

function createSchedulePdfRowHeights(
  slots: Array<{
    endMinute: number;
    startMinute: number;
  }>,
  totalHeight: number,
  lunchRowHeightScale: number,
) {
  if (slots.length === 0) {
    return [];
  }

  const rowWeights = slots.map((slot) =>
    isSchedulePdfLunchSlot(slot) ? lunchRowHeightScale : 1,
  );
  const totalWeight = rowWeights.reduce((sum, weight) => sum + weight, 0);

  return rowWeights.map((weight) => (totalHeight * weight) / totalWeight);
}

function getSchedulePdfMinuteY(
  minute: number,
  slots: Array<{
    endMinute: number;
    startMinute: number;
  }>,
  rowHeights: number[],
  bodyTop: number,
) {
  let currentTop = bodyTop;

  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const rowHeight = rowHeights[index] ?? 0;

    if (!slot) {
      continue;
    }

    if (minute <= slot.startMinute) {
      return currentTop;
    }

    if (minute < slot.endMinute) {
      const progress =
        (minute - slot.startMinute) / (slot.endMinute - slot.startMinute);

      return currentTop - rowHeight * progress;
    }

    currentTop -= rowHeight;
  }

  return currentTop;
}

function isSchedulePdfLunchSlot({
  endMinute,
  startMinute,
}: {
  endMinute: number;
  startMinute: number;
}) {
  return startMinute === 12 * 60 && endMinute === 13 * 60;
}

function formatMinuteRange(startMinute: number, endMinute: number) {
  return `${formatMinute(startMinute)} - ${formatMinute(endMinute)}`;
}

function formatMinute(minute: number) {
  const hour = Math.floor(minute / 60);
  const minutePart = minute % 60;

  return `${String(hour).padStart(2, "0")}:${String(minutePart).padStart(
    2,
    "0",
  )}`;
}

function formatDateWithWeekday(value: string) {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekdayLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(date);

  return `${yearText}. ${monthText}. ${dayText}. (${weekdayLabel})`;
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
