import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createLearningScheduleEndMinuteOptions,
  createLearningScheduleStartMinuteOptions,
  TimetableSkeleton,
  YouthLearningProgressChangeLogFilterControlsContent,
  YouthLearningProgressBoardContent as YouthLearningProgressBoard,
} from "../src/components/youth-learning-progress-board.tsx";
import {
  shouldShowYouthLearningProgressChangeLogActor,
  type YouthLearningProgressChangeLogActor,
  type YouthLearningProgressChangeLogFilters,
  type YouthLearningProgressChangeLog,
  type YouthLearningSchedule,
  type YouthProfile,
} from "../src/lib/youth-management-core.ts";

const youths: YouthProfile[] = [
  {
    id: "youth-learning-001",
    name: "김하늘",
    admissionDate: "2026-05-01",
    dischargeDate: "2026-12-31",
    birthDate: "2009-06-10",
    age: 17,
    phone: "010-1111-2222",
    decisionDocuments: [],
    familyContacts: [],
    notes: [
      {
        id: "learning-note-001",
        title: "수학 학습 집중력 향상",
        summary: "분수 문제 풀이를 20분 이상 집중해서 마쳤습니다.",
        detail: "기초 연산 지도를 안정적으로 따라가고 있습니다.",
        category: "학원",
        recordedAt: "2026-05-31",
        author: "정하리",
        priority: "보통",
      },
      {
        id: "family-note-001",
        title: "보호자 상담 일정",
        summary: "보호자와 주간 일정 조정을 논의했습니다.",
        detail: "가정 연락이 필요합니다.",
        category: "가족",
        recordedAt: "2026-05-30",
        author: "박서준",
        priority: "보통",
      },
    ],
    updatedAt: "2026-06-21T12:45:00.000Z",
  },
  {
    id: "youth-learning-002",
    name: "최예담",
    admissionDate: null,
    dischargeDate: null,
    birthDate: null,
    age: null,
    phone: null,
    decisionDocuments: [],
    familyContacts: [],
    notes: [],
    updatedAt: "2026-06-20T09:00:00.000Z",
  },
];

const schedules: YouthLearningSchedule[] = [
  {
    id: "schedule-001",
    youthId: "youth-learning-001",
    scheduleDate: "2026-06-18",
    startHour: 9,
    startMinute: 540,
    endHour: 11,
    endMinute: 630,
    content: "수학 문제집 12쪽",
    repeatsWeekly: true,
    recurrenceSourceDate: null,
    recurrenceWeekdays: [1, 3, 5],
  },
];

const changeLogs: YouthLearningProgressChangeLog[] = [
  {
    id: "change-log-001",
    message: "김하늘 오전 9시-오전 10시 스케줄을 변경했습니다.",
    createdAt: "2026-06-17T01:30:00.000Z",
    metadata: {
      previousContent: "수학 문제집 10쪽",
      nextContent: "수학 문제집 12쪽",
      scheduleDate: "2026-06-18",
    },
    actor: {
      id: "user-001",
      name: "최윤서",
      email: "staff@example.com",
      profileImageStorageKey: null,
      profileImageUpdatedAt: null,
    },
  },
];

const changeLogActors: YouthLearningProgressChangeLogActor[] = [
  {
    id: "user-001",
    name: "최윤서",
    email: "staff@example.com",
  },
  {
    id: "user-002",
    name: "정하리",
    email: "teacher@example.com",
  },
];

const changeLogFilters: YouthLearningProgressChangeLogFilters = {
  actorId: "user-001",
  page: 1,
  pageSize: 5,
  scheduleDate: "2026-06-18",
  total: 8,
  totalPages: 2,
};

function createChangeLogFilterControls({
  actors = changeLogActors,
  filters = changeLogFilters,
  selectedDate = "2026-06-18",
}: {
  actors?: YouthLearningProgressChangeLogActor[];
  filters?: YouthLearningProgressChangeLogFilters;
  selectedDate?: string;
} = {}) {
  return React.createElement(YouthLearningProgressChangeLogFilterControlsContent, {
    actors,
    filters,
    navigate: () => {},
    selectedDate,
  });
}

describe("YouthLearningProgressBoard", () => {
  test("creates start and end time options in ten-minute steps", () => {
    const startOptions = createLearningScheduleStartMinuteOptions();
    const endOptionsFromNine = createLearningScheduleEndMinuteOptions(540);
    const endOptionsFromLastStart = createLearningScheduleEndMinuteOptions(1070);

    assert.deepEqual(startOptions.slice(0, 3), [540, 550, 560]);
    assert.equal(startOptions.at(-1), 1070);
    assert.deepEqual(endOptionsFromNine.slice(0, 3), [550, 560, 570]);
    assert.equal(endOptionsFromNine.at(-1), 1080);
    assert.deepEqual(endOptionsFromLastStart, [1080]);
  });

  test("hides Shin Seungsik's learning progress change logs", () => {
    assert.equal(shouldShowYouthLearningProgressChangeLogActor("신승식"), false);
    assert.equal(
      shouldShowYouthLearningProgressChangeLogActor(" 신승식 "),
      false,
    );
    assert.equal(shouldShowYouthLearningProgressChangeLogActor("정하리"), true);
  });

  test("renders a stable timetable skeleton while schedules load", () => {
    const html = renderToStaticMarkup(
      React.createElement(TimetableSkeleton, {
        youthCount: 2,
      }),
    );
    const overlayHtml = renderToStaticMarkup(
      React.createElement(TimetableSkeleton, {
        overlay: true,
        youthCount: 2,
      }),
    );

    assert.match(html, /aria-label="시간표 불러오는 중"/);
    assert.ok(html.includes("dark:bg-[#161b22]"));
    assert.ok(html.includes("dark:bg-[#58a6ff]/35"));
    assert.match(
      html,
      /grid-template-columns:6\.5rem repeat\(2, minmax\(12rem, 1fr\)\)/,
    );
    assert.match(overlayHtml, /absolute inset-0/);
    assert.match(html, /오전 9시 -/);
    assert.match(html, /오후 6시/);
    assert.doesNotMatch(html, /시간표 갱신 중/);
  });

  test("renders editable student columns and hourly schedule cells", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthLearningProgressBoard, {
        changeLogActors,
        changeLogFilterControls: createChangeLogFilterControls(),
        changeLogFilters,
        changeLogs,
        deleteSchedule: async (youthId, scheduleDate, startMinute) => ({
          ok: true,
          data: { youthId, scheduleDate, startMinute },
        }),
        loadSchedules: async (scheduleDate) => ({
          ok: true,
          data: { scheduleDate, schedules },
        }),
        saveSchedule: async (
          youthId,
          scheduleDate,
          startMinute,
          endMinute,
          content,
          recurrenceWeekdays,
        ) => ({
          ok: true,
          data: {
            schedule: {
              id: "saved-schedule",
              youthId,
              scheduleDate,
              startHour: Math.floor(startMinute / 60),
              startMinute,
              endHour: Math.ceil(endMinute / 60),
              endMinute,
              content,
              repeatsWeekly: recurrenceWeekdays.length > 0,
              recurrenceSourceDate: null,
              recurrenceWeekdays,
            },
          },
        }),
        schedules,
        selectedDate: "2026-06-18",
        youths,
      }),
    );

    assert.match(html, /학습진도 시간표/);
    assert.match(html, /2026\. 06\. 18\. \(목\)/);
    assert.match(html, />이전 날</);
    assert.match(html, /value="2026-06-18"/);
    assert.match(html, />다음 날</);
    assert.match(
      html,
      /href="\/youth\/learning-progress\/print\?date=2026-06-18"/,
    );
    assert.doesNotMatch(
      html,
      /href="\/youth\/learning-progress\?date=2026-06-17"/,
    );
    assert.doesNotMatch(
      html,
      /href="\/youth\/learning-progress\?date=2026-06-19"/,
    );
    assert.doesNotMatch(html, /placeholder="학생 이름"/);
    assert.doesNotMatch(html, />추가</);
    assert.match(html, /시간/);
    assert.match(html, /grid-template-columns:6\.5rem/);
    assert.match(html, /오전 9시 -/);
    assert.match(html, /오전 10시/);
    assert.match(html, /오후 5시 -/);
    assert.match(html, /오후 6시/);
    assert.match(html, /김하늘/);
    assert.match(html, /최예담/);
    assert.doesNotMatch(html, />삭제</);
    assert.match(html, /수학 문제집 12쪽/);
    assert.match(html, /오전 9시 - 오전 10시 30분/);
    assert.match(html, /종료 시간 조절/);
    assert.match(html, /매주 월·수·금/);
    assert.match(html, /미입력/);
    assert.match(html, /최근 학습 관련 기록/);
    assert.match(html, /수학 학습 집중력 향상/);
    assert.match(html, /최근 변경 내역/);
    assert.match(html, /8건 중 1-5건 표시/);
    assert.match(html, /name="logStaff"/);
    assert.match(html, /name="logDate"/);
    assert.match(html, /최윤서/);
    assert.match(html, /정하리/);
    assert.match(html, /value="2026-06-18"/);
    assert.match(
      html,
      /href="\/youth\/learning-progress\?date=2026-06-18&amp;logStaff=user-001&amp;logDate=2026-06-18&amp;logPage=2"/,
    );
    assert.match(html, /staff@example\.com/);
    assert.match(html, /시간표 날짜/);
    assert.match(html, /2026\. 06\. 18\. \(목\)/);
    assert.match(html, /변경 전/);
    assert.match(html, /수학 문제집 10쪽/);
    assert.match(html, /변경 후/);
    assert.match(html, /수학 문제집 12쪽/);
    assert.match(html, /2026\. 05\. 31\./);
    assert.doesNotMatch(html, /보호자 상담 일정/);
  });

  test("renders an empty state when there are no students", () => {
    const emptyChangeLogFilters = {
      actorId: "all",
      page: 1,
      pageSize: 5,
      scheduleDate: "",
      total: 0,
      totalPages: 1,
    } satisfies YouthLearningProgressChangeLogFilters;

    const html = renderToStaticMarkup(
      React.createElement(YouthLearningProgressBoard, {
        changeLogActors: [],
        changeLogFilterControls: createChangeLogFilterControls({
          actors: [],
          filters: emptyChangeLogFilters,
        }),
        changeLogFilters: emptyChangeLogFilters,
        changeLogs: [],
        deleteSchedule: async (youthId, scheduleDate, startMinute) => ({
          ok: true,
          data: { youthId, scheduleDate, startMinute },
        }),
        loadSchedules: async (scheduleDate) => ({
          ok: true,
          data: { scheduleDate, schedules: [] },
        }),
        saveSchedule: async () => ({
          ok: true as const,
          data: { schedule: null },
        }),
        schedules: [],
        selectedDate: "2026-06-18",
        youths: [],
      }),
    );

    assert.doesNotMatch(html, /placeholder="학생 이름"/);
    assert.match(html, /등록된 학생이 없습니다/);
    assert.match(html, /청소년 관리에서 학생을 등록하면 시간표를 입력할 수 있습니다/);
    assert.doesNotMatch(html, /최근 학습 관련 기록/);
  });
});
