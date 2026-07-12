import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createYouthDischargeAlertItems,
  createYouthDischargeTopbarAlert,
  formatYouthDischargeAlertDateWithWeekday,
  getUpcomingYouthDischarge,
  type YouthDischargeAlertPerson,
} from "../src/lib/youth-discharge-alerts-core.ts";

const youths: YouthDischargeAlertPerson[] = [
  { dischargeDate: "2026-07-12", id: "youth-001", name: "가람" },
  { dischargeDate: "2026-07-26", id: "youth-002", name: "나래" },
  { dischargeDate: "2026-07-27", id: "youth-003", name: "다온" },
  { dischargeDate: "2026-07-10", id: "youth-004", name: "라온" },
];

describe("youth discharge alerts", () => {
  test("includes admitted youths scheduled to discharge within thirty-one days", () => {
    const items = createYouthDischargeAlertItems(youths, "2026-07-12");

    assert.equal(items.length, 3);
    assert.equal(items[0].name, "가람");
    assert.equal(items[0].ddayLabel, "D-Day");
    assert.equal(items[1].name, "나래");
    assert.equal(items[1].ddayLabel, "D-14");
    assert.equal(items[2].name, "다온");
    assert.equal(items[2].ddayLabel, "D-15");
  });

  test("creates a topbar alert from the nearest discharge date", () => {
    const alert = createYouthDischargeTopbarAlert(youths, "2026-07-12");

    assert.equal(alert?.youthName, "가람");
    assert.equal(alert?.ddayLabel, "D-Day");
    assert.equal(alert?.items.length, 3);
  });

  test("excludes invalid and past discharge dates", () => {
    assert.equal(
      getUpcomingYouthDischarge("2026-07-11", "2026-07-12"),
      null,
    );
    assert.equal(getUpcomingYouthDischarge("not-a-date", "2026-07-12"), null);
  });

  test("formats a discharge date with its weekday", () => {
    assert.equal(
      formatYouthDischargeAlertDateWithWeekday("2026-07-12"),
      "2026.07.12 (일)",
    );
  });
});
