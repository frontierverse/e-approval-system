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

type SchedulePdfPage = {
  columns: SchedulePdfColumn[];
  schedules: SchedulePdfItem[];
  subtitle: string;
  title: string;
};

const a4PortraitSize: [number, number] = [PageSizes.A4[0], PageSizes.A4[1]];
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
const cellFontSize = 8;
const cellLineHeight = 10;
const bodyTextColor = rgb(0.09, 0.1, 0.13);
const mutedTextColor = rgb(0.39, 0.45, 0.53);
const borderColor = rgb(0.78, 0.82, 0.88);
const headerBackgroundColor = rgb(0.96, 0.97, 0.99);

export async function createYouthCommonSchedulePdf({
  schedules,
}: {
  schedules: YouthCommonSchedule[];
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
      title: "공통 일정표",
    },
  ]);
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

async function createSchedulePdf(pages: SchedulePdfPage[]) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(pdfKoreanFontPath), {
    subset: false,
  });

  for (const pageInput of pages) {
    const page = pdf.addPage(a4PortraitSize);

    drawSchedulePage(page, font, pageInput);
  }

  return pdf.save();
}

function drawSchedulePage(
  page: PDFPage,
  font: PDFFont,
  { columns, schedules, subtitle, title }: SchedulePdfPage,
) {
  const { height, width } = page.getSize();
  const tableX = pageMargin;
  const tableTop = height - pageMargin - 50;
  const tableBottom = pageMargin + 14;
  const tableWidth = width - pageMargin * 2;
  const tableHeight = tableTop - tableBottom;
  const rowSlots = createSchedulePdfTimeSlots();
  const rowHeight =
    (tableHeight - tableHeaderHeight) / Math.max(rowSlots.length, 1);
  const dataColumnWidth =
    (tableWidth - timeColumnWidth) / Math.max(columns.length, 1);
  const columnWidths = [
    timeColumnWidth,
    ...columns.map(() => dataColumnWidth),
  ];

  page.drawText(title, {
    x: pageMargin,
    y: height - pageMargin - titleFontSize,
    size: titleFontSize,
    font,
    color: bodyTextColor,
  });
  page.drawText(subtitle, {
    x: pageMargin,
    y: height - pageMargin - titleFontSize - 16,
    size: subtitleFontSize,
    font,
    color: mutedTextColor,
  });

  page.drawRectangle({
    x: tableX,
    y: tableTop - tableHeaderHeight,
    width: tableWidth,
    height: tableHeaderHeight,
    color: headerBackgroundColor,
  });

  drawCellText(page, font, "시간", {
    fontSize: headerFontSize,
    height: tableHeaderHeight,
    maxLines: 1,
    width: timeColumnWidth - tableTextPadding * 2,
    x: tableX + tableTextPadding,
    y: tableTop - tableHeaderHeight,
  });

  columns.forEach((column, columnIndex) => {
    drawCellText(page, font, column.label, {
      fontSize: headerFontSize,
      height: tableHeaderHeight,
      maxLines: 1,
      width: dataColumnWidth - tableTextPadding * 2,
      x:
        tableX +
        timeColumnWidth +
        dataColumnWidth * columnIndex +
        tableTextPadding,
      y: tableTop - tableHeaderHeight,
    });
  });

  rowSlots.forEach((slot, rowIndex) => {
    const rowY = tableTop - tableHeaderHeight - rowHeight * (rowIndex + 1);

    drawCellText(page, font, slot.label, {
      color: mutedTextColor,
      fontSize: headerFontSize,
      height: rowHeight,
      maxLines: 2,
      width: timeColumnWidth - tableTextPadding * 2,
      x: tableX + tableTextPadding,
      y: rowY,
    });

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
        maxLines: Math.max(
          1,
          Math.floor((rowHeight - tableTextPadding * 2) / cellLineHeight),
        ),
        width: dataColumnWidth - tableTextPadding * 2,
        x:
          tableX +
          timeColumnWidth +
          dataColumnWidth * columnIndex +
          tableTextPadding,
        y: rowY,
      });
    });
  });

  drawTableGrid(page, {
    columnWidths,
    headerHeight: tableHeaderHeight,
    rowCount: rowSlots.length,
    rowHeight,
    tableBottom,
    tableTop,
    tableX,
  });
}

function drawTableGrid(
  page: PDFPage,
  {
    columnWidths,
    headerHeight,
    rowCount,
    rowHeight,
    tableBottom,
    tableTop,
    tableX,
  }: {
    columnWidths: number[];
    headerHeight: number;
    rowCount: number;
    rowHeight: number;
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

  for (let index = 0; index <= rowCount; index += 1) {
    const y = tableTop - headerHeight - rowHeight * index;

    page.drawLine({
      start: { x: tableX, y },
      end: { x: currentX, y },
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
    maxLines,
    width,
    x,
    y,
  }: {
    color?: ReturnType<typeof rgb>;
    fontSize: number;
    height: number;
    maxLines: number;
    width: number;
    x: number;
    y: number;
  },
) {
  if (!text.trim()) {
    return;
  }

  const lineHeight = fontSize === cellFontSize ? cellLineHeight : fontSize + 3;
  const lines = wrapText(font, text, fontSize, width, maxLines);
  let currentY = y + height - tableTextPadding - fontSize;

  for (const line of lines) {
    page.drawText(line, {
      x,
      y: currentY,
      size: fontSize,
      font,
      color,
    });
    currentY -= lineHeight;
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

  const visibleLines = lines.slice(0, maxLines);
  visibleLines[maxLines - 1] = fitTextWithEllipsis(
    font,
    visibleLines[maxLines - 1] ?? "",
    fontSize,
    maxWidth,
  );

  return visibleLines;
}

function fitTextWithEllipsis(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number,
) {
  const ellipsis = "...";
  let value = text.trimEnd();

  while (
    value &&
    font.widthOfTextAtSize(`${value}${ellipsis}`, fontSize) > maxWidth
  ) {
    value = value.slice(0, -1);
  }

  return value ? `${value}${ellipsis}` : ellipsis;
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
