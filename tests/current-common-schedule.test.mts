import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createCurrentCommonScheduleAlert,
  getKoreanCurrentCommonScheduleClock,
  type CurrentCommonScheduleSource,
} from "../src/lib/current-common-schedule-core.ts";

const schedules: CurrentCommonScheduleSource[] = [
  {
    content: "공용 자습",
    endMinute: 630,
    id: "common-schedule-001",
    startMinute: 540,
    weekday: 4,
  },
  {
    content: "개별 상담",
    endMinute: 720,
    id: "common-schedule-002",
    startMinute: 630,
    weekday: 4,
  },
  {
    content: "주간 점검",
    endMinute: 960,
    id: "common-schedule-003",
    startMinute: 900,
    weekday: 5,
  },
];

describe("current common schedule alerts", () => {
  test("finds the schedule matching the current weekday and minute", () => {
    const alert = createCurrentCommonScheduleAlert(schedules, {
      currentMinute: 615,
      weekday: 4,
    });

    assert.deepEqual(alert, {
      content: "공용 자습",
      timeLabel: "09:00-10:30",
      weekdayLabel: "목",
    });
  });

  test("uses the next schedule when the previous one has ended", () => {
    const alert = createCurrentCommonScheduleAlert(schedules, {
      currentMinute: 630,
      weekday: 4,
    });

    assert.equal(alert?.content, "개별 상담");
    assert.equal(alert?.timeLabel, "10:30-12:00");
  });

  test("returns null when no common schedule is active", () => {
    assert.equal(
      createCurrentCommonScheduleAlert(schedules, {
        currentMinute: 615,
        weekday: 2,
      }),
      null,
    );
  });

  test("creates a Korean timezone clock", () => {
    const clock = getKoreanCurrentCommonScheduleClock(
      new Date("2026-06-25T01:15:00.000Z"),
    );

    assert.deepEqual(clock, {
      currentMinute: 615,
      weekday: 4,
    });
  });
});
