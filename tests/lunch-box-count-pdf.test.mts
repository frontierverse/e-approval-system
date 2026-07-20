import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PDFDocument, PageSizes } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createLunchBoxCountPdf } from "../src/lib/lunch-box-count-pdf.ts";
import type { LunchBoxCountGrid } from "../src/lib/lunch-box-counts-core.ts";

const pageMargin = 34;

describe("lunch box count PDF", () => {
  test("creates a readable A4 portrait PDF for the selected date", async () => {
    const grid: LunchBoxCountGrid = {
      date: "2026-07-29",
      rows: [
        ...Array.from({ length: 41 }, (_, index) => ({
          schoolId: `school-${index + 1}`,
          schoolName:
            index === 0
              ? "동남초 병설유치원"
              : `납품 학교 ${index + 1}`,
          schoolType: index === 0 ? ("kindergarten" as const) : ("elementary" as const),
          class1Count: index === 0 ? 16 : 1,
          class2Count: index === 0 ? 15 : 0,
          class3Count: index === 0 ? 14 : 0,
          class4Count: 0,
          deliveryDriverCount: index === 0 ? 1 : index === 1 ? 2 : 0,
          linkedCount: 0,
          preservationClass: index === 0 ? null : (2 as const),
          preservationCount: index < 2 ? 1 : 0,
        })),
        {
          schoolId: "school-zero",
          schoolName: "미납품 학교",
          schoolType: "elementary",
          class1Count: 0,
          class2Count: 0,
          class3Count: 0,
          class4Count: 0,
          deliveryDriverCount: 0,
          linkedCount: 0,
          preservationClass: null,
          preservationCount: 0,
        },
      ],
    };
    const generatedAt = new Date("2026-07-17T05:05:00.000Z");
    const buffer = await createLunchBoxCountPdf({ generatedAt, grid });
    const pdf = await PDFDocument.load(buffer);
    const text = await extractPdfText(buffer);
    const items = await extractPdfTextItems(buffer);
    const generatedLabel = items.find((item) =>
      item.str.startsWith("PDF 생성 2026.07.17. 14:05"),
    );

    assert.equal(readPdfHeader(buffer), "%PDF");
    assert.equal(pdf.getPageCount(), 2);
    assertA4PortraitPages(pdf);
    assert.match(text, /도시락 납품 현황/);
    assert.match(text, /2026년 7월 29일 \(수요일\)/);
    assert.match(text, /PDF 생성 2026\.07\.17\. 14:05/);
    assert.match(text, /납품 학교\|\s*\|41곳/);
    assert.match(text, /총 도시락\|\s*\|90개/);
    assert.match(text, /보존식/);
    assert.match(text, /배송기사/);
    assert.match(text, /1 \(2반\)/);
    assert.ok(
      text.indexOf("보존식") < text.indexOf("배송기사") &&
        text.indexOf("배송기사") < text.indexOf("1반"),
      "PDF 열은 보존식, 배송기사, 1반 순서여야 합니다.",
    );
    assert.match(text, /합계는 보존식·배송기사 포함/);
    assert.match(text, /동남초 병설유치원/);
    assert.match(text, /납품 학교 41/);
    assert.doesNotMatch(text, /미납품 학교/);
    assert.match(text, /1 \/ 2/);
    assert.match(text, /2 \/ 2/);
    assert.ok(generatedLabel, "expected the generated timestamp to exist");
    assertAlmostEqual(
      generatedLabel.x + generatedLabel.width,
      PageSizes.A4[0] - pageMargin,
      0.5,
    );
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

function assertAlmostEqual(
  actual: number,
  expected: number,
  tolerance = 0.01,
) {
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
