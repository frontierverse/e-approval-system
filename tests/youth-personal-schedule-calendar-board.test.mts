import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageTitle } from "../src/components/page-title.tsx";
import {
  createPersonalScheduleEndMinuteOptions,
  createPersonalScheduleStartMinuteOptions,
  formatPersonalScheduleTime,
  formatPersonalScheduleTimeRange,
  getPersonalScheduleDraftError,
  occursOnPersonalScheduleDate,
  YouthPersonalScheduleCalendarBoard,
  YouthPersonalScheduleCalendarSkeleton,
  YouthPersonalScheduleStudentSelect,
} from "../src/components/youth-personal-schedule-calendar-board.tsx";
import type { YouthPersonalScheduleInput } from "../src/lib/youth-personal-schedule-core.ts";
import type { YouthPersonalSchedule } from "../src/lib/youth-personal-schedules.ts";

const componentSource = readFileSync(
  new URL(
    "../src/components/youth-personal-schedule-calendar-board.tsx",
    import.meta.url,
  ),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../src/app/youth/personal-schedule/page.tsx", import.meta.url),
  "utf8",
);

const youths = [
  { id: "youth-001", name: "김하늘" },
  { id: "youth-002", name: "최예담" },
];

const schedules: YouthPersonalSchedule[] = [
  {
    id: "schedule-dates",
    youthId: "youth-001",
    content: "병원 진료",
    startMinute: 0,
    endMinute: 70,
    selectionMode: "DATES",
    occurrenceDates: ["2026-06-10", "2026-06-12"],
    recurrenceWeekdays: [],
    recurrenceStartDate: null,
    recurrenceEndDate: null,
  },
  {
    id: "schedule-weekdays",
    youthId: "youth-001",
    content: "저녁 영어 학원",
    startMinute: 18 * 60,
    endMinute: 24 * 60,
    selectionMode: "WEEKDAYS",
    occurrenceDates: ["2026-06-15", "2026-06-17"],
    recurrenceWeekdays: [1, 3],
    recurrenceStartDate: "2026-06-01",
    recurrenceEndDate: "2026-06-30",
  },
];

const defaultInput: YouthPersonalScheduleInput = {
  content: "영어 학원",
  startMinute: 540,
  endMinute: 600,
  selectionMode: "DATES",
  occurrenceDates: ["2026-06-10"],
  recurrenceWeekdays: [],
  recurrenceStartDate: "",
  recurrenceEndDate: "",
};

function createBoard(canManage = true) {
  return React.createElement(YouthPersonalScheduleCalendarBoard, {
    canManage,
    createSchedule: async (youthId, input) => ({
      ok: true as const,
      data: {
        schedule: {
          id: "created-schedule",
          youthId,
          ...input,
          recurrenceStartDate: input.recurrenceStartDate || null,
          recurrenceEndDate: input.recurrenceEndDate || null,
        },
      },
    }),
    deleteSchedule: async (scheduleId) => ({
      ok: true as const,
      data: { scheduleId },
    }),
    schedules,
    selectedMonth: "2026-06",
    selectedYouthId: "youth-001",
    updateSchedule: async (scheduleId, input) => ({
      ok: true as const,
      data: {
        schedule: {
          id: scheduleId,
          youthId: "youth-001",
          ...input,
          recurrenceStartDate: input.recurrenceStartDate || null,
          recurrenceEndDate: input.recurrenceEndDate || null,
        },
      },
    }),
    youths,
  });
}

describe("youth personal schedule calendar board", () => {
  test("renders a responsive 42-day month calendar without a fixed-width grid", () => {
    const html = renderToStaticMarkup(createBoard());

    assert.match(html, /aria-label="김하늘 개인 일정표"/);
    assert.match(html, /2026년 6월/);
    assert.match(html, /김하늘/);
    assert.doesNotMatch(html, /개인 일정표 학생 선택/);
    assert.match(html, /grid-cols-7/);
    assert.match(html, /max-w-full/);
    assert.doesNotMatch(html, /min-w-\[(?:8|9)\d{2}px\]/);
    assert.doesNotMatch(html, /overflow-x-auto/);
    assert.match(html, /2026년 6월 10일 \(수\) 개인 일정 등록/);
    assert.match(html, /00:00-01:10 병원 진료 전체 일정 묶음 수정/);
    assert.match(html, /18:00-24:00 저녁 영어 학원 전체 일정 묶음 수정/);
    assert.doesNotMatch(html, /hidden truncate sm:block/);
    assert.match(
      html,
      /href="\/youth\/personal-schedule\?youthId=youth-001&amp;month=2026-05"/,
    );
    assert.match(
      html,
      /href="\/youth\/personal-schedule\?youthId=youth-001&amp;month=2026-07"/,
    );
  });

  test("places the student selector directly before the personal schedule title", () => {
    const studentSelect = React.createElement(
      YouthPersonalScheduleStudentSelect,
      {
        selectedMonth: "2026-06",
        selectedYouthId: "youth-001",
        youths,
      },
    );
    const html = renderToStaticMarkup(studentSelect);
    const titleHtml = renderToStaticMarkup(
      React.createElement(PageTitle, {
        title: "개인 일정표",
        titleAccessory: studentSelect,
      }),
    );

    assert.match(html, /aria-label="개인 일정표 학생 선택"/);
    assert.match(html, /h-11/);
    assert.match(html, /text-lg/);
    assert.match(html, /<option value="youth-001" selected="">김하늘<\/option>/);
    assert.match(html, /<option value="youth-002">최예담<\/option>/);
    assert.ok(
      titleHtml.indexOf('aria-label="개인 일정표 학생 선택"') <
        titleHtml.indexOf(">개인 일정표</h1>"),
    );
    assert.match(
      pageSource,
      /<PageTitle\s+title="개인 일정표"\s+titleAccessory=\{[\s\S]*?<YouthPersonalScheduleStudentSelect/,
    );

    const emptyHtml = renderToStaticMarkup(
      React.createElement(YouthPersonalScheduleStudentSelect, {
        selectedMonth: "2026-06",
        selectedYouthId: "",
        youths: [],
      }),
    );

    assert.match(emptyHtml, /재원 중인 학생 없음/);
    assert.match(emptyHtml, /disabled=""/);
  });

  test("renders a genuinely read-only calendar without registration controls", () => {
    const html = renderToStaticMarkup(createBoard(false));

    assert.match(html, /조회 전용/);
    assert.match(html, /병원 진료/);
    assert.doesNotMatch(html, /개인 일정 등록/);
    assert.doesNotMatch(html, /전체 일정 묶음 수정/);
    assert.doesNotMatch(html, /<button/);
    assert.match(html, /cursor-default/);
  });

  test("renders a calendar-shaped reduced-motion loading skeleton", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthPersonalScheduleCalendarSkeleton),
    );

    assert.match(html, /aria-label="개인 일정표 로딩"/);
    assert.match(html, /grid-cols-7/);
    assert.match(html, /motion-reduce:animate-none/);
    assert.doesNotMatch(html, /overflow-x-auto/);
    assert.equal((html.match(/sm:min-h-32/g) ?? []).length, 42);
  });

  test("offers the full day in ten-minute time increments", () => {
    const startOptions = createPersonalScheduleStartMinuteOptions();
    const endOptions = createPersonalScheduleEndMinuteOptions(1430);

    assert.equal(startOptions.length, 144);
    assert.equal(startOptions[0], 0);
    assert.equal(startOptions.at(-1), 1430);
    assert.equal(
      startOptions.every((minute, index) => minute === index * 10),
      true,
    );
    assert.deepEqual(endOptions, [1440]);
    assert.equal(createPersonalScheduleEndMinuteOptions(0).at(-1), 1440);
    assert.equal(formatPersonalScheduleTime(0), "00:00");
    assert.equal(formatPersonalScheduleTime(1440), "24:00");
    assert.equal(formatPersonalScheduleTimeRange(1430, 1440), "23:50-24:00");
  });

  test("uses generated occurrence dates as the only calendar authority", () => {
    assert.equal(
      occursOnPersonalScheduleDate(schedules[0]!, "2026-06-10"),
      true,
    );
    assert.equal(
      occursOnPersonalScheduleDate(schedules[0]!, "2026-06-11"),
      false,
    );
    assert.equal(
      occursOnPersonalScheduleDate(schedules[1]!, "2026-06-15"),
      true,
    );
    assert.equal(
      occursOnPersonalScheduleDate(schedules[1]!, "2026-06-16"),
      false,
    );
    assert.equal(
      occursOnPersonalScheduleDate(
        { ...schedules[1]!, occurrenceDates: [] },
        "2026-06-15",
      ),
      false,
    );
  });

  test("validates content, dates, weekday periods, and time order before saving", () => {
    assert.equal(getPersonalScheduleDraftError(defaultInput), null);
    assert.equal(
      getPersonalScheduleDraftError({ ...defaultInput, content: "" }),
      "일정 내용을 입력하세요.",
    );
    assert.equal(
      getPersonalScheduleDraftError({
        ...defaultInput,
        occurrenceDates: ["2026-06-10", "2026-06-10"],
      }),
      "같은 날짜를 중복해서 선택할 수 없습니다.",
    );
    assert.equal(
      getPersonalScheduleDraftError({
        ...defaultInput,
        endMinute: 540,
      }),
      "종료 시간은 시작 시간보다 늦게 선택하세요.",
    );
    assert.equal(
      getPersonalScheduleDraftError({
        ...defaultInput,
        selectionMode: "WEEKDAYS",
        occurrenceDates: [],
        recurrenceStartDate: "2026-06-30",
        recurrenceEndDate: "2026-06-01",
        recurrenceWeekdays: [1],
      }),
      "반복 종료일은 시작일과 같거나 늦게 선택하세요.",
    );
  });

  test("keeps modal safety and accessible date-entry contracts in source", () => {
    assert.match(componentSource, /<AppModal[\s\S]*?mobileFullscreen/);
    assert.match(componentSource, /labelledBy="youth-personal-schedule-modal-title"/);
    assert.match(componentSource, /describedBy="youth-personal-schedule-modal-description"/);
    assert.match(componentSource, /role="alert"[\s\S]*?tabIndex=\{-1\}/);
    assert.match(componentSource, /errorRef\.current\?\.focus/);
    assert.match(componentSource, /data-modal-initial-focus/);
    assert.match(componentSource, /<DatePickerInput[\s\S]*?적용 날짜/);
    assert.match(componentSource, /날짜 추가/);
    assert.match(componentSource, /반복 시작일/);
    assert.match(componentSource, /반복 종료일/);
    assert.match(componentSource, /grid-cols-4[\s\S]*?sm:grid-cols-7/);
    assert.match(componentSource, /window\.confirm\(/);
    assert.match(componentSource, /삭제한 일정은 복구할 수 없습니다/);
    assert.match(componentSource, /if \(!draft \|\| isPending/);
    assert.match(componentSource, /disabled=\{isPending\}/);
    assert.match(componentSource, /maxLength=\{personalScheduleContentMaxLength\}/);
    assert.match(componentSource, /await updateSchedule\(draft\.scheduleId, input\)/);
    assert.match(componentSource, /await createSchedule\(selectedYouthId, input\)/);
    assert.doesNotMatch(componentSource, /sm:size-9/);
    assert.match(componentSource, /날짜를 여러 개 선택하거나 기간·요일 반복/);
    assert.match(componentSource, /수정 내용은 이 일정에 포함된 날짜 전체/);
  });
});
