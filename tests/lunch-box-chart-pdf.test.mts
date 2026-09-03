import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, PageSizes } from "pdf-lib";
import { createLunchBoxChartPdf } from "../src/lib/lunch-box-chart-pdf.ts";
import { createLunchBoxHiredWorkerPdf } from "../src/lib/lunch-box-hired-worker-pdf.ts";
import type {
  LunchBoxChartData,
  LunchBoxChartPoint,
} from "../src/lib/lunch-box-counts-core.ts";
import {
  createLunchBoxOperationsChartData,
  type LunchBoxOperationsChartData,
} from "../src/lib/lunch-box-operations-core.ts";

const chartPrintRouteSource = readFileSync(
  new URL(
    "../src/app/work-schedule/lunch-boxes/chart-print/route.ts",
    import.meta.url,
  ),
  "utf8",
);

const serviceDates = ["2026-07-16", "2026-07-20", "2026-07-21"];

describe("lunch box chart PDFs", () => {
  test("prints the total chart in both orientations with the selected preservation calculation", async () => {
    const data = createChartData(2);
    const includedBuffer = await createLunchBoxChartPdf({
      chart: "total",
      data,
      generatedAt: new Date("2026-07-29T01:30:00.000Z"),
      includePreservation: true,
      orientation: "portrait",
    });
    const excludedBuffer = await createLunchBoxChartPdf({
      chart: "total",
      data,
      generatedAt: new Date("2026-07-29T01:30:00.000Z"),
      includePreservation: false,
      orientation: "landscape",
    });
    const includedPdf = await PDFDocument.load(includedBuffer);
    const excludedPdf = await PDFDocument.load(excludedBuffer);
    const includedText = await extractPdfText(includedBuffer);
    const excludedText = await extractPdfText(excludedBuffer);

    assert.equal(readPdfHeader(includedBuffer), "%PDF");
    assert.equal(includedPdf.getPageCount(), 1);
    assertA4PortraitPages(includedPdf);
    assert.equal(excludedPdf.getPageCount(), 1);
    assertA4LandscapePages(excludedPdf);
    assert.match(includedText, /도시락 일자별 총수량 추이/);
    assert.match(includedText, /보존식 포함/);
    assert.match(includedText, /기간합계 300개/);
    assert.match(excludedText, /보존식 제외/);
    assert.match(excludedText, /기간합계 294개/);
    assert.match(includedText, /7\/16\(목\)/);
    assert.match(includedText, /7\/20\(월\)/);
    assert.match(includedText, /7\/21\(화\)/);
    assert.doesNotMatch(includedText, /7\/17|7\/18|7\/19/);
  });

  test("paginates every school by orientation and keeps one common y-axis", async () => {
    const data = createChartData(18);
    data.schoolSeries[17].points[1] = {
      date: serviceDates[1],
      preservationCount: 1,
      totalCount: 500,
    };
    const landscapeBuffer = await createLunchBoxChartPdf({
      chart: "schools",
      data,
      generatedAt: new Date("2026-07-29T01:30:00.000Z"),
      includePreservation: true,
      orientation: "landscape",
    });
    const portraitBuffer = await createLunchBoxChartPdf({
      chart: "schools",
      data,
      generatedAt: new Date("2026-07-29T01:30:00.000Z"),
      includePreservation: false,
      orientation: "portrait",
    });
    const landscapePdf = await PDFDocument.load(landscapeBuffer);
    const portraitPdf = await PDFDocument.load(portraitBuffer);
    const landscapePages = await extractPdfPageTexts(landscapeBuffer);
    const portraitPages = await extractPdfPageTexts(portraitBuffer);
    const allLandscapeText = landscapePages.join("|");
    const allPortraitText = portraitPages.join("|");

    assert.equal(landscapePdf.getPageCount(), 2);
    assertA4LandscapePages(landscapePdf);
    assert.equal(portraitPdf.getPageCount(), 3);
    assertA4PortraitPages(portraitPdf);
    assert.match(landscapePages[0], /학교 1~10 · 1\/2쪽/);
    assert.match(landscapePages[1], /학교 11~18 · 2\/2쪽/);
    assert.match(portraitPages[0], /학교 1~8 · 1\/3쪽/);
    assert.match(portraitPages[1], /학교 9~16 · 2\/3쪽/);
    assert.match(portraitPages[2], /학교 17~18 · 3\/3쪽/);

    for (const [index, pageText] of landscapePages.entries()) {
      assert.match(pageText, /도시락 학교별 수량 추이/);
      assert.match(pageText, /2026\.07\.16\. ~ 2026\.07\.21\./);
      assert.match(pageText, /보존식 포함/);
      assert.match(pageText, /7\/16\(목\)/);
      assert.match(pageText, /7\/20\(월\)/);
      assert.match(pageText, /7\/21\(화\)/);
      assert.match(
        pageText,
        /500/,
        `landscape page ${index + 1} should use the shared maximum`,
      );
    }

    for (const pageText of portraitPages) {
      assert.match(pageText, /도시락 학교별 수량 추이/);
      assert.match(pageText, /보존식 제외/);
      assert.match(pageText, /500/);
    }

    for (let index = 1; index <= 18; index += 1) {
      const schoolName = `학교 ${String(index).padStart(2, "0")}`;

      assert.match(allLandscapeText, new RegExp(schoolName));
      assert.match(allPortraitText, new RegExp(schoolName));
    }
  });

  test("creates a compact printable empty state", async () => {
    const buffer = await createLunchBoxChartPdf({
      chart: "schools",
      data: {
        dailySeries: [],
        endDate: null,
        schoolSeries: [],
        serviceDates: [],
        startDate: null,
      },
      generatedAt: new Date("2026-07-29T01:30:00.000Z"),
      includePreservation: true,
      orientation: "portrait",
    });
    const pdf = await PDFDocument.load(buffer);
    const text = await extractPdfText(buffer);

    assert.equal(pdf.getPageCount(), 1);
    assert.match(text, /공급 기간 없음/);
    assert.match(text, /표시할 학교 없음/);
    assert.match(text, /표시할 도시락 공급 데이터가 없습니다/);
  });

  test("prints hired-worker charts, totals, and exact work details in both orientations", async () => {
    const data = createHiredWorkerChartData();
    const portraitBuffer = await createLunchBoxHiredWorkerPdf({
      data,
      generatedAt: new Date("2026-08-24T01:30:00.000Z"),
      orientation: "portrait",
    });
    const landscapeBuffer = await createLunchBoxHiredWorkerPdf({
      data,
      generatedAt: new Date("2026-08-24T01:30:00.000Z"),
      orientation: "landscape",
    });
    const portraitPdf = await PDFDocument.load(portraitBuffer);
    const landscapePdf = await PDFDocument.load(landscapeBuffer);
    const portraitText = await extractPdfText(portraitBuffer);
    const landscapeText = await extractPdfText(landscapeBuffer);

    assert.equal(readPdfHeader(portraitBuffer), "%PDF");
    assertA4PortraitPages(portraitPdf);
    assertA4LandscapePages(landscapePdf);
    assert.equal(
      portraitPdf.getTitle(),
      "별도 고용 인력 근무·지급 현황",
    );

    for (const text of [portraitText, landscapeText]) {
      assert.match(text, /별도 고용 인력 근무·지급 현황/);
      assert.match(text, /전체 고용비/);
      assert.match(text, /255,000원/);
      assert.match(text, /고용 인력/);
      assert.match(text, /2명/);
      assert.match(text, /고용 기록일/);
      assert.match(text, /3일/);
      assert.match(text, /총 근무시간/);
      assert.match(text, /16시간 30분/);
      assert.match(text, /일별 고용비 합계/);
      assert.match(text, /인력별 누계/);
      assert.match(text, /날짜별 근무·지급 내역/);
      assert.match(text, /김하늘/);
      assert.match(text, /박지민/);
      assert.match(text, /150,000원/);
      assert.match(text, /105,000원/);
      assert.match(text, /07:30~10:00/);
      assert.match(text, /10:30~12:30/);
      assert.match(text, /08:00~11:00/);
      assert.match(text, /4시간 30분/);
      assert.match(text, /70,000원/);
      assert.match(text, /7시간 30분/);
      assert.match(text, /115,000원/);
      assert.doesNotMatch(text, /식재료|보존식/);
    }
  });

  test("creates a one-page hired-worker empty document with zero totals", async () => {
    const buffer = await createLunchBoxHiredWorkerPdf({
      data: createEmptyHiredWorkerChartData(),
      generatedAt: new Date("2026-08-24T01:30:00.000Z"),
      orientation: "portrait",
    });
    const pdf = await PDFDocument.load(buffer);
    const text = await extractPdfText(buffer);

    assert.equal(pdf.getPageCount(), 1);
    assert.match(text, /고용 기록 기간 없음/);
    assert.match(text, /전체 고용비/);
    assert.match(text, /0원/);
    assert.match(text, /표시할 별도 고용 근무 기록이 없습니다/);
  });

  test("paginates many hired workers without dropping chart or detail rows", async () => {
    const workerCount = 10;
    const data = createManyHiredWorkerChartData(workerCount);
    const buffer = await createLunchBoxHiredWorkerPdf({
      data,
      generatedAt: new Date("2026-08-24T01:30:00.000Z"),
      orientation: "landscape",
    });
    const pdf = await PDFDocument.load(buffer);
    const text = await extractPdfText(buffer);

    assert.ok(pdf.getPageCount() > 1);
    assertA4LandscapePages(pdf);
    assert.match(text, /차트 1\/2/);
    assert.match(text, /차트 2\/2/);
    assert.match(text, /고용 인력 10~10 \/ 10명/);

    for (let index = 1; index <= workerCount; index += 1) {
      assert.match(
        text,
        new RegExp(`예시 인력 ${String(index).padStart(2, "0")}`),
      );
    }
  });

  test("uses an authenticated non-cacheable route that reloads current database data", () => {
    assert.match(chartPrintRouteSource, /export const dynamic = "force-dynamic"/);
    assert.match(chartPrintRouteSource, /export const runtime = "nodejs"/);
    assert.match(chartPrintRouteSource, /await requireUser\(\)/);
    assert.match(
      chartPrintRouteSource,
      /const data = await getLunchBoxChartData\(\)/,
    );
    assert.match(
      chartPrintRouteSource,
      /chart === "operations"[\s\S]*?getLunchBoxOperationsChartData\(\)/,
    );
    assert.match(chartPrintRouteSource, /createLunchBoxHiredWorkerPdf/);
    assert.match(
      chartPrintRouteSource,
      /value === "operations"/,
    );
    assert.match(
      chartPrintRouteSource,
      /searchParams\.get\("chart"\)/,
    );
    assert.match(
      chartPrintRouteSource,
      /searchParams\.get\("orientation"\)/,
    );
    assert.match(
      chartPrintRouteSource,
      /searchParams\.get\("preservation"\) !== "exclude"/,
    );
    assert.match(chartPrintRouteSource, /"Cache-Control": "no-store"/);
    assert.match(
      chartPrintRouteSource,
      /"Content-Disposition": `inline;/,
    );
    assert.match(
      chartPrintRouteSource,
      /"Content-Type": "application\/pdf"/,
    );
  });
});

function createChartData(schoolCount: number): LunchBoxChartData {
  const dailySeries: LunchBoxChartPoint[] = [
    { date: serviceDates[0], preservationCount: 2, totalCount: 100 },
    { date: serviceDates[1], preservationCount: 3, totalCount: 120 },
    { date: serviceDates[2], preservationCount: 1, totalCount: 80 },
  ];

  return {
    dailySeries,
    endDate: serviceDates.at(-1) ?? null,
    schoolSeries: Array.from({ length: schoolCount }, (_, index) => ({
      schoolId: `school-${index + 1}`,
      schoolName: `학교 ${String(index + 1).padStart(2, "0")}`,
      schoolType: index % 7 === 0 ? "kindergarten" : "elementary",
      points: serviceDates.map((date, pointIndex) => ({
        date,
        preservationCount: 1,
        totalCount: 12 + index * 2 + pointIndex,
      })),
    })),
    serviceDates: [...serviceDates],
    startDate: serviceDates[0],
  };
}

function createHiredWorkerChartData(): LunchBoxOperationsChartData {
  return createLunchBoxOperationsChartData([
    {
      date: "2026-07-31",
      workShifts: [
        {
          workerType: "TEMPORARY",
          workerName: "김하늘",
          startTime: "07:30",
          endTime: "10:00",
          laborCost: 40_000,
        },
        {
          workerType: "TEMPORARY",
          workerName: "김하늘",
          startTime: "10:30",
          endTime: "12:30",
          laborCost: 30_000,
        },
        {
          workerType: "TEMPORARY",
          workerName: "박지민",
          startTime: "08:00",
          endTime: "11:00",
          laborCost: 45_000,
        },
      ],
    },
    {
      date: "2026-08-03",
      workShifts: [
        {
          workerType: "TEMPORARY",
          workerName: "김하늘",
          startTime: "07:00",
          endTime: "12:00",
          laborCost: 80_000,
        },
      ],
    },
    {
      date: "2026-08-18",
      workShifts: [
        {
          workerType: "TEMPORARY",
          workerName: "박지민",
          startTime: "08:00",
          endTime: "12:00",
          laborCost: 60_000,
        },
      ],
    },
  ]);
}

function createEmptyHiredWorkerChartData(): LunchBoxOperationsChartData {
  return {
    endDate: null,
    points: [],
    startDate: null,
    totalLaborCost: 0,
    totalMinutes: 0,
    workerNames: [],
    workerSummaries: [],
  };
}

function createManyHiredWorkerChartData(
  workerCount: number,
): LunchBoxOperationsChartData {
  return createLunchBoxOperationsChartData([
    {
      date: "2026-08-24",
      workShifts: Array.from({ length: workerCount }, (_, index) => ({
        workerType: "TEMPORARY" as const,
        workerName: `예시 인력 ${String(index + 1).padStart(2, "0")}`,
        startTime: "08:00",
        endTime: "12:00",
        laborCost: 40_000 + index * 1_000,
      })),
    },
  ]);
}

function readPdfHeader(buffer: Uint8Array) {
  return String.fromCharCode(...buffer.slice(0, 4));
}

function assertA4PortraitPages(pdf: PDFDocument) {
  for (const page of pdf.getPages()) {
    assertAlmostEqual(page.getWidth(), PageSizes.A4[0]);
    assertAlmostEqual(page.getHeight(), PageSizes.A4[1]);
  }
}

function assertA4LandscapePages(pdf: PDFDocument) {
  for (const page of pdf.getPages()) {
    assertAlmostEqual(page.getWidth(), PageSizes.A4[1]);
    assertAlmostEqual(page.getHeight(), PageSizes.A4[0]);
  }
}

function assertAlmostEqual(actual: number, expected: number, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `expected ${actual} to be close to ${expected}`,
  );
}

async function extractPdfText(buffer: Uint8Array) {
  return (await extractPdfPageTexts(buffer)).join("|");
}

async function extractPdfPageTexts(buffer: Uint8Array) {
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .filter(Boolean)
          .join("|"),
      );
    }
  } finally {
    await loadingTask.destroy();
  }

  return pages;
}
