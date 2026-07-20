import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getKoreanWeekdayLabel } from "../src/lib/korean-date.ts";

describe("getKoreanWeekdayLabel", () => {
  test("returns the Korean weekday for a valid calendar date", () => {
    assert.equal(getKoreanWeekdayLabel("2026-05-01"), "금");
  });

  test("rejects malformed and impossible calendar dates", () => {
    assert.equal(getKoreanWeekdayLabel("2026-02-29"), null);
    assert.equal(getKoreanWeekdayLabel("not-a-date"), null);
  });
});
