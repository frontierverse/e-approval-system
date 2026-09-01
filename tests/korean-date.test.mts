import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatKoreanDateTime,
  getKoreanDateTimeParts,
  getKoreanWeekdayLabel,
} from "../src/lib/korean-date.ts";

describe("getKoreanWeekdayLabel", () => {
  test("returns the Korean weekday for a valid calendar date", () => {
    assert.equal(getKoreanWeekdayLabel("2026-05-01"), "금");
  });

  test("rejects malformed and impossible calendar dates", () => {
    assert.equal(getKoreanWeekdayLabel("2026-02-29"), null);
    assert.equal(getKoreanWeekdayLabel("not-a-date"), null);
  });
});

describe("Korean date-time formatting", () => {
  test("formats Seoul morning and afternoon labels without locale-dependent day periods", () => {
    assert.equal(
      formatKoreanDateTime("2026-07-06T02:15:19.982Z"),
      "2026년 7월 6일 오전 11:15",
    );
    assert.equal(
      formatKoreanDateTime("2026-07-07T08:48:11.420Z"),
      "2026년 7월 7일 오후 5:48",
    );
  });

  test("normalizes midnight and rejects invalid values", () => {
    assert.deepEqual(getKoreanDateTimeParts("2026-07-06T15:00:00.000Z"), {
      year: "2026",
      month: "07",
      day: "07",
      hour: 0,
      minute: "00",
    });
    assert.equal(formatKoreanDateTime("not-a-date"), null);
  });
});
