import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkLogLinkedSchedulePanel } from "../src/components/work-log-board.tsx";
import {
  formatWorkLogLinkedScheduleCount,
  formatWorkLogLinkedScheduleLine,
  formatWorkLogLinkedScheduleMergeFeedback,
  formatWorkLogLinkedScheduleTime,
  formatWorkLogLinkedScheduleTimeRange,
  mergeWorkLogLinkedSchedulesIntoContent,
  sortWorkLogLinkedSchedules,
  type WorkLogLinkedSchedule,
} from "../src/lib/work-log-linked-schedule-core.ts";

const querySource = read("../src/lib/work-log-linked-schedules.ts");
const workLogsSource = read("../src/lib/work-logs.ts");
const pageSource = read("../src/app/work-schedule/work-log/page.tsx");
const apiSource = read("../src/app/api/work-logs/[date]/route.ts");
const boardSource = read("../src/components/work-log-board.tsx");

describe("work-log linked schedule core", () => {
  test("formats the full supported day and count labels", () => {
    assert.equal(formatWorkLogLinkedScheduleTime(0), "00:00");
    assert.equal(formatWorkLogLinkedScheduleTime(9 * 60 + 10), "09:10");
    assert.equal(formatWorkLogLinkedScheduleTime(23 * 60 + 50), "23:50");
    assert.equal(formatWorkLogLinkedScheduleTime(24 * 60), "24:00");
    assert.equal(formatWorkLogLinkedScheduleTimeRange(0, 24 * 60), "00:00-24:00");
    assert.equal(formatWorkLogLinkedScheduleCount(0), "0건");
    assert.equal(formatWorkLogLinkedScheduleCount(12), "12건");
  });

  test("sorts without mutating by start, end, youth, content, and id", () => {
    const schedules = [
      createSchedule({ id: "last", startMinute: 600 }),
      createSchedule({ id: "longer", endMinute: 620 }),
      createSchedule({ id: "youth-later", youthName: "나래" }),
      createSchedule({ content: "진료", id: "content-later" }),
      createSchedule({ id: "tie-b" }),
      createSchedule({ id: "tie-a" }),
      createSchedule({ id: "shorter", endMinute: 590 }),
      createSchedule({ id: "first", startMinute: 480 }),
    ];
    const originalIds = schedules.map((schedule) => schedule.id);

    const sorted = sortWorkLogLinkedSchedules(schedules);

    assert.deepEqual(
      sorted.map((schedule) => schedule.id),
      [
        "first",
        "shorter",
        "tie-a",
        "tie-b",
        "content-later",
        "youth-later",
        "longer",
        "last",
      ],
    );
    assert.deepEqual(
      schedules.map((schedule) => schedule.id),
      originalIds,
    );
    assert.notEqual(sorted, schedules);
  });

  test("normalizes multiline schedule text into exactly one work-log line", () => {
    assert.equal(
      formatWorkLogLinkedScheduleLine(
        createSchedule({
          content: "  병원 진료\r\n\r\n 결과\t 확인  ",
          youthName: "  홍길동\n 학생  ",
        }),
      ),
      "09:00-10:00 홍길동 학생 · 병원 진료 결과 확인",
    );
  });

  test("merges sorted unique lines and ignores existing or repeated schedules", () => {
    const existingSchedule = createSchedule({
      content: "상담",
      id: "existing",
    });
    const earlySchedule = createSchedule({
      content: "등원 지원",
      endMinute: 8 * 60 + 50,
      id: "early",
      startMinute: 8 * 60,
      youthName: "나래",
    });
    const lateSchedule = createSchedule({
      content: "귀가 지원",
      endMinute: 18 * 60,
      id: "late",
      startMinute: 17 * 60,
      youthName: "다온",
    });
    const existingLine = formatWorkLogLinkedScheduleLine(existingSchedule);

    assert.deepEqual(
      mergeWorkLogLinkedSchedulesIntoContent({
        content: `기존 업무\n${existingLine}\n`,
        schedules: [
          lateSchedule,
          existingSchedule,
          earlySchedule,
          { ...earlySchedule, id: "same-rendered-line" },
        ],
      }),
      {
        addedCount: 2,
        content: [
          "기존 업무",
          existingLine,
          formatWorkLogLinkedScheduleLine(earlySchedule),
          formatWorkLogLinkedScheduleLine(lateSchedule),
        ].join("\n"),
        skippedCount: 0,
      },
    );
  });

  test("deduplicates multiline input against its normalized existing line", () => {
    const schedule = createSchedule({
      content: "병원 진료\n결과 확인",
      youthName: "홍길동\r\n학생",
    });
    const normalizedLine =
      "09:00-10:00 홍길동 학생 · 병원 진료 결과 확인";

    assert.deepEqual(
      mergeWorkLogLinkedSchedulesIntoContent({
        content: normalizedLine,
        schedules: [schedule],
      }),
      {
        addedCount: 0,
        content: normalizedLine,
        skippedCount: 0,
      },
    );
  });

  test("accepts an exact length boundary and reports every line that cannot fit", () => {
    const first = createSchedule({ content: "상담", id: "first" });
    const second = createSchedule({ content: "진료", id: "second" });
    const firstLine = formatWorkLogLinkedScheduleLine(first);
    const prefix = "기존 업무";
    const exactLimit = prefix.length + 1 + firstLine.length;

    assert.deepEqual(
      mergeWorkLogLinkedSchedulesIntoContent({
        content: prefix,
        maxLength: exactLimit,
        schedules: [second, first],
      }),
      {
        addedCount: 1,
        content: `${prefix}\n${firstLine}`,
        skippedCount: 1,
      },
    );

    assert.deepEqual(
      mergeWorkLogLinkedSchedulesIntoContent({
        content: "",
        maxLength: firstLine.length,
        schedules: [first],
      }),
      {
        addedCount: 1,
        content: firstLine,
        skippedCount: 0,
      },
    );

    assert.deepEqual(
      mergeWorkLogLinkedSchedulesIntoContent({
        content: "",
        maxLength: firstLine.length - 1,
        schedules: [first],
      }),
      {
        addedCount: 0,
        content: "",
        skippedCount: 1,
      },
    );
  });

  test("returns unambiguous feedback for every merge outcome", () => {
    assert.equal(
      formatWorkLogLinkedScheduleMergeFeedback({
        addedCount: 2,
        skippedCount: 1,
      }),
      "개인 일정 2건을 내용에 추가했습니다. 내용 길이 제한으로 1건은 추가하지 못했습니다.",
    );
    assert.equal(
      formatWorkLogLinkedScheduleMergeFeedback({
        addedCount: 2,
        skippedCount: 0,
      }),
      "개인 일정 2건을 내용에 추가했습니다.",
    );
    assert.equal(
      formatWorkLogLinkedScheduleMergeFeedback({
        addedCount: 0,
        skippedCount: 1,
      }),
      "내용 길이 제한으로 개인 일정을 추가하지 못했습니다. 내용을 줄인 뒤 다시 시도해 주세요.",
    );
    assert.equal(
      formatWorkLogLinkedScheduleMergeFeedback({
        addedCount: 0,
        skippedCount: 0,
      }),
      "개인 일정이 이미 내용에 모두 들어 있습니다.",
    );
  });
});

describe("work-log linked schedule integration contracts", () => {
  test("renders compact ready, empty, loading, and recoverable error states", () => {
    const readyHtml = renderToStaticMarkup(
      React.createElement(WorkLogLinkedSchedulePanel, {
        loadState: {
          schedules: [
            createSchedule({
              content: "병원 진료\n결과 확인",
              youthName: "홍길동 학생",
            }),
          ],
          status: "ready",
        },
        onMerge: () => ({ addedCount: 1, content: "", skippedCount: 0 }),
      }),
    );
    const emptyHtml = renderToStaticMarkup(
      React.createElement(WorkLogLinkedSchedulePanel, {
        loadState: { schedules: [], status: "ready" },
        onMerge: () => ({ addedCount: 0, content: "", skippedCount: 0 }),
      }),
    );
    const loadingHtml = renderToStaticMarkup(
      React.createElement(WorkLogLinkedSchedulePanel, {
        loadState: { status: "loading" },
        onMerge: () => ({ addedCount: 0, content: "", skippedCount: 0 }),
      }),
    );
    const errorHtml = renderToStaticMarkup(
      React.createElement(WorkLogLinkedSchedulePanel, {
        loadState: { status: "error" },
        onMerge: () => ({ addedCount: 0, content: "", skippedCount: 0 }),
        onRetry: () => undefined,
      }),
    );

    assert.match(readyHtml, /<section[^>]*aria-labelledby=/);
    assert.match(readyHtml, /개인 일정/);
    assert.match(readyHtml, /1건/);
    assert.match(readyHtml, /09:00-10:00/);
    assert.match(readyHtml, /홍길동 학생/);
    assert.match(readyHtml, /병원 진료 결과 확인/);
    assert.match(
      readyHtml,
      /<button[^>]*class="[^"]*h-11[^"]*"[^>]*type="button"[^>]*>내용에 추가<\/button>/,
    );
    assert.match(emptyHtml, /선택한 날짜에 등록된 개인 일정이 없습니다/);
    assert.match(emptyHtml, /role="status"/);
    assert.doesNotMatch(emptyHtml, /내용에 추가/);
    assert.match(loadingHtml, /aria-busy="true"/);
    assert.match(loadingHtml, /role="status"/);
    assert.match(errorHtml, /role="alert"/);
    assert.match(errorHtml, /업무일지는 계속 작성할 수 있습니다/);
    assert.match(errorHtml, />다시 불러오기<\/button>/);
  });

  test("queries one valid date with a minimal youth schedule projection", () => {
    assert.match(querySource, /import "server-only"/);
    assert.match(
      querySource,
      /if \(!isWorkLogDate\(workDate\)\)\s*\{\s*return \[\]/,
    );
    assert.match(
      querySource,
      /occurrenceDates:\s*\{\s*has:\s*workDate/,
    );
    assert.match(querySource, /dischargeDate:\s*null/);
    assert.match(querySource, /dischargeDate:\s*""/);
    assert.match(querySource, /dischargeDate:\s*\{\s*gte:\s*workDate/);
    assert.match(querySource, /select:\s*workLogLinkedScheduleSelect/);
    assert.match(
      querySource,
      /sortWorkLogLinkedSchedules\(records\.map\(mapWorkLogLinkedSchedule\)\)/,
    );

    const selectSource = extractSection(
      querySource,
      "export const workLogLinkedScheduleSelect = {",
      "export type WorkLogLinkedScheduleRecord",
    );

    for (const field of [
      "content",
      "endMinute",
      "id",
      "startMinute",
      "youthId",
      "name",
    ]) {
      assert.match(selectSource, new RegExp(`\\b${field}\\b`));
    }

    assert.doesNotMatch(
      selectSource,
      /birthDate|phone|familyContact|occurrenceDates|recurrence|createdAt|updatedAt/,
    );
  });

  test("carries linked schedules through page data into the work-log board", () => {
    assert.match(
      workLogsSource,
      /linkedScheduleState:\s*WorkLogLinkedScheduleLoadState/,
    );
    assert.match(
      workLogsSource,
      /getWorkLogLinkedScheduleLoadState\(selectedDate\)/,
    );
    assert.match(
      workLogsSource,
      /return\s*\{[\s\S]*?linkedScheduleState,[\s\S]*?selectedLog/,
    );
    assert.match(
      pageSource,
      /linkedScheduleState=\{pageData\.linkedScheduleState\}/,
    );
    assert.match(boardSource, /type WorkLogLinkedSchedule/);
    assert.match(
      boardSource,
      /export function WorkLogBoard\(\{[\s\S]*?linkedScheduleState/,
    );
    assert.match(
      boardSource,
      /<WorkLogEntryForm[\s\S]*?linkedScheduleState=\{linkedScheduleState\}/,
    );
    assert.match(
      boardSource,
      /mergeWorkLogLinkedSchedulesIntoContent\(\{/,
    );
  });

  test("authenticates and validates before returning API-linked schedules", () => {
    const unauthenticatedGuardIndex = apiSource.indexOf("if (!user)");
    const invalidDateGuardIndex = apiSource.indexOf(
      "if (!isWorkLogDate(date) || date > getWorkLogToday())",
    );
    const linkedScheduleQueryIndex = apiSource.indexOf(
      "getWorkLogLinkedScheduleLoadState(date)",
    );

    assert.ok(unauthenticatedGuardIndex >= 0);
    assert.ok(invalidDateGuardIndex > unauthenticatedGuardIndex);
    assert.ok(linkedScheduleQueryIndex > invalidDateGuardIndex);
    assert.match(
      apiSource,
      /getWorkLogEntry\(\{[\s\S]*?authorId:\s*user\.id,[\s\S]*?workDate:\s*date/,
    );
    assert.match(apiSource, /\{\s*entry,\s*linkedScheduleState\s*\}/);
    assert.match(apiSource, /"Cache-Control":\s*"private, no-store"/);
    assert.doesNotMatch(apiSource, /authorId.*searchParams/);
  });

  test("consumes API-linked schedules instead of silently discarding them", () => {
    assert.match(
      boardSource,
      /linkedScheduleState\??:\s*WorkLogLinkedScheduleLoadState/,
    );
    assert.match(boardSource, /payload\.linkedScheduleState/);
  });

  test("retries only schedules without unmounting a loaded modal entry", () => {
    assert.match(
      boardSource,
      /type WorkLogDetailLoadRequest = \{[\s\S]*?mode: "all" \| "schedules"/,
    );
    assert.match(
      boardSource,
      /const shouldLoadEntry = loadRequest\.mode === "all"/,
    );
    assert.match(
      boardSource,
      /onRetryLinkedSchedules=\{\(\) => requestDetailLoad\("schedules"\)\}/,
    );
    assert.match(
      boardSource,
      /restoreFocusAfterRetryRef[\s\S]*?actionRef\.current \?\? panelRef\.current/,
    );
    assert.match(
      boardSource,
      /isScheduleRefreshPending[\s\S]*?startScheduleRefresh\(\(\) => \{[\s\S]*?router\.refresh\(\)/,
    );
  });

  test("isolates optional schedule query failures from the work log", () => {
    assert.match(
      querySource,
      /export async function getWorkLogLinkedScheduleLoadState/,
    );
    assert.match(
      querySource,
      /catch \(error\)[\s\S]*?logServerEvent\([\s\S]*?return \{ status: "error" \}/,
    );
    assert.match(
      workLogsSource,
      /getWorkLogLinkedScheduleLoadState\(selectedDate\)/,
    );
    assert.match(
      apiSource,
      /getWorkLogLinkedScheduleLoadState\(date\)/,
    );
  });
});

function createSchedule(
  overrides: Partial<WorkLogLinkedSchedule> = {},
): WorkLogLinkedSchedule {
  return {
    id: "schedule",
    youthId: "youth-001",
    youthName: "가람",
    content: "상담",
    startMinute: 9 * 60,
    endMinute: 10 * 60,
    ...overrides,
  };
}

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function extractSection(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  assert.notEqual(start, -1, `${startMarker} section is required`);
  assert.notEqual(end, -1, `${endMarker} section is required`);

  return source.slice(start, end);
}
