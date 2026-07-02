import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PDFDocument, PageSizes } from "pdf-lib";
import { createQuestionWorksheetPdf } from "../src/lib/question-bank-pdf.ts";
import type { QuestionWorksheetPdfData } from "../src/lib/question-bank.ts";

const worksheet: QuestionWorksheetPdfData = {
  id: "worksheet-001",
  title: "일차방정식 형성평가",
  subject: "수학",
  gradeLevel: "중2",
  unitName: "일차방정식",
  questionCount: 2,
  includeAnswers: true,
  createdAt: new Date("2026-07-02T09:00:00+09:00"),
  problems: [
    {
      order: 1,
      body: "다음 방정식 2x + 3 = 7을 풀어라.",
      choices: "x = 1\nx = 2\nx = 3\nx = 4",
      answer: "x = 2",
      explanation: "양변에서 3을 빼고 2로 나눈다.",
      difficulty: 1,
      problemType: "multiple-choice",
    },
    {
      order: 2,
      body: "3(x - 1) = 12를 만족하는 x의 값을 구하여라.",
      choices: null,
      answer: "x = 5",
      explanation: "양변을 3으로 나누면 x - 1 = 4이다.",
      difficulty: 2,
      problemType: "short-answer",
    },
  ],
};

describe("question bank PDF", () => {
  test("creates a readable worksheet PDF", async () => {
    const buffer = await createQuestionWorksheetPdf(worksheet);
    const pdf = await PDFDocument.load(buffer);

    assert.equal(readPdfHeader(buffer), "%PDF");
    assert.equal(pdf.getPageCount(), 1);
    assertA4PortraitPages(pdf);
  });
});

function readPdfHeader(buffer: Uint8Array) {
  return Buffer.from(buffer.subarray(0, 4)).toString("utf8");
}

function assertA4PortraitPages(pdf: PDFDocument) {
  for (const page of pdf.getPages()) {
    const { height, width } = page.getSize();

    assert.equal(Math.round(width), Math.round(PageSizes.A4[0]));
    assert.equal(Math.round(height), Math.round(PageSizes.A4[1]));
  }
}
