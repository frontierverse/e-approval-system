import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LunchBoxChartBoard } from "../src/components/lunch-box-chart-board.tsx";
import type { LunchBoxChartData } from "../src/lib/lunch-box-counts-core.ts";

const lunchBoxPageSource = readFileSync(
  new URL("../src/app/work-schedule/lunch-boxes/page.tsx", import.meta.url),
  "utf8",
);

const chartData: LunchBoxChartData = {
  dailySeries: [
    {
      date: "2026-07-31",
      preservationCount: 2,
      totalCount: 102,
    },
    {
      date: "2026-08-03",
      preservationCount: 3,
      totalCount: 123,
    },
    {
      date: "2026-08-18",
      preservationCount: 1,
      totalCount: 91,
    },
  ],
  endDate: "2026-08-18",
  schoolSeries: [
    {
      points: [
        {
          date: "2026-07-31",
          preservationCount: 1,
          totalCount: 31,
        },
        {
          date: "2026-08-03",
          preservationCount: 1,
          totalCount: 36,
        },
        {
          date: "2026-08-18",
          preservationCount: 1,
          totalCount: 26,
        },
      ],
      schoolId: "school-a",
      schoolName: "가온초",
      schoolType: "elementary",
    },
    {
      points: [
        {
          date: "2026-07-31",
          preservationCount: 0,
          totalCount: 7,
        },
        {
          date: "2026-08-03",
          preservationCount: 0,
          totalCount: 8,
        },
        {
          date: "2026-08-18",
          preservationCount: 0,
          totalCount: 0,
        },
      ],
      schoolId: "school-b",
      schoolName: "가온초 병설유치원",
      schoolType: "kindergarten",
    },
  ],
  serviceDates: ["2026-07-31", "2026-08-03", "2026-08-18"],
  startDate: "2026-07-31",
};

describe("lunch box chart management board", () => {
  test("renders two accessible charts on the compact full-period axis", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxChartBoard, { chartData }),
    );

    assert.match(html, />날짜별 총 개수<\/h2>/);
    assert.match(html, />학교별 총 개수<\/h2>/);
    assert.equal(countMatches(html, 'role="img"'), 2);
    assert.equal(countMatches(html, 'tabindex="0"'), 2);
    assert.equal(countMatches(html, 'aria-label="차트 선 범례"'), 2);
    assert.match(html, /실제 공급일만 빈 날짜 없이 연속 표시합니다/);
    assert.match(html, /공급일 3일/);
    assert.match(html, />7\.31<\/text>/);
    assert.match(html, />8\.3<\/text>/);
    assert.match(html, />8\.18<\/text>/);
    assert.match(html, />가온초<\/span>/);
    assert.match(html, />가온초 병설유치원<\/span>/);
    assert.doesNotMatch(html, /8\.17/);
  });

  test("keeps preservation controls independent and exposes all PDF formats", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxChartBoard, { chartData }),
    );

    assert.equal(countMatches(html, 'type="checkbox"'), 2);
    assert.equal(countMatches(html, 'checked=""'), 2);
    assert.equal(countMatches(html, ">보존식 포함</label>"), 2);
    assert.match(html, /aria-label="날짜별 총 개수 보존식 포함"/);
    assert.match(html, /aria-label="학교별 총 개수 보존식 포함"/);
    assert.match(
      html,
      /chart-print\?chart=total&amp;orientation=portrait&amp;preservation=include/,
    );
    assert.match(
      html,
      /chart-print\?chart=total&amp;orientation=landscape&amp;preservation=include/,
    );
    assert.match(
      html,
      /chart-print\?chart=schools&amp;orientation=portrait&amp;preservation=include/,
    );
    assert.match(
      html,
      /chart-print\?chart=schools&amp;orientation=landscape&amp;preservation=include/,
    );
    assert.equal(countMatches(html, 'target="_blank"'), 4);
    assert.equal(countMatches(html, 'rel="noreferrer"'), 4);
    assert.equal(countMatches(html, ">세로 인쇄</a>"), 2);
    assert.equal(countMatches(html, ">가로 인쇄</a>"), 2);
  });

  test("places chart management directly after the daily school-list tab", () => {
    const dailySchoolListIndex = lunchBoxPageSource.indexOf(
      'label="날짜별 학교 목록"',
    );
    const chartIndex = lunchBoxPageSource.indexOf('label="차트 관리"');
    const schoolManagementIndex =
      lunchBoxPageSource.indexOf('label="학교 관리"');

    assert.ok(dailySchoolListIndex >= 0);
    assert.ok(chartIndex > dailySchoolListIndex);
    assert.ok(schoolManagementIndex > chartIndex);
    assert.match(lunchBoxPageSource, /value === "charts"/);
    assert.match(
      lunchBoxPageSource,
      /activeTab === "charts"[\s\S]*?<LunchBoxChartPanel/,
    );
    assert.match(
      lunchBoxPageSource,
      /activeTab === "charts"[\s\S]*?<PageTitle compact/,
    );
  });

  test("uses a compact empty state without removing chart print controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxChartBoard, {
        chartData: {
          dailySeries: [],
          endDate: null,
          schoolSeries: [],
          serviceDates: [],
          startDate: null,
        },
      }),
    );

    assert.equal(
      countMatches(html, "표시할 도시락 공급 데이터가 없습니다."),
      2,
    );
    assert.match(html, /공급 기간 없음/);
    assert.equal(countMatches(html, "chart-print?chart="), 4);
  });

  test("shows point markers for every series when there is one service date", () => {
    const oneDatePoint = {
      date: "2026-08-03",
      preservationCount: 1,
      totalCount: 20,
    };
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxChartBoard, {
        chartData: {
          dailySeries: [oneDatePoint],
          endDate: oneDatePoint.date,
          schoolSeries: [
            {
              points: [oneDatePoint],
              schoolId: "single-school",
              schoolName: "단일공급초",
              schoolType: "elementary",
            },
          ],
          serviceDates: [oneDatePoint.date],
          startDate: oneDatePoint.date,
        },
      }),
    );

    assert.equal(countMatches(html, "<circle"), 2);
    assert.match(html, /단일공급초/);
  });
});

function countMatches(value: string, search: string) {
  return value.split(search).length - 1;
}
