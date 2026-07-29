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
  test("keeps the live three-column checklist on page one and appends the serving order", async () => {
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
    const [page, servingOrderPage] = pdf.getPages();
    const items = await extractPdfTextItems(buffer);
    const firstPageItems = items.filter((item) => item.pageNumber === 1);
    const secondPageItems = items.filter((item) => item.pageNumber === 2);
    const text = firstPageItems.map((item) => item.str).join("|");
    const secondPageText = secondPageItems
      .map((item) => item.str)
      .join("|");
    const compactText = firstPageItems
      .map((item) => item.str.trim())
      .join("");
    const schoolHeaders = firstPageItems.filter(
      (item) => item.str === "학교",
    );
    const firstColumnSchool = findTextItem(firstPageItems, "학교 01");
    const secondColumnSchool = findTextItem(firstPageItems, "학교 15");
    const thirdColumnSchool = findTextItem(firstPageItems, "학교 29");

    assert.equal(readPdfHeader(buffer), "%PDF");
    assert.equal(pdf.getPageCount(), 2);
    assertAlmostEqual(page.getWidth(), PageSizes.A4[1]);
    assertAlmostEqual(page.getHeight(), PageSizes.A4[0]);
    assertAlmostEqual(servingOrderPage.getWidth(), PageSizes.A4[1]);
    assertAlmostEqual(servingOrderPage.getHeight(), PageSizes.A4[0]);
    assert.equal(pdf.getTitle(), "2026.07.29.(수) 날짜별 학교 목록");
    assert.match(text, /날짜별 학교 목록/);
    assert.doesNotMatch(text, /대용량 보냉백 배치 순서/);
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
    assert.match(secondPageText, /대용량 보냉백 배치 순서/);
    assert.match(secondPageText, /배식 목록/);
    assert.match(secondPageText, /도시락 포장 목록/);
    assert.match(secondPageText, /학교 01/);
    assert.match(secondPageText, /1반/);
    assert.match(secondPageText, /10개/);
    assert.match(secondPageText, /남초·병설 포장 항목이 없습니다/);
    assert.match(text, /1 \/ 2/);
    assert.match(secondPageText, /2 \/ 2/);

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
        firstPageItems.filter((item) => item.str === header).length,
        3,
        `${header} 헤더는 3단마다 한 번씩 있어야 합니다.`,
      );
    }
  });

  test("sorts classes by serving count and isolates Namcho and kindergartens in the packing list", async () => {
    const checklist: LunchBoxDailySchoolChecklistData = {
      checkedSchoolIds: [],
      grid: {
        date: "2026-08-03",
        menuItems: [],
        rows: [
          createRow({
            class1Count: 12,
            class2Count: 30,
            schoolId: "regular-a",
            schoolName: "일반A초",
          }),
          createRow({
            class1Count: 40,
            schoolId: "dongnam",
            schoolName: "동남초",
          }),
          createRow({
            class3Count: 30,
            linkedCount: 8,
            schoolId: "regular-b",
            schoolName: "일반B초",
          }),
          createRow({
            class1Count: 45,
            schoolId: "namcho",
            schoolName: "이리남초",
          }),
          createRow({
            class1Count: 50,
            schoolId: "kindergarten",
            schoolName: "모현초 병설유치원",
            schoolType: "kindergarten",
          }),
          createRow({
            deliveryDriverCount: 900,
            preservationCount: 800,
            schoolId: "non-serving",
            schoolName: "배식없는초",
          }),
        ],
      },
    };
    const buffer = await createLunchBoxDailySchoolListPdf({
      checklist,
      generatedAt: new Date("2026-07-27T01:00:00.000Z"),
    });
    const pdf = await PDFDocument.load(buffer);
    const secondPageItems = (await extractPdfTextItems(buffer)).filter(
      (item) => item.pageNumber === 2,
    );
    const secondPageText = secondPageItems
      .map((item) => item.str)
      .join("|");
    const orderedCounts = secondPageItems
      .filter((item) => /^(?:50|45|40|30|12|8)개$/.test(item.str))
      .map((item) => item.str);
    const dongnamItem = findTextItem(secondPageItems, "동남초");
    const namchoItem = findTextItem(secondPageItems, "이리남초");
    const kindergartenItem = findTextItem(
      secondPageItems,
      "모현초 병설유치원",
    );
    const packingSectionBoundary = PageSizes.A4[1] * 0.7;

    assert.equal(pdf.getPageCount(), 2);
    assert.match(secondPageText, /배식 목록 · 5개 반 \/ 120개/);
    assert.match(secondPageText, /도시락 포장 목록 · 2건 \/ 95개/);
    assert.match(secondPageText, /연계형/);
    assert.doesNotMatch(secondPageText, /배식없는초/);
    assert.doesNotMatch(secondPageText, /보존식|배송기사|기사/);
    assert.deepEqual(orderedCounts, [
      "40개",
      "30개",
      "30개",
      "12개",
      "8개",
      "50개",
      "45개",
    ]);
    assert.ok(dongnamItem.x < packingSectionBoundary);
    assert.ok(namchoItem.x > packingSectionBoundary);
    assert.ok(kindergartenItem.x > packingSectionBoundary);
  });

  test("fits the peak operating volume on the second landscape page", async () => {
    const regularRows = Array.from({ length: 31 }, (_, index) =>
      createRow({
        class1Count: 20,
        class2Count: 10,
        schoolId: `peak-regular-${index + 1}`,
        schoolName: `피크학교 ${String(index + 1).padStart(2, "0")}초`,
      }),
    );
    const packingRows = [
      createRow({
        class1Count: 14,
        schoolId: "peak-namcho",
        schoolName: "남초",
      }),
      ...Array.from({ length: 6 }, (_, index) =>
        createRow({
          class1Count: 5 + index,
          schoolId: `peak-kindergarten-${index + 1}`,
          schoolName: `피크학교 ${index + 1}초 병설유치원`,
          schoolType: "kindergarten",
        }),
      ),
    ];
    const buffer = await createLunchBoxDailySchoolListPdf({
      checklist: {
        checkedSchoolIds: [],
        grid: {
          date: "2026-08-03",
          menuItems: [],
          rows: [...regularRows, ...packingRows],
        },
      },
      generatedAt: new Date("2026-07-27T01:00:00.000Z"),
    });
    const pdf = await PDFDocument.load(buffer);
    const secondPageItems = (await extractPdfTextItems(buffer)).filter(
      (item) => item.pageNumber === 2,
    );
    const secondPageText = secondPageItems
      .map((item) => item.str)
      .join("|");
    const lastSchoolItems = secondPageItems.filter(
      (item) => item.str === "피크학교 31초",
    );

    assert.equal(pdf.getPageCount(), 2);
    assert.match(secondPageText, /배식 목록 · 62개 반 \/ 930개/);
    assert.match(secondPageText, /도시락 포장 목록 · 7건 \/ 59개/);
    assert.equal(lastSchoolItems.length, 2);
    assert.ok(Math.min(...lastSchoolItems.map((item) => item.y)) > 35);
    assert.match(secondPageText, /2 \/ 2/);
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
  schoolType = "elementary",
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
    | "schoolType"
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
    schoolType,
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
    pageNumber: number;
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
          pageNumber,
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
