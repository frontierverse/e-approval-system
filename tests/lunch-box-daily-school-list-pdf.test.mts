import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { PDFDocument, PageSizes } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createLunchBoxDailySchoolListPdf } from "../src/lib/lunch-box-daily-school-list-pdf.ts";
import {
  createLunchBoxDailyChecklistView,
  type LunchBoxCountRow,
  type LunchBoxDailySchoolChecklistData,
} from "../src/lib/lunch-box-counts-core.ts";

const dailySchoolPrintRouteSource = readFileSync(
  new URL(
    "../src/app/work-schedule/lunch-boxes/daily-school-print/route.ts",
    import.meta.url,
  ),
  "utf8",
);

describe("lunch box daily school-list PDF", () => {
  test("reproduces the live three-column checklist on one A4 landscape page", async () => {
    const rows = Array.from({ length: 41 }, (_, index) =>
      createRow({
        class1Count: index === 0 ? 10 : 1,
        class2Count: index === 1 ? 2 : 0,
        class3Count: index === 2 ? 3 : 0,
        class4Count: index === 3 ? 4 : 0,
        deliveryDriverCount: index === 4 ? 1 : 0,
        linkedCount: index === 5 ? 5 : 0,
        preservationClass: index === 0 ? 2 : null,
        preservationCount: index < 2 ? 1 : 0,
        schoolId: `school-${index + 1}`,
        schoolName:
          index === 6
            ? "아주긴학교이름을가진초등학교병설유치원"
            : `학교 ${String(index + 1).padStart(2, "0")}`,
      }),
    );
    const checklist: LunchBoxDailySchoolChecklistData = {
      checkedSchoolIds: ["school-1", "school-15", "stale-school", "school-1"],
      grid: {
        date: "2026-07-29",
        menuItems: [],
        rows: [
          ...rows,
          createRow({
            class1Count: 0,
            schoolId: "zero-school",
            schoolName: "수량없는초",
          }),
        ],
      },
    };
    const view = createLunchBoxDailyChecklistView(checklist);
    const buffer = await createLunchBoxDailySchoolListPdf({
      checklist,
      generatedAt: new Date("2026-07-27T01:00:00.000Z"),
    });
    const pdf = await PDFDocument.load(buffer);
    const [page] = pdf.getPages();
    const items = await extractPdfTextItems(buffer);
    const text = items.map((item) => item.str).join("|");
    const compactText = items.map((item) => item.str.trim()).join("");
    const schoolHeaders = items.filter((item) => item.str === "학교");
    const firstColumnSchool = findTextItem(items, "학교 01");
    const secondColumnSchool = findTextItem(items, "학교 15");
    const thirdColumnSchool = findTextItem(items, "학교 29");

    assert.equal(readPdfHeader(buffer), "%PDF");
    assert.equal(pdf.getPageCount(), 1);
    assertAlmostEqual(page.getWidth(), PageSizes.A4[1]);
    assertAlmostEqual(page.getHeight(), PageSizes.A4[0]);
    assert.equal(pdf.getTitle(), "2026.07.29.(수) 날짜별 학교 목록");
    assert.match(text, /날짜별 학교 목록/);
    assert.match(
      text,
      new RegExp(escapeRegExp(view.summaryLabel)),
    );
    assert.match(text, /체크 2\/41 \(남은 39\)/);
    assert.match(text, /1\(2\)/);
    assert.match(text, /1\(-\)/);
    assert.match(compactText, /아주긴학교이름을가진초등학교병설유치원/);
    assert.doesNotMatch(text, /수량없는초/);
    assert.equal(schoolHeaders.length, 3);
    assert.deepEqual(
      schoolHeaders.map((item) => Math.round(item.x)),
      [...schoolHeaders]
        .map((item) => Math.round(item.x))
        .sort((left, right) => left - right),
    );
    assert.ok(firstColumnSchool.x < secondColumnSchool.x);
    assert.ok(secondColumnSchool.x < thirdColumnSchool.x);
    assert.deepEqual(
      view.columns.map((column) => column.length),
      [14, 14, 13],
    );
    assert.deepEqual(view.checkedSchoolIds, ["school-1", "school-15"]);

    for (const header of [
      "보존식",
      "1반",
      "2반",
      "3반",
      "4반",
      "연계",
      "기사",
      "합계",
    ]) {
      assert.equal(
        items.filter((item) => item.str === header).length,
        3,
        `${header} 헤더는 3단마다 한 번씩 있어야 합니다.`,
      );
    }
  });

  test("creates the same compact empty state for a date without schools", async () => {
    const buffer = await createLunchBoxDailySchoolListPdf({
      checklist: {
        checkedSchoolIds: ["stale-school"],
        grid: {
          date: "2026-07-26",
          menuItems: [],
          rows: [],
        },
      },
      generatedAt: new Date("2026-07-27T01:00:00.000Z"),
    });
    const pdf = await PDFDocument.load(buffer);
    const text = (await extractPdfTextItems(buffer))
      .map((item) => item.str)
      .join("|");

    assert.equal(pdf.getPageCount(), 1);
    assert.match(text, /2026\.07\.26\.\(일\) · 0개교 · 총 0개 · 보존식 0개/);
    assert.match(text, /이 날짜에 배정된 학교가 없습니다/);
    assert.match(text, /전날이나 다음날을 확인하세요/);
  });

  test("rejects an invalid print date", async () => {
    await assert.rejects(
      createLunchBoxDailySchoolListPdf({
        checklist: {
          checkedSchoolIds: [],
          grid: { date: "2026-02-30", menuItems: [], rows: [] },
        },
        generatedAt: new Date("2026-07-27T01:00:00.000Z"),
      }),
      /인쇄 날짜가 올바르지 않습니다/,
    );
  });

  test("loads live check state and returns a non-cacheable inline PDF", () => {
    assert.match(dailySchoolPrintRouteSource, /await requireUser\(\)/);
    assert.match(
      dailySchoolPrintRouteSource,
      /getLunchBoxDailySchoolChecklist\(\{ date \}\)/,
    );
    assert.match(
      dailySchoolPrintRouteSource,
      /createLunchBoxDailySchoolListPdf/,
    );
    assert.match(dailySchoolPrintRouteSource, /"Cache-Control": "no-store"/);
    assert.match(
      dailySchoolPrintRouteSource,
      /"Content-Disposition": `inline;/,
    );
    assert.match(
      dailySchoolPrintRouteSource,
      /"Content-Type": "application\/pdf"/,
    );
  });
});

function createRow({
  class1Count = 0,
  class2Count = 0,
  class3Count = 0,
  class4Count = 0,
  deliveryDriverCount = 0,
  linkedCount = 0,
  preservationClass = null,
  preservationCount = 0,
  schoolId,
  schoolName,
}: Partial<
  Pick<
    LunchBoxCountRow,
    | "class1Count"
    | "class2Count"
    | "class3Count"
    | "class4Count"
    | "deliveryDriverCount"
    | "linkedCount"
    | "preservationClass"
    | "preservationCount"
  >
> &
  Pick<LunchBoxCountRow, "schoolId" | "schoolName">): LunchBoxCountRow {
  return {
    class1Count,
    class2Count,
    class3Count,
    class4Count,
    deliveryDriverCount,
    linkedCount,
    preservationClass,
    preservationCount,
    schoolId,
    schoolName,
    schoolType: "elementary",
  };
}

function readPdfHeader(buffer: Uint8Array) {
  return String.fromCharCode(...buffer.slice(0, 4));
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTextItem(
  items: Awaited<ReturnType<typeof extractPdfTextItems>>,
  value: string,
) {
  const item = items.find((candidate) => candidate.str === value);

  assert.ok(item, `${value} 텍스트를 PDF에서 찾을 수 없습니다.`);
  return item;
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
