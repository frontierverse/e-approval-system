import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  createYouthCommonSchedulePdf,
  createYouthLearningProgressPdf,
} from "../src/lib/youth-schedule-pdf.ts";
import type {
  YouthCommonSchedule,
  YouthLearningSchedule,
  YouthProfile,
} from "../src/lib/youth-management-core.ts";

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
  });
});

function readPdfHeader(buffer: Uint8Array) {
  return String.fromCharCode(...buffer.slice(0, 4));
}
