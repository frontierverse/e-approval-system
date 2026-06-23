import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CommonScheduleChangeLogFilterControlsContent,
  CommonTimetableSkeleton,
  createCommonScheduleEndMinuteOptions,
  createCommonScheduleStartMinuteOptions,
  YouthCommonScheduleBoard,
} from "../src/components/youth-common-schedule-board.tsx";
import type {
  YouthCommonSchedule,
  YouthCommonScheduleChangeLog,
  YouthCommonScheduleChangeLogActor,
  YouthCommonScheduleChangeLogFilters,
  YouthLearningScheduleWeekday,
} from "../src/lib/youth-management-core.ts";

const schedules: YouthCommonSchedule[] = [
  {
    id: "common-schedule-001",
    weekday: 1,
    startHour: 9,
    startMinute: 540,
    endHour: 11,
    endMinute: 630,
    content: "공용 자습",
  },
  {
    id: "common-schedule-002",
    weekday: 5,
    startHour: 15,
    startMinute: 900,
    endHour: 16,
    endMinute: 960,
    content: "주간 점검",
  },
];

const changeLogs: YouthCommonScheduleChangeLog[] = [
  {
    id: "common-change-log-001",
    message: "공통 일정표 월요일 오전 9시 일정을 입력했습니다.",
    createdAt: "2026-06-22T01:30:00.000Z",
    metadata: {
      nextContent: "공용 자습",
      previousContent: null,
      timeLabel: "오전 9시 - 오전 10시 30분",
      weekday: 1,
    },
    actor: {
      id: "user-001",
      name: "김로리",
      email: "staff@example.com",
      profileImageStorageKey: null,
      profileImageUpdatedAt: null,
    },
  },
];

const changeLogActors: YouthCommonScheduleChangeLogActor[] = [
  {
    id: "user-001",
    name: "김로리",
    email: "staff@example.com",
  },
  {
    id: "user-002",
    name: "박서준",
    email: "teacher@example.com",
  },
];

const changeLogFilters: YouthCommonScheduleChangeLogFilters = {
  actorId: "user-001",
  page: 1,
  pageSize: 5,
  total: 8,
  totalPages: 2,
  weekday: 1,
};

function createBoardProps({
  filters = changeLogFilters,
  logs = changeLogs,
}: {
  filters?: YouthCommonScheduleChangeLogFilters;
  logs?: YouthCommonScheduleChangeLog[];
} = {}) {
  return {
    changeLogActors,
    changeLogFilterControls: React.createElement(
      CommonScheduleChangeLogFilterControlsContent,
      {
        actors: changeLogActors,
        filters,
        navigate: () => {},
      },
    ),
    changeLogFilters: filters,
    changeLogs: logs,
    deleteSchedule: async (weekday: number, startMinute: number) => ({
      ok: true as const,
      data: {
        weekday: weekday as YouthLearningScheduleWeekday,
        startMinute,
      },
    }),
    saveSchedule: async (
      weekday: number,
      startMinute: number,
      endMinute: number,
      content: string,
      recurrenceWeekdays: number[],
    ) => ({
      ok: true as const,
      data: {
        schedules: recurrenceWeekdays.map((targetWeekday) => ({
          id: `saved-common-schedule-${targetWeekday}`,
          weekday: targetWeekday as YouthLearningScheduleWeekday,
          startHour: Math.floor(startMinute / 60),
          startMinute,
          endHour: Math.ceil(endMinute / 60),
          endMinute,
          content,
        })),
        sourceStartMinute: startMinute,
        targetWeekdays: recurrenceWeekdays as YouthLearningScheduleWeekday[],
      },
    }),
    schedules,
  };
}

describe("YouthCommonScheduleBoard", () => {
  test("creates start and end time options in ten-minute steps", () => {
    const startOptions = createCommonScheduleStartMinuteOptions();
    const endOptionsFromNine = createCommonScheduleEndMinuteOptions(540);
    const endOptionsFromLastStart = createCommonScheduleEndMinuteOptions(1070);

    assert.deepEqual(startOptions.slice(0, 3), [540, 550, 560]);
    assert.equal(startOptions.at(-1), 1070);
    assert.deepEqual(endOptionsFromNine.slice(0, 3), [550, 560, 570]);
    assert.equal(endOptionsFromNine.at(-1), 1080);
    assert.deepEqual(endOptionsFromLastStart, [1080]);
  });

  test("renders a stable common timetable skeleton", () => {
    const html = renderToStaticMarkup(
      React.createElement(CommonTimetableSkeleton),
    );
    const overlayHtml = renderToStaticMarkup(
      React.createElement(CommonTimetableSkeleton, {
        overlay: true,
      }),
    );

    assert.match(html, /aria-label="공통 일정표 불러오는 중"/);
    assert.match(
      html,
      /grid-template-columns:6\.5rem repeat\(7, minmax\(10rem, 1fr\)\)/,
    );
    assert.match(html, /오전 9시 -/);
    assert.match(html, /오후 6시/);
    assert.match(overlayHtml, /absolute inset-0/);
  });

  test("renders weekday columns, hourly rows, and change logs", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthCommonScheduleBoard, createBoardProps()),
    );

    assert.match(html, /청소년 공통 일정표/);
    assert.match(html, /공통 일정표/);
    assert.match(html, /href="\/youth\/common-schedule\/print"/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /시간/);
    assert.match(html, /월요일/);
    assert.match(html, /화요일/);
    assert.match(html, /수요일/);
    assert.match(html, /목요일/);
    assert.match(html, /금요일/);
    assert.match(html, /토요일/);
    assert.match(html, /일요일/);
    assert.match(
      html,
      /grid-template-columns:6\.5rem repeat\(7, minmax\(10rem, 1fr\)\)/,
    );
    assert.match(html, /오전 9시 -/);
    assert.match(html, /오전 10시/);
    assert.match(html, /오후 5시 -/);
    assert.match(html, /오후 6시/);
    assert.match(html, /월요일 오전 9시 - 오전 10시 일정 입력/);
    assert.match(html, /미입력/);
    assert.match(html, /공용 자습/);
    assert.match(html, /오전 9시 - 오전 10시 30분/);
    assert.match(html, /주간 점검/);
    assert.match(html, /오후 3시 - 오후 4시/);
    assert.match(html, /시작 시간 조절/);
    assert.match(html, /종료 시간 조절/);
    assert.doesNotMatch(html, /반복 요일/);
    assert.match(html, /변경내역/);
    assert.match(html, /8건 중 1-5건 표시/);
    assert.match(html, /name="logStaff"/);
    assert.match(html, /name="logWeekday"/);
    assert.match(html, /staff@example\.com/);
    assert.match(html, /김로리/);
    assert.match(html, /박서준/);
    assert.match(html, /공통 일정표 월요일 오전 9시 일정을 입력했습니다/);
    assert.match(
      html,
      /href="\/youth\/common-schedule\?logStaff=user-001&amp;logWeekday=1&amp;logPage=2"/,
    );
    assert.match(html, /변경 후/);
    assert.doesNotMatch(html, /name="date"/);
  });

  test("renders an empty change log state with reset-free filters", () => {
    const emptyFilters = {
      actorId: "all",
      page: 1,
      pageSize: 5,
      total: 0,
      totalPages: 1,
      weekday: "all",
    } satisfies YouthCommonScheduleChangeLogFilters;
    const html = renderToStaticMarkup(
      React.createElement(
        YouthCommonScheduleBoard,
        createBoardProps({ filters: emptyFilters, logs: [] }),
      ),
    );

    assert.match(html, /표시할 변경내역이 없습니다/);
    assert.match(html, /조건에 맞는 변경내역이 없습니다/);
    assert.doesNotMatch(html, /초기화/);
  });
});
