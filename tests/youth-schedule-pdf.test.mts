import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, PageSizes } from "pdf-lib";
import {
  createWorkSchedulePdf,
  createYouthCommonSchedulePdf,
  createYouthLearningProgressPdf,
} from "../src/lib/youth-schedule-pdf.ts";
import type {
  YouthCommonSchedule,
  YouthLearningSchedule,
  YouthProfile,
} from "../src/lib/youth-management-core.ts";

GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.mjs",
  ),
).href;

const commonSchedules: YouthCommonSchedule[] = [
  {
    id: "common-001",
    weekday: 1,
    startHour: 9,
    startMinute: 540,
    endHour: 10,
    endMinute: 600,
    content: "공용 자습",
  },
];

const youths: YouthProfile[] = Array.from({ length: 5 }, (_, index) => ({
  id: `youth-${index + 1}`,
  name: `학생 ${index + 1}`,
  admissionDate: null,
  dischargeDate: null,
  birthDate: null,
  age: null,
  phone: null,
  familyContacts: [],
  notes: [],
}));

const learningSchedules: YouthLearningSchedule[] = [
  {
    id: "learning-001",
    youthId: "youth-1",
    scheduleDate: "2026-06-18",
    startHour: 9,
    startMinute: 540,
    endHour: 11,
    endMinute: 630,
    content: "수학 문제집 12쪽",
    repeatsWeekly: false,
    recurrenceSourceDate: null,
    recurrenceWeekdays: [],
  },
];

const commonSchedulePdfPageMargin = 32;
const commonSchedulePdfTableHeaderHeight = 36;
const commonSchedulePdfTimeColumnWidth = 92;
const commonSchedulePdfTableTopOffset = 18;
const commonScheduleWeekdayLabels = [
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
];

describe("youth schedule PDFs", () => {
  test("creates an inline-printable common schedule PDF", async () => {
    const buffer = await createYouthCommonSchedulePdf({
      schedules: commonSchedules,
    });
    const pdf = await PDFDocument.load(buffer);

    assert.equal(readPdfHeader(buffer), "%PDF");
    assert.equal(pdf.getPageCount(), 1);
    assertA4PortraitPages(pdf);
  });

  test("creates landscape common schedule PDFs when requested", async () => {
    const buffer = await createYouthCommonSchedulePdf({
      orientation: "landscape",
      schedules: commonSchedules,
    });
    const pdf = await PDFDocument.load(buffer);

    assert.equal(readPdfHeader(buffer), "%PDF");
    assert.equal(pdf.getPageCount(), 1);
    assertA4LandscapePages(pdf);
  });

  test("creates work schedule PDFs with the common timetable layout", async () => {
    const buffer = await createWorkSchedulePdf({
      schedules: commonSchedules,
    });
    const pdf = await PDFDocument.load(buffer);
    const text = await extractPdfText(buffer);

    assert.equal(readPdfHeader(buffer), "%PDF");
    assert.equal(pdf.getPageCount(), 1);
    assertA4PortraitPages(pdf);
    assert.match(text, /월요일/);
    assert.match(text, /공용 자습/);
    assert.doesNotMatch(text, /업무 일정표/);
  });

  test("keeps timetable PDF headers clean and time labels in the row header", async () => {
    const buffer = await createYouthCommonSchedulePdf({
      schedules: commonSchedules,
    });
    const text = await extractPdfText(buffer);
    const items = await extractPdfTextItems(buffer);
    const timeLabel = items.find((item) => item.str === "09:00 - 10:00");
    const scheduleContent = items.find((item) => item.str === "공용 자습");

    assert.match(text, /시간/);
    assert.match(text, /월요일/);
    assert.doesNotMatch(text, /공통 일정표/);
    assert.doesNotMatch(text, /오전 9시부터 오후 6시까지/);
    assert.doesNotMatch(text, /토요일/);
    assert.doesNotMatch(text, /일요일/);
    assert.doesNotMatch(text, /시간\.\.\./);
    assert.doesNotMatch(text, /월요일\.\.\./);
    assert.match(text, /공용 자습/);
    assert.equal((text.match(/09:00 - 10:00/g) ?? []).length, 1);
    assert.ok(timeLabel, "expected first time label to exist");
    assertAlmostEqual(timeLabel.height, 10);
    assert.ok(scheduleContent, "expected schedule content to exist");
    assertAlmostEqual(scheduleContent.height, 13);
  });

  test("compresses the common schedule lunch row", async () => {
    const buffer = await createYouthCommonSchedulePdf({
      schedules: commonSchedules,
    });
    const items = await extractPdfTextItems(buffer);
    const previousRow = items.find((item) => item.str === "11:00 - 12:00");
    const lunchRow = items.find((item) => item.str === "12:00 - 13:00");
    const nextRow = items.find((item) => item.str === "13:00 - 14:00");

    assert.ok(previousRow, "expected pre-lunch time label to exist");
    assert.ok(lunchRow, "expected lunch time label to exist");
    assert.ok(nextRow, "expected post-lunch time label to exist");

    const regularRowHeight = previousRow.y - lunchRow.y;
    const lunchRowHeight = lunchRow.y - nextRow.y;

    assert.ok(
      lunchRowHeight < regularRowHeight * 0.35,
      `expected lunch row height ${lunchRowHeight} to be much smaller than regular row height ${regularRowHeight}`,
    );
  });

  test("does not add ellipses to common schedule text", async () => {
    const buffer = await createYouthCommonSchedulePdf({
      schedules: [
        {
          ...commonSchedules[0],
          content: "중등 수학 심화 보강 오답 정리",
        },
      ],
    });
    const text = await extractPdfText(buffer);

    assert.match(text, /중등 수학/);
    assert.doesNotMatch(text, /\.{2,}/);
  });

  test("centers common schedule weekday headers in their cells", async () => {
    const buffer = await createYouthCommonSchedulePdf({
      schedules: commonSchedules,
    });
    const items = await extractPdfTextItems(buffer);
    const tableWidth = PageSizes.A4[0] - commonSchedulePdfPageMargin * 2;
    const dataColumnWidth =
      (tableWidth - commonSchedulePdfTimeColumnWidth) /
      commonScheduleWeekdayLabels.length;
    const headerBottom =
      PageSizes.A4[1] -
      commonSchedulePdfPageMargin -
      commonSchedulePdfTableTopOffset -
      commonSchedulePdfTableHeaderHeight;
    const headerCenterY = headerBottom + commonSchedulePdfTableHeaderHeight / 2;

    commonScheduleWeekdayLabels.forEach((label, index) => {
      const item = items.find((candidate) => candidate.str === label);

      assert.ok(item, `expected ${label} header to exist`);

      const cellLeft =
        commonSchedulePdfPageMargin +
        commonSchedulePdfTimeColumnWidth +
        dataColumnWidth * index;
      const cellCenterX = cellLeft + dataColumnWidth / 2;

      assertAlmostEqual(item.x + item.width / 2, cellCenterX, 0.1);
      assertAlmostEqual(item.y + item.height / 2, headerCenterY, 0.1);
    });
  });

  test("creates learning progress PDFs across student column pages", async () => {
    const buffer = await createYouthLearningProgressPdf({
      schedules: learningSchedules,
      selectedDate: "2026-06-18",
      youths,
    });
    const pdf = await PDFDocument.load(buffer);

    assert.equal(readPdfHeader(buffer), "%PDF");
    assert.equal(pdf.getPageCount(), 2);
    assertA4PortraitPages(pdf);
  });
});

function readPdfHeader(buffer: Uint8Array) {
  return String.fromCharCode(...buffer.slice(0, 4));
}

function assertA4PortraitPages(pdf: PDFDocument) {
  for (const page of pdf.getPages()) {
    const { height, width } = page.getSize();

    assertAlmostEqual(width, PageSizes.A4[0]);
    assertAlmostEqual(height, PageSizes.A4[1]);
  }
}

function assertA4LandscapePages(pdf: PDFDocument) {
  for (const page of pdf.getPages()) {
    const { height, width } = page.getSize();

    assertAlmostEqual(width, PageSizes.A4[1]);
    assertAlmostEqual(height, PageSizes.A4[0]);
  }
}

function assertAlmostEqual(actual: number, expected: number, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `expected ${actual} to be close to ${expected}`,
  );
}

async function extractPdfText(buffer: Uint8Array) {
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const texts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      texts.push(
        ...content.items
          .map((item) => ("str" in item ? item.str : ""))
          .filter(Boolean),
      );
    }
  } finally {
    await loadingTask.destroy();
  }

  return texts.join("|");
}

async function extractPdfTextItems(buffer: Uint8Array) {
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const items: Array<{
    height: number;
    str: string;
    width: number;
    x: number;
    y: number;
  }> = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      for (const item of content.items) {
        if (!("str" in item) || !item.str) {
          continue;
        }

        items.push({
          height: item.height,
          str: item.str,
          width: item.width,
          x: item.transform[4],
          y: item.transform[5],
        });
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  return items;
}
