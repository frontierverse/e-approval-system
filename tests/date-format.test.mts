import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatDate, formatDateTime } from "../src/lib/mock-data.ts";

describe("date formatting", () => {
  test("includes the year in dates", () => {
    assert.equal(formatDate("2026-05-11T12:02:00+09:00"), "2026. 05. 11.");
  });

  test("uses Korean day period labels for date times", () => {
    assert.equal(
      formatDateTime("2026-05-11T00:05:00+09:00"),
      "2026. 05. 11. 오전 12:05",
    );
    assert.equal(
      formatDateTime("2026-05-11T12:02:00+09:00"),
      "2026. 05. 11. 오후 12:02",
    );
    assert.equal(
      formatDateTime("2026-05-11T23:45:00+09:00"),
      "2026. 05. 11. 오후 11:45",
    );
  });
});
