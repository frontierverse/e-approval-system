import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createLearningScheduleEndMinuteOptions,
  createLearningScheduleStartMinuteOptions,
  YouthLearningProgressBoardContent as YouthLearningProgressBoard,
} from "../src/components/youth-learning-progress-board.tsx";
import type {
  YouthLearningProgressChangeLog,
  YouthLearningSchedule,
  YouthProfile,
} from "../src/lib/youth-management-core.ts";

const youths: YouthProfile[] = [
  {
    id: "youth-learning-001",
    name: "김하늘",
    admissionDate: "2026-05-01",
    dischargeDate: "2026-12-31",
    age: 17,
    phone: "010-1111-2222",
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
  },
  {
    id: "youth-learning-002",
    name: "최예담",
    admissionDate: null,
    dischargeDate: null,
    age: null,
    phone: null,
    familyContacts: [],
    notes: [],
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
    },
    actor: {
      id: "user-001",
      name: "신승식",
      email: "staff@example.com",
      profileImageStorageKey: null,
      profileImageUpdatedAt: null,
    },
  },
];

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

  test("renders editable student columns and hourly schedule cells", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthLearningProgressBoard, {
        changeLogs,
        createYouth: async (name) => ({
          ok: true,
          data: {
            youth: {
              id: "created-youth",
              name,
              admissionDate: null,
              dischargeDate: null,
              age: null,
              phone: null,
              familyContacts: [],
              notes: [],
            },
          },
        }),
        deleteSchedule: async (youthId, scheduleDate, startMinute) => ({
          ok: true,
          data: { youthId, scheduleDate, startMinute },
        }),
        deleteYouth: async (youthId) => ({
          ok: true,
          data: { youthId },
        }),
        saveSchedule: async (
          youthId,
          scheduleDate,
          startMinute,
          endMinute,
          content,
          repeatsWeekly,
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
              repeatsWeekly,
              recurrenceSourceDate: null,
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
    assert.match(html, /href="\/youth\/learning-progress\?date=2026-06-17"/);
    assert.match(html, /value="2026-06-18"/);
    assert.match(html, /href="\/youth\/learning-progress\?date=2026-06-19"/);
    assert.match(html, /학생 이름/);
    assert.match(html, />추가</);
    assert.match(html, /시간/);
    assert.match(html, /grid-template-columns:6\.5rem/);
    assert.match(html, /오전 9시 -/);
    assert.match(html, /오전 10시/);
    assert.match(html, /오후 5시 -/);
    assert.match(html, /오후 6시/);
    assert.match(html, /김하늘/);
    assert.match(html, /최예담/);
    assert.match(html, /삭제/);
    assert.match(html, /수학 문제집 12쪽/);
    assert.match(html, /오전 9시 - 오전 10시 30분/);
    assert.match(html, /종료 시간 조절/);
    assert.match(html, /매주 반복/);
    assert.match(html, /미입력/);
    assert.match(html, /최근 학습 관련 기록/);
    assert.match(html, /수학 학습 집중력 향상/);
    assert.match(html, /최근 변경 내역/);
    assert.match(html, /staff@example\.com/);
    assert.match(html, /변경 전/);
    assert.match(html, /수학 문제집 10쪽/);
    assert.match(html, /변경 후/);
    assert.match(html, /수학 문제집 12쪽/);
    assert.match(html, /2026\. 05\. 31\./);
    assert.doesNotMatch(html, /보호자 상담 일정/);
  });

  test("keeps the add-student form visible when there are no students", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthLearningProgressBoard, {
        changeLogs: [],
        createYouth: async (name) => ({
          ok: true,
          data: {
            youth: {
              id: "created-youth",
              name,
              admissionDate: null,
              dischargeDate: null,
              age: null,
              phone: null,
              familyContacts: [],
              notes: [],
            },
          },
        }),
        deleteSchedule: async (youthId, scheduleDate, startMinute) => ({
          ok: true,
          data: { youthId, scheduleDate, startMinute },
        }),
        deleteYouth: async (youthId) => ({
          ok: true,
          data: { youthId },
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

    assert.match(html, /학생 이름/);
    assert.match(html, /등록된 학생이 없습니다/);
    assert.doesNotMatch(html, /최근 학습 관련 기록/);
  });
});
