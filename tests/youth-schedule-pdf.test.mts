import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, PageSizes } from "pdf-lib";
import {
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

  test("keeps timetable PDF headers clean and time labels in the row header", async () => {
    const buffer = await createYouthCommonSchedulePdf({
      schedules: commonSchedules,
    });
    const text = await extractPdfText(buffer);

    assert.match(text, /시간/);
    assert.match(text, /월요일/);
    assert.doesNotMatch(text, /시간\.\.\./);
    assert.doesNotMatch(text, /월요일\.\.\./);
    assert.equal((text.match(/09:00 - 10:00/g) ?? []).length, 1);
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

function assertAlmostEqual(actual: number, expected: number) {
  assert.ok(
    Math.abs(actual - expected) < 0.01,
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
