import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getWorkLogReminderDecision,
  workLogReminderSupportedYears,
} from "../src/lib/work-log-reminder-core.ts";

const atNineKst = (date: string) => new Date(`${date}T09:00:00+09:00`);

describe("daily work log reminder calendar", () => {
  test("only allows the Korean 9 a.m. hour, including delayed cron execution", () => {
    for (const time of ["09:00:00.000", "09:30:00.000", "09:59:59.999"]) {
      assert.deepEqual(
        getWorkLogReminderDecision(new Date(`2026-10-12T${time}+09:00`)),
        { date: "2026-10-12", shouldSend: true, reason: "working-day" },
      );
    }

    for (const time of ["00:00:00.000", "08:59:59.999", "10:00:00.000", "21:00:00.000"]) {
      assert.equal(
        getWorkLogReminderDecision(new Date(`2026-10-12T${time}+09:00`)).reason,
        "outside-send-window",
      );
    }
  });

  test("uses Korean date and time independently of the server timezone", () => {
    assert.deepEqual(
      getWorkLogReminderDecision(new Date("2026-10-12T00:00:00Z")),
      { date: "2026-10-12", shouldSend: true, reason: "working-day" },
    );
    assert.deepEqual(
      getWorkLogReminderDecision(new Date("2026-12-31T15:00:00Z")),
      { date: "2027-01-01", shouldSend: false, reason: "outside-send-window" },
    );
  });

  test("rejects Saturday and Sunday", () => {
    for (const date of ["2026-10-17", "2026-10-18"]) {
      assert.deepEqual(getWorkLogReminderDecision(atNineKst(date)), {
        date,
        shouldSend: false,
        reason: "weekend",
      });
    }
  });

  test("excludes every 2026 weekday holiday including election day and new holidays", () => {
    const weekdayHolidays = [
      "2026-01-01",
      "2026-02-16", "2026-02-17", "2026-02-18",
      "2026-03-02",
      "2026-05-01", "2026-05-05", "2026-05-25",
      "2026-06-03",
      "2026-07-17",
      "2026-08-17",
      "2026-09-24", "2026-09-25",
      "2026-10-05", "2026-10-09",
      "2026-12-25",
    ];

    for (const date of weekdayHolidays) {
      assert.deepEqual(getWorkLogReminderDecision(atNineKst(date)), {
        date,
        shouldSend: false,
        reason: "holiday",
      });
    }
  });

  test("excludes 2027 lunar holidays and every published substitute holiday", () => {
    const weekdayHolidays = [
      "2027-01-01",
      "2027-02-08", "2027-02-09",
      "2027-03-01",
      "2027-05-03", "2027-05-05", "2027-05-13",
      "2027-07-19",
      "2027-08-16",
      "2027-09-14", "2027-09-15", "2027-09-16",
      "2027-10-04", "2027-10-11",
      "2027-12-27",
    ];

    for (const date of weekdayHolidays) {
      assert.deepEqual(getWorkLogReminderDecision(atNineKst(date)), {
        date,
        shouldSend: false,
        reason: "holiday",
      });
    }
  });

  test("does not invent substitute holidays or treat observances as days off", () => {
    for (const date of [
      "2026-06-08", // Memorial Day has no substitute holiday.
      "2026-09-28", // Chuseok ends Saturday; no substitute holiday in 2026.
      "2026-10-01", // Armed Forces Day has no declared holiday in 2026.
      "2027-06-07", // Memorial Day falls Sunday; still no substitute.
      "2027-09-17", // First working day after Chuseok.
    ]) {
      assert.equal(getWorkLogReminderDecision(atNineKst(date)).shouldSend, true, date);
    }
  });

  test("matches the official total days off for a five-day workweek", () => {
    // KASA's 2027 announcement: 2026 gained Labor/Constitution Days (120),
    // while 2027 has 119 total weekend/public holidays.
    for (const [year, daysOff] of [[2026, 120], [2027, 119]]) {
      let excluded = 0;

      for (let day = 0; day < 365; day += 1) {
        const now = new Date(Date.UTC(year, 0, 1 + day));
        if (!getWorkLogReminderDecision(now).shouldSend) {
          excluded += 1;
        }
      }

      assert.equal(excluded, daysOff, String(year));
    }
  });

  test("blocks unreviewed years and invalid dates", () => {
    assert.deepEqual(workLogReminderSupportedYears, ["2026", "2027"]);

    for (const date of ["2025-12-31", "2028-01-03"]) {
      assert.deepEqual(getWorkLogReminderDecision(atNineKst(date)), {
        date,
        shouldSend: false,
        reason: "unsupported-year",
      });
    }

    assert.deepEqual(getWorkLogReminderDecision(new Date("invalid")), {
      date: "",
      shouldSend: false,
      reason: "invalid-date",
    });
  });
});
