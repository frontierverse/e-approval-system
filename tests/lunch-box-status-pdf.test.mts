import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PDFDocument, PageSizes } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  createLunchBoxStatusSummary,
  type LunchBoxCountGrid,
  type LunchBoxCountRow,
} from "../src/lib/lunch-box-counts-core.ts";
import {
  createLunchBoxStatusPdf,
  createLunchBoxWeeklyStatusPdf,
} from "../src/lib/lunch-box-status-pdf.ts";

const july27ElementaryCounts = [
  22, 22, 20, 20, 20, 18, 17, 17, 16, 15, 14, 12, 12, 9,
];

const july27Grid: LunchBoxCountGrid = {
  date: "2026-07-27",
  menuItems: [
    "잡곡밥",
    "감자된장국⑤⑥",
    "칠리새우볶음⑤⑥⑨⑫",
    "(병아리)콩조림⑤⑥",
    "숙주나물",
    "열무김치(배추김치)⑨",
  ],
  rows: [
    ...july27ElementaryCounts.map((count, index) =>
      createRow({
        class1Count: count,
        preservationCount: index < 9 ? 1 : 0,
        schoolId: `elementary-${index + 1}`,
        schoolName: `초등학교 ${index + 1}`,
        schoolType: "elementary",
      }),
    ),
    createRow({
      class1Count: 9,
      schoolId: "kindergarten-1",
      schoolName: "병설유치원 1",
      schoolType: "kindergarten",
    }),
    createRow({
      class1Count: 14,
      schoolId: "kindergarten-2",
      schoolName: "병설유치원 2",
      schoolType: "kindergarten",
    }),
  ],
};

describe("lunch box status PDF", () => {
  test("separates elementary, kindergarten, preservation, and driver counts", () => {
    const rows = [
      createRow({
        class1Count: 10,
        deliveryDriverCount: 2,
        preservationCount: 1,
        schoolId: "elementary",
        schoolName: "초등학교",
        schoolType: "elementary",
      }),
      createRow({
        class1Count: 7,
        deliveryDriverCount: 1,
        schoolId: "kindergarten",
        schoolName: "병설유치원",
        schoolType: "kindergarten",
      }),
    ];

    assert.deepEqual(createLunchBoxStatusSummary(rows), {
      deliveryDriverCount: 3,
      elementaryServingCount: 10,
      groupDistribution: [{ groupCount: 1, personCount: 10 }],
      kindergartenCount: 7,
      preservationCount: 1,
      totalCount: 21,
    });
  });

  test("reproduces the corrected July 27 totals and group distribution", () => {
    assert.deepEqual(createLunchBoxStatusSummary(july27Grid.rows), {
      deliveryDriverCount: 0,
      elementaryServingCount: 234,
      groupDistribution: [
        { groupCount: 2, personCount: 22 },
        { groupCount: 3, personCount: 20 },
        { groupCount: 1, personCount: 18 },
        { groupCount: 2, personCount: 17 },
        { groupCount: 1, personCount: 16 },
        { groupCount: 1, personCount: 15 },
        { groupCount: 1, personCount: 14 },
        { groupCount: 2, personCount: 12 },
        { groupCount: 1, personCount: 9 },
      ],
      kindergartenCount: 23,
      preservationCount: 9,
      totalCount: 266,
    });
  });

  test("creates a single-page A4 landscape status sheet from live-grid data", async () => {
    const buffer = await createLunchBoxStatusPdf({
      generatedAt: new Date("2026-07-26T09:00:00.000Z"),
      grid: july27Grid,
    });
    const pdf = await PDFDocument.load(buffer);
    const [page] = pdf.getPages();
    const text = await extractPdfText(buffer);

    assert.equal(readPdfHeader(buffer), "%PDF");
    assert.equal(pdf.getPageCount(), 1);
    assertAlmostEqual(page.getWidth(), PageSizes.A4[1]);
    assertAlmostEqual(page.getHeight(), PageSizes.A4[0]);
    assert.match(text, /7월 27일 초등 및 병설 방학도시락 현황표/);
    assert.match(
      text,
      /잡곡밥, 감자된장국, 칠리새우볶음, \(병아리\)콩조림, 숙주나물, 열무김치\(배추김치\)/,
    );
    assert.match(
      text,
      /식기\|\s*\|\s*미니 집게 4, 주걱 1, 스탠 국자 1, 검정 소스 국자 1, 스탠 배식스푼 1/,
    );
    assert.doesNotMatch(text, /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/u);
    assert.doesNotMatch(text, /배송기사\|0개/);
    assert.match(text, /배송기사\|\s*\|보존식\|9개/);
    assert.match(text, /보존식\|9개/);
    assert.match(text, /병설도시락\|23개/);
    assert.match(text, /배식\|234인/);
    assert.match(text, /전체\|266인/);

    for (const personCount of [22, 20, 18, 17, 16, 15, 14, 12, 9]) {
      assert.match(text, new RegExp(`${personCount}인`));
    }

    assert.equal(text.match(/16인/g)?.length, 1);
  });

  test("keeps a non-zero delivery-driver count visible", async () => {
    const buffer = await createLunchBoxStatusPdf({
      generatedAt: new Date("2026-07-26T09:00:00.000Z"),
      grid: {
        ...july27Grid,
        rows: july27Grid.rows.map((row, index) =>
          index === 0 ? { ...row, deliveryDriverCount: 3 } : row,
        ),
      },
    });
    const text = await extractPdfText(buffer);

    assert.match(text, /배송기사\|3개/);
  });

  test("creates one status page per supplied date in a weekly PDF", async () => {
    const dates = [
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
    ];
    const grids = dates.map((date, index) => ({
      ...july27Grid,
      date,
      menuItems: [`주간 식단 ${index + 1}`],
    }));
    const buffer = await createLunchBoxWeeklyStatusPdf({
      generatedAt: new Date("2026-07-26T09:00:00.000Z"),
      grids,
    });
    const pdf = await PDFDocument.load(buffer);
    const pageTexts = await extractPdfPageTexts(buffer);

    assert.equal(pdf.getPageCount(), dates.length);
    assert.equal(
      pdf.getTitle(),
      "7월 20일~7월 24일 초등 및 병설 방학도시락 현황표",
    );

    pdf.getPages().forEach((page) => {
      assertAlmostEqual(page.getWidth(), PageSizes.A4[1]);
      assertAlmostEqual(page.getHeight(), PageSizes.A4[0]);
    });

    dates.forEach((date, index) => {
      const [, month, day] = date.split("-");

      assert.match(
        pageTexts[index],
        new RegExp(
          `${Number(month)}월 ${Number(day)}일 초등 및 병설 방학도시락 현황표`,
        ),
      );
      assert.match(pageTexts[index], new RegExp(`주간 식단 ${index + 1}`));
    });
  });

  test("rejects a weekly PDF without printable dates", async () => {
    await assert.rejects(
      createLunchBoxWeeklyStatusPdf({
        generatedAt: new Date("2026-07-26T09:00:00.000Z"),
        grids: [],
      }),
      /인쇄할 도시락 현황표가 없습니다/,
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
  preservationCount = 0,
  schoolId,
  schoolName,
  schoolType,
}: Partial<
  Pick<
    LunchBoxCountRow,
    | "class1Count"
    | "class2Count"
    | "class3Count"
    | "class4Count"
    | "deliveryDriverCount"
    | "linkedCount"
    | "preservationCount"
  >
> &
  Pick<
    LunchBoxCountRow,
    "schoolId" | "schoolName" | "schoolType"
  >): LunchBoxCountRow {
  return {
    class1Count,
    class2Count,
    class3Count,
    class4Count,
    deliveryDriverCount,
    linkedCount,
    preservationClass: preservationCount > 0 ? 1 : null,
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

async function extractPdfText(buffer: Uint8Array) {
  return (await extractPdfPageTexts(buffer)).join("|");
}

async function extractPdfPageTexts(buffer: Uint8Array) {
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      pageTexts.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .filter(Boolean)
          .join("|"),
      );
    }
  } finally {
    await loadingTask.destroy();
  }

  return pageTexts;
}
