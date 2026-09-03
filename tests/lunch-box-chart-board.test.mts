import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LunchBoxChartBoard } from "../src/components/lunch-box-chart-board.tsx";
import type { LunchBoxChartData } from "../src/lib/lunch-box-counts-core.ts";
import type { LunchBoxOperationsChartData } from "../src/lib/lunch-box-operations-core.ts";

const lunchBoxPageSource = readFileSync(
  new URL("../src/app/work-schedule/lunch-boxes/page.tsx", import.meta.url),
  "utf8",
);
const chartBoardSource = readFileSync(
  new URL("../src/components/lunch-box-chart-board.tsx", import.meta.url),
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

const operationsChartData: LunchBoxOperationsChartData = {
  endDate: "2026-08-18",
  points: [
    {
      date: "2026-07-31",
      hiredWorkers: [
        {
          laborCost: 70_000,
          shifts: [
            {
              endTime: "12:00",
              laborCost: 70_000,
              startTime: "07:30",
              totalMinutes: 270,
            },
          ],
          totalMinutes: 270,
          workerName: "김하늘",
        },
        {
          laborCost: 45_000,
          shifts: [
            {
              endTime: "11:00",
              laborCost: 45_000,
              startTime: "08:00",
              totalMinutes: 180,
            },
          ],
          totalMinutes: 180,
          workerName: "박지민",
        },
      ],
      laborCost: 115_000,
      totalMinutes: 450,
    },
    {
      date: "2026-08-03",
      hiredWorkers: [
        {
          laborCost: 80_000,
          shifts: [
            {
              endTime: "12:00",
              laborCost: 80_000,
              startTime: "07:00",
              totalMinutes: 300,
            },
          ],
          totalMinutes: 300,
          workerName: "김하늘",
        },
      ],
      laborCost: 80_000,
      totalMinutes: 300,
    },
    {
      date: "2026-08-18",
      hiredWorkers: [
        {
          laborCost: 60_000,
          shifts: [
            {
              endTime: "12:00",
              laborCost: 60_000,
              startTime: "08:00",
              totalMinutes: 240,
            },
          ],
          totalMinutes: 240,
          workerName: "박지민",
        },
      ],
      laborCost: 60_000,
      totalMinutes: 240,
    },
  ],
  startDate: "2026-07-31",
  totalLaborCost: 255_000,
  totalMinutes: 990,
  workerNames: ["김하늘", "박지민"],
  workerSummaries: [
    {
      laborCost: 150_000,
      totalMinutes: 570,
      workdayCount: 2,
      workerName: "김하늘",
    },
    {
      laborCost: 105_000,
      totalMinutes: 420,
      workdayCount: 2,
      workerName: "박지민",
    },
  ],
};

describe("lunch box chart management board", () => {
  test("renders three accessible charts on compact full-period axes", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxChartBoard, {
        chartData,
        operationsChartData,
      }),
    );

    assert.match(html, />날짜별 총 개수<\/h2>/);
    assert.match(html, />별도 고용 인력 추이<\/h2>/);
    assert.match(html, />학교별 총 개수<\/h2>/);
    assert.equal(countMatches(html, 'role="img"'), 3);
    assert.equal(countMatches(html, 'tabindex="0"'), 3);
    assert.equal(countMatches(html, 'aria-label="차트 선 범례"'), 3);
    assert.equal(countMatches(html, 'data-chart-hover-zone="true"'), 3);
    assert.equal(countMatches(html, "<title>"), 3);
    assert.match(html, /실제 공급일만 빈 날짜 없이 연속 표시합니다/);
    assert.match(html, /별도 고용 인력의 지급액만 집계합니다/);
    assert.match(html, /공급일 3일/);
    assert.match(html, /고용 기록일 3일/);
    assert.match(html, />7\.31<\/text>/);
    assert.match(html, />8\.3<\/text>/);
    assert.match(html, />8\.18<\/text>/);
    assert.match(html, />일별 고용비 합계<\/span>/);
    assert.match(html, />김하늘<\/span>/);
    assert.match(html, />박지민<\/span>/);
    assert.match(
      html,
      /2026\.07\.31\.\(금\) 일별 고용비 합계 7시간 30분 · 115,000원/,
    );
    assert.match(
      html,
      /2026\.08\.03\.\(월\) 김하늘 5시간 · 80,000원/,
    );
    assert.match(html, /aria-label="날짜별 별도 고용비 선 차트"/);
    assert.doesNotMatch(html, /aria-label="근무·지출 차트 표시 기준"/);
    assert.doesNotMatch(html, /식재료비|추가 지출 합계/);
    assert.match(html, />가온초<\/span>/);
    assert.match(html, />가온초 병설유치원<\/span>/);
    assert.doesNotMatch(html, /8\.17/);
  });

  test("uses broad hover zones and immediate custom tooltips", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxChartBoard, {
        chartData,
        operationsChartData,
      }),
    );
    const hoverZones = [
      ...html.matchAll(/<rect\b[^>]*data-chart-hover-zone="true"[^>]*>/g),
    ].map((match) => match[0]);
    const lineChartSource = chartBoardSource.slice(
      chartBoardSource.indexOf("function LunchBoxLineChart("),
      chartBoardSource.indexOf("function ChartLegend("),
    );

    assert.equal(hoverZones.length, 3);

    for (const hoverZone of hoverZones) {
      assert.match(hoverZone, /pointer-events="all"/);
      assert.match(hoverZone, /height="242"/);
      assert.match(hoverZone, /width="674"/);
    }

    assert.match(lineChartSource, /onPointerEnter=/);
    assert.match(lineChartSource, /onPointerMove=/);
    assert.match(lineChartSource, /onPointerLeave=/);
    assert.match(lineChartSource, /role="tooltip"/);
    assert.match(lineChartSource, /data-chart-tooltip="true"/);
    assert.doesNotMatch(
      lineChartSource,
      /setTimeout|transitionDelay|delay-/,
    );
  });

  test("shows overall, person, and date totals with exact work details", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxChartBoard, {
        chartData,
        operationsChartData,
      }),
    );

    assert.match(html, /aria-label="별도 고용 전체 요약"/);
    assert.match(html, />전체 고용비<\/dt>[\s\S]*?>255,000원<\/dd>/);
    assert.match(html, />고용 인력<\/dt>[\s\S]*?>2명<\/dd>/);
    assert.match(html, />고용 기록일<\/dt>[\s\S]*?>3일<\/dd>/);
    assert.match(html, />총 근무시간<\/dt>[\s\S]*?>16시간 30분<\/dd>/);
    assert.match(html, /aria-label="별도 고용 인력별 누계"/);
    assert.match(html, />김하늘<\/span>[\s\S]*?>2일<\/span>[\s\S]*?>9시간 30분<\/span>[\s\S]*?>150,000원<\/span>/);
    assert.match(html, />박지민<\/span>[\s\S]*?>2일<\/span>[\s\S]*?>7시간<\/span>[\s\S]*?>105,000원<\/span>/);
    assert.match(html, /aria-label="별도 고용 근무·지급 내역"/);
    assert.match(html, />날짜별 고용 내역<\/h3>/);
    assert.match(html, /07:30~12:00/);
    assert.match(html, /08:00~11:00/);
    assert.match(html, />7시간 30분<\/span>/);
    assert.match(html, />115,000원<\/span>/);
  });

  test("keeps preservation controls independent and exposes all PDF formats", () => {
    const html = renderToStaticMarkup(
      React.createElement(LunchBoxChartBoard, {
        chartData,
        operationsChartData,
      }),
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
    assert.match(
      html,
      /chart-print\?chart=operations&amp;orientation=portrait/,
    );
    assert.match(
      html,
      /chart-print\?chart=operations&amp;orientation=landscape/,
    );
    assert.doesNotMatch(
      html,
      /chart=operations[^"\s]*preservation/,
    );
    assert.match(
      html,
      /aria-label="별도 고용 인력 추이 세로 인쇄 PDF"/,
    );
    assert.match(
      html,
      /aria-label="별도 고용 인력 추이 가로 인쇄 PDF"/,
    );
    assert.equal(countMatches(html, 'target="_blank"'), 6);
    assert.equal(countMatches(html, 'rel="noreferrer"'), 6);
    assert.equal(countMatches(html, ">세로 인쇄</a>"), 3);
    assert.equal(countMatches(html, ">가로 인쇄</a>"), 3);
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
    assert.match(lunchBoxPageSource, /getLunchBoxOperationsChartData/);
    assert.match(
      lunchBoxPageSource,
      /Promise\.all\(\[[\s\S]*?getLunchBoxChartData\(\)[\s\S]*?getLunchBoxOperationsChartData\(\)/,
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
        operationsChartData: {
          endDate: null,
          points: [],
          startDate: null,
          totalLaborCost: 0,
          totalMinutes: 0,
          workerNames: [],
          workerSummaries: [],
        },
      }),
    );

    assert.equal(
      countMatches(html, "표시할 도시락 공급 데이터가 없습니다."),
      2,
    );
    assert.equal(
      countMatches(html, "표시할 별도 고용 근무 기록이 없습니다."),
      1,
    );
    assert.match(html, /공급 기간 없음/);
    assert.match(html, /고용 기록 기간 없음/);
    assert.match(html, />전체 고용비<\/dt>[\s\S]*?>0원<\/dd>/);
    assert.doesNotMatch(html, /aria-label="별도 고용 인력별 누계"/);
    assert.doesNotMatch(html, /aria-label="별도 고용 근무·지급 내역"/);
    assert.equal(countMatches(html, "chart-print?chart="), 6);
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
        operationsChartData: {
          endDate: oneDatePoint.date,
          points: [
            {
              date: oneDatePoint.date,
              hiredWorkers: [
                {
                  laborCost: 50_000,
                  shifts: [
                    {
                      endTime: "11:00",
                      laborCost: 50_000,
                      startTime: "08:00",
                      totalMinutes: 180,
                    },
                  ],
                  totalMinutes: 180,
                  workerName: "김하늘",
                },
                {
                  laborCost: 70_000,
                  shifts: [
                    {
                      endTime: "12:30",
                      laborCost: 70_000,
                      startTime: "08:00",
                      totalMinutes: 270,
                    },
                  ],
                  totalMinutes: 270,
                  workerName: "박지민",
                },
              ],
              laborCost: 120_000,
              totalMinutes: 450,
            },
          ],
          startDate: oneDatePoint.date,
          totalLaborCost: 120_000,
          totalMinutes: 450,
          workerNames: ["김하늘", "박지민"],
          workerSummaries: [
            {
              laborCost: 50_000,
              totalMinutes: 180,
              workdayCount: 1,
              workerName: "김하늘",
            },
            {
              laborCost: 70_000,
              totalMinutes: 270,
              workdayCount: 1,
              workerName: "박지민",
            },
          ],
        },
      }),
    );

    assert.equal(countMatches(html, 'data-chart-point-marker="true"'), 5);
    assert.match(html, /단일공급초/);
    assert.match(html, /일별 고용비 합계 7시간 30분 · 120,000원/);
    assert.match(html, /김하늘 3시간 · 50,000원/);
    assert.match(html, /박지민 4시간 30분 · 70,000원/);
  });
});

function countMatches(value: string, search: string) {
  return value.split(search).length - 1;
}
