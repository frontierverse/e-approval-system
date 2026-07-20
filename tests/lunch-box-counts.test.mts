import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LunchBoxCountCalendarBoard } from "../src/components/lunch-box-count-calendar-board.tsx";
import {
  createLunchBoxCountChangeLogHref,
  LunchBoxCountChangeLog,
} from "../src/components/lunch-box-count-change-log.tsx";
import { LunchBoxCountGrid } from "../src/components/lunch-box-count-grid.tsx";
import { LunchBoxManagementSkeleton } from "../src/components/lunch-box-management-skeleton.tsx";
import {
  createLunchBoxCalendarDays,
  formatLunchBoxDateLabel,
  formatLunchBoxMonthLabel,
  getLunchBoxCalendarRange,
  getLunchBoxCountTotal,
  getLunchBoxCurrentMonth,
  getLunchBoxMonthRange,
  hasLunchBoxCountChanges,
  isLunchBoxDate,
  isLunchBoxMonth,
  lunchBoxCountChangeLogPageSize,
  normalizeLunchBoxCountChangeLogPage,
  normalizeLunchBoxCountValue,
  normalizeLunchBoxDeliveryDriverCountForSave,
  normalizeLunchBoxPreservationCountForSave,
  normalizeLunchBoxSchoolName,
  normalizeLunchBoxMonth,
  parseLunchBoxCountChangeDetail,
  resolveLunchBoxPreservationClassForUpdate,
  shiftLunchBoxDate,
  shiftLunchBoxMonth,
  type LunchBoxCountGrid as LunchBoxCountGridData,
  type LunchBoxCountChangeLogPage,
  type LunchBoxCountMonth,
} from "../src/lib/lunch-box-counts-core.ts";

const lunchBoxCalendarBoardSource = readFileSync(
  new URL(
    "../src/components/lunch-box-count-calendar-board.tsx",
    import.meta.url,
  ),
  "utf8",
);
const lunchBoxPageSource = readFileSync(
  new URL("../src/app/work-schedule/lunch-boxes/page.tsx", import.meta.url),
  "utf8",
);

const grid: LunchBoxCountGridData = {
  date: "2026-07-29",
  rows: [
    {
      schoolId: "school-001",
      schoolName: "영만초",
      schoolType: "elementary",
      preservationClass: 1,
      class1Count: 16,
      class2Count: 15,
      class3Count: 14,
      class4Count: 0,
      linkedCount: 0,
      preservationCount: 1,
      deliveryDriverCount: 1,
    },
    {
      schoolId: "school-002",
      schoolName: "동남초 병설유치원",
      schoolType: "kindergarten",
      preservationClass: null,
      class1Count: 9,
      class2Count: 0,
      class3Count: 0,
      class4Count: 0,
      linkedCount: 0,
      preservationCount: 1,
      deliveryDriverCount: 0,
    },
  ],
};

async function loadGrid() {
  return { ok: true as const, data: { grid } };
}

async function saveCounts() {
  return { ok: true as const, data: { grid } };
}

describe("lunch box counts", () => {
  test("sums the class counts into a row total", () => {
    assert.equal(
      getLunchBoxCountTotal({
        class1Count: 16,
        class2Count: 15,
        class3Count: 14,
        class4Count: 0,
        linkedCount: 0,
        preservationCount: 1,
        deliveryDriverCount: 1,
      }),
      47,
    );
  });

  test("normalizes count values against negative, decimal, and non-numeric input", () => {
    assert.equal(normalizeLunchBoxCountValue("12"), 12);
    assert.equal(normalizeLunchBoxCountValue(-5), 0);
    assert.equal(normalizeLunchBoxCountValue(3.7), 3);
    assert.equal(normalizeLunchBoxCountValue("abc"), 0);
    assert.equal(normalizeLunchBoxCountValue(undefined), 0);
  });

  test("parses detailed count changes without inventing legacy fields", () => {
    const detail = parseLunchBoxCountChangeDetail(
      {
        date: "2026-07-29",
        schools: [
          {
            schoolId: "school-001",
            schoolName: "영만초",
            previous: {
              class1Count: 10,
              class2Count: 5,
            },
            next: {
              class1Count: 12,
              class2Count: 5,
              deliveryDriverCount: 1,
            },
          },
        ],
      },
      "2026-07-28",
    );

    assert.equal(detail.date, "2026-07-29");
    assert.deepEqual(detail.schools, [
      {
        schoolId: "school-001",
        schoolName: "영만초",
        changes: [
          { field: "deliveryDriverCount", previous: 0, next: 1 },
          { field: "class1Count", previous: 10, next: 12 },
        ],
      },
    ]);
    assert.doesNotMatch(JSON.stringify(detail), /preservationCount/);
  });

  test("keeps malformed count history readable and falls back to its target date", () => {
    assert.deepEqual(
      parseLunchBoxCountChangeDetail(null, "2026-07-30"),
      { date: "2026-07-30", schools: [] },
    );
    assert.deepEqual(
      parseLunchBoxCountChangeDetail(
        { date: "bad", schools: [null, [], { next: "bad" }] },
        "2026-07-31",
      ),
      { date: "2026-07-31", schools: [] },
    );
  });

  test("normalizes count-history pages and fixes the page size at ten", () => {
    assert.equal(lunchBoxCountChangeLogPageSize, 10);
    assert.equal(normalizeLunchBoxCountChangeLogPage(undefined), 1);
    assert.equal(normalizeLunchBoxCountChangeLogPage("0"), 1);
    assert.equal(normalizeLunchBoxCountChangeLogPage("2.5"), 1);
    assert.equal(normalizeLunchBoxCountChangeLogPage("bad"), 1);
    assert.equal(normalizeLunchBoxCountChangeLogPage(["3", "4"]), 3);
  });

  test("does not create a history entry when an empty row is saved as zero", () => {
    const zeroCounts = {
      preservationCount: 0,
      deliveryDriverCount: 0,
      class1Count: 0,
      class2Count: 0,
      class3Count: 0,
      class4Count: 0,
      linkedCount: 0,
    };

    assert.equal(hasLunchBoxCountChanges(null, zeroCounts), false);
    assert.equal(
      hasLunchBoxCountChanges(zeroCounts, {
        ...zeroCounts,
        class1Count: 1,
      }),
      true,
    );
  });

  test("preserves stored preservation counts for older partial save payloads", () => {
    assert.equal(normalizeLunchBoxPreservationCountForSave({}, 1), 1);
    assert.equal(
      normalizeLunchBoxPreservationCountForSave({ preservationCount: 0 }, 1),
      0,
    );
    assert.equal(
      normalizeLunchBoxPreservationCountForSave(
        { preservationCount: "2" },
        1,
      ),
      2,
    );
  });

  test("preserves stored delivery-driver counts for older partial save payloads", () => {
    assert.equal(normalizeLunchBoxDeliveryDriverCountForSave({}, 1), 1);
    assert.equal(
      normalizeLunchBoxDeliveryDriverCountForSave(
        { deliveryDriverCount: 0 },
        1,
      ),
      0,
    );
  });

  test("only clears a school preservation assignment when the field is submitted", () => {
    assert.equal(
      resolveLunchBoxPreservationClassForUpdate({
        previousClass: 2,
        submitted: false,
        value: "",
      }),
      2,
    );
    assert.equal(
      resolveLunchBoxPreservationClassForUpdate({
        previousClass: 2,
        submitted: true,
        value: "",
      }),
      null,
    );
  });

  test("removes city prefixes except from the exact Iri and Iksan school names", () => {
    assert.equal(normalizeLunchBoxSchoolName("이리동초"), "동초");
    assert.equal(normalizeLunchBoxSchoolName("익산가온초"), "가온초");
    assert.equal(
      normalizeLunchBoxSchoolName("이리동남초 병설유치원"),
      "동남초 병설유치원",
    );
    assert.equal(normalizeLunchBoxSchoolName("이리초"), "이리초");
    assert.equal(normalizeLunchBoxSchoolName("익산초"), "익산초");
  });

  test("validates calendar dates", () => {
    assert.equal(isLunchBoxDate("2026-07-29"), true);
    assert.equal(isLunchBoxDate("2026-02-30"), false);
    assert.equal(isLunchBoxDate("2026-7-29"), false);
  });

  test("shifts dates across month boundaries", () => {
    assert.equal(shiftLunchBoxDate("2026-07-31", 1), "2026-08-01");
    assert.equal(shiftLunchBoxDate("2026-08-01", -1), "2026-07-31");
  });

  test("formats a date label with the Korean weekday", () => {
    assert.equal(formatLunchBoxDateLabel("2026-07-29"), "2026.07.29.(수)");
  });

  test("renders the count grid with school rows and a save control", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountGrid, {
        initialGrid: grid,
        loadGrid,
        onClose: () => {},
        saveCounts,
        today: "2026-07-29",
      }),
    );

    assert.match(html, /일자별 도시락 개수/);
    assert.match(html, /영만초/);
    assert.match(html, /초등학교/);
    assert.match(html, /동남초 병설유치원/);
    assert.match(html, /병설유치원/);
    assert.match(html, /보존식/);
    assert.match(html, /배송기사/);
    assert.match(
      html,
      /총계 57개 ·\s*보존식 2개 · 배송기사 1개 포함/,
    );
    assert.match(html, /보존식 지정: 1반/);
    assert.match(html, /보존식 지정: 지정반 없음/);
    assert.match(html, /aria-label="영만초 보존식 개수 \(1반 배정\)"/);
    assert.match(html, /aria-label="영만초 배송기사 도시락 개수"/);
    assert.ok(
      html.indexOf(">보존식</th>") <
        html.indexOf(">배송기사</th>") &&
        html.indexOf(">배송기사</th>") < html.indexOf(">1반</th>"),
      "보존식과 배송기사 열은 1반 열 왼쪽에 있어야 합니다.",
    );
    assert.match(html, />저장</);
    assert.match(html, /변경 사항이 없습니다\./);
    assert.doesNotMatch(html, />오늘</);
    assert.match(
      html,
      /href="\/work-schedule\/lunch-boxes\/print\?date=2026-07-29"/,
    );
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noreferrer"/);
    assert.match(
      html,
      /PDF \uC778\uC1C4<\/a><button[^>]*data-modal-initial-focus[^>]*>\uB2EB\uAE30<\/button>/,
    );
    assert.match(
      html,
      /data-modal-initial-focus[^>]*class="[^"]*bg-\[#b42318\][^"]*"[^>]*>\uB2EB\uAE30<\/button>/,
    );
    assert.match(
      html,
      /class="[^"]*bg-\[#3b5f7f\][^"]*"[^>]*>PDF 인쇄<\/a>/,
    );
    assert.match(html, />PDF 인쇄</);
  });

  test("renders an empty state when no schools are registered", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountGrid, {
        initialGrid: { date: "2026-07-29", rows: [] },
        loadGrid,
        saveCounts,
        today: "2026-07-29",
      }),
    );

    assert.match(html, /등록된 학교가 없습니다/);
    assert.match(html, /학교 등록하기/);
  });

  test("keeps a large school grid inside an independently scrolling region", () => {
    const busyGrid: LunchBoxCountGridData = {
      date: "2026-07-29",
      rows: Array.from({ length: 41 }, (_, index) => ({
        schoolId: `school-${index + 1}`,
        schoolName: `학교 ${index + 1}`,
        schoolType: "elementary" as const,
        preservationClass: 1 as const,
        class1Count: 1,
        class2Count: 2,
        class3Count: 3,
        class4Count: 4,
        linkedCount: 5,
        preservationCount: 1,
        deliveryDriverCount: 1,
      })),
    };
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountGrid, {
        initialGrid: busyGrid,
        loadGrid,
        saveCounts,
        today: "2026-07-29",
      }),
    );

    assert.match(html, /학교 41/);
    assert.match(
      html,
      /class="flex h-full min-h-0 flex-col overflow-hidden [^"]*"/,
    );
    assert.match(
      html,
      /class="min-h-0 flex-1 overflow-auto px-5 pb-4 [^"]*"/,
    );
    assert.doesNotMatch(html, /overflow-auto px-5 py-4/);
    assert.match(
      html,
      /<th class="sticky top-0 left-0 z-30 [^"]*" scope="col">학교명<\/th>/,
    );
    assert.match(
      html,
      /aria-label="학교별 도시락·보존식·배송기사 개수 입력 표"[^>]*role="region"[^>]*tabindex="0"/,
    );
    assert.match(
      html,
      /<th class="sticky left-0 z-10 [^"]*" scope="row">/,
    );
    assert.match(html, /<footer class="flex shrink-0 [^"]*">/);
  });
});

describe("lunch box calendar", () => {
  test("uses a desktop-wide count modal while preserving narrow-screen overflow", () => {
    assert.match(
      lunchBoxCalendarBoardSource,
      /<AppModal\s+className="max-w-7xl"/,
    );
    assert.doesNotMatch(lunchBoxCalendarBoardSource, /className="max-w-4xl"/);
    assert.match(lunchBoxCalendarBoardSource, /min-w-\[900px\]/);
    assert.match(
      lunchBoxCalendarBoardSource,
      /h-\[calc\(100dvh-3rem\)\]/,
    );
    assert.doesNotMatch(
      lunchBoxCalendarBoardSource,
      /h-\[min\(52rem,calc\(100dvh-3rem\)\)\]/,
    );
  });

  test("validates and normalizes month values", () => {
    assert.equal(isLunchBoxMonth("2026-07"), true);
    assert.equal(isLunchBoxMonth("2026-13"), false);
    assert.equal(isLunchBoxMonth("2026-7"), false);
    assert.equal(normalizeLunchBoxMonth("2026-07"), "2026-07");
    assert.equal(normalizeLunchBoxMonth("bad"), getLunchBoxCurrentMonth());
    assert.equal(normalizeLunchBoxMonth(undefined), getLunchBoxCurrentMonth());
  });

  test("shifts months across year boundaries", () => {
    assert.equal(shiftLunchBoxMonth("2026-07", 1), "2026-08");
    assert.equal(shiftLunchBoxMonth("2026-12", 1), "2027-01");
    assert.equal(shiftLunchBoxMonth("2026-01", -1), "2025-12");
  });

  test("computes half-open month ranges", () => {
    assert.deepEqual(getLunchBoxMonthRange("2026-07"), {
      endDate: "2026-08-01",
      startDate: "2026-07-01",
    });
    assert.deepEqual(getLunchBoxMonthRange("2026-12"), {
      endDate: "2027-01-01",
      startDate: "2026-12-01",
    });
  });

  test("computes the full 42-day range shown by the calendar", () => {
    assert.deepEqual(getLunchBoxCalendarRange("2026-07"), {
      endDate: "2026-08-09",
      startDate: "2026-06-28",
    });
    assert.deepEqual(getLunchBoxCalendarRange("2026-08"), {
      endDate: "2026-09-06",
      startDate: "2026-07-26",
    });
  });

  test("creates a 42-day calendar grid starting on Sunday", () => {
    const days = createLunchBoxCalendarDays("2026-07");

    assert.equal(days.length, 42);
    assert.equal(days[0].weekday, 0);
    assert.equal(days[0].date, "2026-06-28");
    assert.equal(days[3].date, "2026-07-01");
    assert.equal(days[3].isCurrentMonth, true);
    assert.equal(days[0].isCurrentMonth, false);
    assert.equal(days[41].weekday, 6);
  });

  test("formats month labels in Korean", () => {
    assert.equal(formatLunchBoxMonthLabel("2026-07"), "2026년 7월");
    assert.equal(formatLunchBoxMonthLabel("2026-11"), "2026년 11월");
  });

  test("renders calendar cells with per-school counts and daily totals", () => {
    const monthData: LunchBoxCountMonth = {
      month: "2026-07",
      days: {
        "2026-07-29": {
          date: "2026-07-29",
          totalCount: 57,
          schools: [
            {
              schoolId: "school-001",
              schoolName: "영만초",
              schoolType: "elementary",
              total: 47,
            },
            {
              schoolId: "school-002",
              schoolName: "동남초 병설유치원",
              schoolType: "kindergarten",
              total: 10,
            },
          ],
        },
      },
    };
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountCalendarBoard, {
        loadGrid,
        monthData,
        saveCounts,
        selectedMonth: "2026-07",
        today: "2026-07-29",
      }),
    );

    assert.match(html, /2026년 7월/);
    assert.match(html, /월 총계 57개/);
    assert.match(html, /보존식·배송기사 포함/);
    assert.match(html, /영만초/);
    assert.match(html, /동남초 병설유치원/);
    assert.match(html, />47</);
    assert.match(html, />10</);
    assert.match(html, /57개/);
    assert.match(html, /href="\/work-schedule\/lunch-boxes\?month=2026-06"/);
    assert.match(html, /href="\/work-schedule\/lunch-boxes\?month=2026-08"/);
    assert.match(html, /2026년 7월 29일 도시락 개수 입력|2026\.07\.29\.\(수\) 도시락 개수 입력/);
  });

  test("renders next-month counts inside the current calendar grid", () => {
    const monthData: LunchBoxCountMonth = {
      month: "2026-07",
      days: {
        "2026-08-03": {
          date: "2026-08-03",
          totalCount: 37,
          schools: [
            {
              schoolId: "school-august",
              schoolName: "팔월초",
              schoolType: "elementary",
              total: 37,
            },
          ],
        },
      },
    };
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountCalendarBoard, {
        loadGrid,
        monthData,
        saveCounts,
        selectedMonth: "2026-07",
        today: "2026-07-29",
      }),
    );

    assert.match(html, /팔월초/);
    assert.match(html, /37개/);
    assert.match(html, /2026\.08\.03\.\(월\) 도시락 개수 입력/);
    assert.match(html, /월 총계 0개/);
  });

  test("renders empty calendar cells without count badges", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountCalendarBoard, {
        loadGrid,
        monthData: { month: "2026-07", days: {} },
        saveCounts,
        selectedMonth: "2026-07",
        today: "2026-07-29",
      }),
    );

    assert.match(html, /2026년 7월/);
    assert.match(html, /월 총계 0개/);
    assert.doesNotMatch(html, /개<\/span><\/div><ul/);
    assert.doesNotMatch(html, /영만초/);
  });

  test("limits school previews so a busy calendar day keeps a fixed height", () => {
    const monthData: LunchBoxCountMonth = {
      month: "2026-07",
      days: {
        "2026-07-29": {
          date: "2026-07-29",
          totalCount: 150,
          schools: Array.from({ length: 5 }, (_, index) => ({
            schoolId: `school-${index + 1}`,
            schoolName: `학교 ${index + 1}`,
            schoolType: "elementary" as const,
            total: 30,
          })),
        },
      },
    };
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountCalendarBoard, {
        loadGrid,
        monthData,
        saveCounts,
        selectedMonth: "2026-07",
        today: "2026-07-29",
      }),
    );

    assert.match(html, /학교 1/);
    assert.match(html, /학교 2/);
    assert.match(html, /외 3곳/);
    assert.doesNotMatch(html, /학교 3/);
    assert.match(html, /h-36/);
  });
});

describe("lunch box count change log", () => {
  const changeLogPage: LunchBoxCountChangeLogPage = {
    logs: [
      {
        id: "log-001",
        date: "2026-07-29",
        createdAt: "2026-07-20T05:30:00.000Z",
        message: "2026-07-29 도시락 개수를 2개교 반영했습니다.",
        actor: {
          id: "user-001",
          name: "김담당",
          departmentName: "생활복지팀",
          positionName: "생활지도원",
          profileImageStorageKey: null,
          profileImageUpdatedAt: null,
        },
        schools: [
          {
            schoolId: "school-001",
            schoolName: "영만초",
            changes: [
              { field: "preservationCount", previous: 0, next: 1 },
              { field: "class1Count", previous: 10, next: 12 },
            ],
          },
          {
            schoolId: "school-002",
            schoolName: "동남초 병설유치원",
            changes: [
              { field: "deliveryDriverCount", previous: 0, next: 1 },
            ],
          },
        ],
      },
    ],
    page: 2,
    pageSize: 10,
    total: 21,
    totalPages: 3,
  };

  test("renders who changed each school field before and after", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountChangeLog, {
        changeLogPage,
        selectedMonth: "2026-07",
      }),
    );

    assert.match(html, /도시락 변경 기록/);
    assert.match(html, /21건 중 11-20건 표시/);
    assert.match(html, /김담당/);
    assert.match(html, /생활복지팀/);
    assert.match(html, /생활지도원/);
    assert.match(html, /대상일 2026\.07\.29\.\(수\)/);
    assert.match(html, /영만초/);
    assert.match(html, /동남초 병설유치원/);
    assert.match(html, /보존식/);
    assert.match(html, /배송기사/);
    assert.match(html, /1반/);
    assert.match(html, /0/);
    assert.match(html, /12/);
    assert.match(html, /aria-label="학교별 상세 변경값"/);
    assert.match(html, /2 \/ 3 페이지/);
    assert.match(
      html,
      /href="\/work-schedule\/lunch-boxes\?month=2026-07#lunch-box-change-log"/,
    );
    assert.match(
      html,
      /href="\/work-schedule\/lunch-boxes\?month=2026-07&amp;logPage=3#lunch-box-change-log"/,
    );
  });

  test("keeps the calendar before history and renders a matching loading state", () => {
    assert.ok(
      lunchBoxPageSource.indexOf("<LunchBoxCountCalendarBoard") <
        lunchBoxPageSource.indexOf("<LunchBoxCountChangeLog"),
      "도시락 변경 기록은 달력 아래에 렌더링되어야 합니다.",
    );

    const loadingHtml = renderToStaticMarkup(
      React.createElement(LunchBoxManagementSkeleton),
    );

    assert.match(loadingHtml, /aria-label="도시락 현황 로딩"/);
    assert.match(loadingHtml, /aria-label="도시락 변경 기록 로딩"/);
  });

  test("creates month-preserving page links and a clear empty state", () => {
    assert.equal(
      createLunchBoxCountChangeLogHref({
        page: 1,
        selectedMonth: "2026-07",
      }),
      "/work-schedule/lunch-boxes?month=2026-07#lunch-box-change-log",
    );
    assert.equal(
      createLunchBoxCountChangeLogHref({
        page: 4,
        selectedMonth: "2026-07",
      }),
      "/work-schedule/lunch-boxes?month=2026-07&logPage=4#lunch-box-change-log",
    );

    const html = renderToStaticMarkup(
      React.createElement(LunchBoxCountChangeLog, {
        changeLogPage: {
          logs: [],
          page: 1,
          pageSize: 10,
          total: 0,
          totalPages: 1,
        },
        selectedMonth: "2026-07",
      }),
    );

    assert.match(html, /아직 기록된 도시락 변경 내역이 없습니다/);
    assert.doesNotMatch(html, /도시락 변경 기록 페이지/);
  });
});
