import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LunchBoxCountCalendarBoard } from "../src/components/lunch-box-count-calendar-board.tsx";
import { LunchBoxCountGrid } from "../src/components/lunch-box-count-grid.tsx";
import {
  createLunchBoxCalendarDays,
  formatLunchBoxDateLabel,
  formatLunchBoxMonthLabel,
  getLunchBoxCalendarRange,
  getLunchBoxCountTotal,
  getLunchBoxCurrentMonth,
  getLunchBoxMonthRange,
  isLunchBoxDate,
  isLunchBoxMonth,
  normalizeLunchBoxCountValue,
  normalizeLunchBoxMonth,
  shiftLunchBoxDate,
  shiftLunchBoxMonth,
  type LunchBoxCountGrid as LunchBoxCountGridData,
  type LunchBoxCountMonth,
} from "../src/lib/lunch-box-counts-core.ts";

const grid: LunchBoxCountGridData = {
  date: "2026-07-29",
  rows: [
    {
      schoolId: "school-001",
      schoolName: "영만초",
      schoolType: "elementary",
      class1Count: 16,
      class2Count: 15,
      class3Count: 14,
      class4Count: 0,
      linkedCount: 0,
    },
    {
      schoolId: "school-002",
      schoolName: "이리동남초 병설유치원",
      schoolType: "kindergarten",
      class1Count: 9,
      class2Count: 0,
      class3Count: 0,
      class4Count: 0,
      linkedCount: 0,
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
      }),
      45,
    );
  });

  test("normalizes count values against negative, decimal, and non-numeric input", () => {
    assert.equal(normalizeLunchBoxCountValue("12"), 12);
    assert.equal(normalizeLunchBoxCountValue(-5), 0);
    assert.equal(normalizeLunchBoxCountValue(3.7), 3);
    assert.equal(normalizeLunchBoxCountValue("abc"), 0);
    assert.equal(normalizeLunchBoxCountValue(undefined), 0);
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
        saveCounts,
        today: "2026-07-29",
      }),
    );

    assert.match(html, /일자별 도시락 개수/);
    assert.match(html, /영만초/);
    assert.match(html, /초등학교/);
    assert.match(html, /이리동남초 병설유치원/);
    assert.match(html, /병설유치원/);
    assert.match(html, />저장</);
    assert.match(html, /변경 사항이 없습니다\./);
    assert.doesNotMatch(html, />오늘</);
    assert.match(
      html,
      /href="\/work-schedule\/lunch-boxes\/print\?date=2026-07-29"/,
    );
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noreferrer"/);
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
        class1Count: 1,
        class2Count: 2,
        class3Count: 3,
        class4Count: 4,
        linkedCount: 5,
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
      /class="min-h-0 flex-1 overflow-auto px-5 pb-4"/,
    );
    assert.doesNotMatch(html, /overflow-auto px-5 py-4/);
    assert.match(
      html,
      /<th class="sticky top-0 z-20 border-b border-\[#eef1f5\] bg-white py-3 pr-3">학교명<\/th>/,
    );
    assert.match(html, /<footer class="flex shrink-0 [^"]*">/);
  });
});

describe("lunch box calendar", () => {
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
          totalCount: 54,
          schools: [
            {
              schoolId: "school-001",
              schoolName: "영만초",
              schoolType: "elementary",
              total: 45,
            },
            {
              schoolId: "school-002",
              schoolName: "이리동남초 병설유치원",
              schoolType: "kindergarten",
              total: 9,
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
    assert.match(html, /월 총계 54개/);
    assert.match(html, /영만초/);
    assert.match(html, /이리동남초 병설유치원/);
    assert.match(html, />45</);
    assert.match(html, />9</);
    assert.match(html, /54개/);
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
