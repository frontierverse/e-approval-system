import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createWorkScheduleEndMinuteOptions,
  createWorkScheduleStartMinuteOptions,
  WorkScheduleCalendarBoard,
  WorkScheduleCalendarSkeleton,
  WorkScheduleChangeLogFilterControlsContent,
} from "../src/components/work-schedule-calendar-board.tsx";
import {
  createWorkScheduleCalendarDays,
  formatWorkScheduleMonthLabel,
  shiftWorkScheduleMonth,
} from "../src/lib/work-schedule-calendar.ts";
import type {
  WorkSchedule,
  WorkScheduleChangeLog,
  WorkScheduleChangeLogActor,
  WorkScheduleChangeLogFilters,
} from "../src/lib/work-schedules.ts";

const schedules: WorkSchedule[] = [
  {
    id: "work-schedule-001",
    scheduleDate: "2026-06-24",
    weekday: 3,
    startHour: 9,
    startMinute: 540,
    endHour: 10,
    endMinute: 600,
    content: "월간 업무 점검",
  },
  {
    id: "work-schedule-002",
    scheduleDate: "2026-06-26",
    weekday: 5,
    startHour: 14,
    startMinute: 840,
    endHour: 15,
    endMinute: 900,
    content: "카페 재고 확인",
  },
];

const changeLogActors: WorkScheduleChangeLogActor[] = [
  {
    id: "user-001",
    name: "김로리",
    email: "staff@example.com",
  },
];

const changeLogFilters: WorkScheduleChangeLogFilters = {
  actorId: "user-001",
  page: 1,
  pageSize: 5,
  scheduleDate: "2026-06-24",
  total: 8,
  totalPages: 2,
};

const changeLogs: WorkScheduleChangeLog[] = [
  {
    id: "work-change-log-001",
    message: "업무 일정표 2026년 6월 24일 일정이 입력되었습니다.",
    createdAt: "2026-06-22T01:30:00.000Z",
    metadata: {
      nextContent: "월간 업무 점검",
      previousContent: null,
      scheduleDate: "2026-06-24",
      timeLabel: "오전 9시 - 오전 10시",
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

describe("work schedule calendar", () => {
  test("creates real calendar month ranges", () => {
    const days = createWorkScheduleCalendarDays("2026-06");

    assert.equal(formatWorkScheduleMonthLabel("2026-06"), "2026년 6월");
    assert.equal(shiftWorkScheduleMonth("2026-01", -1), "2025-12");
    assert.equal(shiftWorkScheduleMonth("2026-12", 1), "2027-01");
    assert.equal(days.length, 42);
    assert.equal(days[0]?.date, "2026-05-31");
    assert.equal(days[1]?.date, "2026-06-01");
    assert.equal(days[24]?.date, "2026-06-24");
    assert.equal(days[24]?.isCurrentMonth, true);
  });

  test("creates start and end time options in ten-minute steps", () => {
    const startOptions = createWorkScheduleStartMinuteOptions();
    const endOptionsFromNine = createWorkScheduleEndMinuteOptions(540);

    assert.deepEqual(startOptions.slice(0, 3), [540, 550, 560]);
    assert.equal(startOptions.at(-1), 1070);
    assert.deepEqual(endOptionsFromNine.slice(0, 3), [550, 560, 570]);
    assert.equal(endOptionsFromNine.at(-1), 1080);
  });

  test("renders a month calendar with date navigation and date-filtered logs", () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkScheduleCalendarBoard, {
        changeLogActors,
        changeLogFilterControls: React.createElement(
          WorkScheduleChangeLogFilterControlsContent,
          {
            actors: changeLogActors,
            filters: changeLogFilters,
            navigate: () => {},
            selectedMonth: "2026-06",
          },
        ),
        changeLogFilters,
        changeLogs,
        deleteSchedule: async (scheduleDate, startMinute) => ({
          ok: true as const,
          data: { scheduleDate, startMinute },
        }),
        saveSchedule: async (
          scheduleDate,
          startMinute,
          endMinute,
          content,
        ) => ({
          ok: true as const,
          data: {
            schedule: {
              id: "saved-work-schedule",
              scheduleDate,
              weekday: 3,
              startHour: Math.floor(startMinute / 60),
              startMinute,
              endHour: Math.ceil(endMinute / 60),
              endMinute,
              content,
            },
          },
        }),
        schedules,
        selectedMonth: "2026-06",
      }),
    );

    assert.match(
      html,
      /<h2 class="text-lg font-semibold text-\[#16181d\]">2026년 6월<\/h2>/,
    );
    assert.match(html, /2026년 6월/);
    assert.match(html, /grid-cols-7/);
    assert.match(html, /min-w-\[980px\]/);
    assert.match(html, /href="\/work-schedule\?month=2026-05"/);
    assert.match(html, /href="\/work-schedule\?month=2026-07"/);
    assert.match(html, /value="2026-06-01"/);
    assert.doesNotMatch(html, />이동</);
    assert.doesNotMatch(html, />추가</);
    assert.match(html, /role="button"/);
    assert.match(html, /tabindex="0"/);
    assert.match(html, /cursor-pointer/);
    assert.match(html, /hover:bg-\[#f0f8f7\]/);
    assert.match(html, /group-hover:opacity-100/);
    assert.match(html, />\+<\/span>/);
    assert.match(html, /월간 업무 점검/);
    assert.match(html, /카페 재고 확인/);
    assert.match(html, /name="logDate"/);
    assert.doesNotMatch(html, /name="logWeekday"/);
    assert.match(
      html,
      /href="\/work-schedule\?month=2026-06&amp;logStaff=user-001&amp;logDate=2026-06-24&amp;logPage=2"/,
    );
  });

  test("renders a calendar-shaped loading skeleton", () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkScheduleCalendarSkeleton),
    );

    assert.match(html, /업무 일정 로딩/);
    assert.match(html, /grid-cols-7/);
    assert.match(html, /min-w-\[980px\]/);
    assert.doesNotMatch(html, /min-w-\[820px\]/);
  });
});
