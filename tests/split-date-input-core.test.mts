import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getSplitDateDayLimit,
  normalizeSplitDatePart,
  normalizeSplitDateParts,
  type SplitDateParts,
} from "../src/lib/split-date-input-core.ts";

const emptyParts: SplitDateParts = {
  day: "",
  month: "",
  year: "",
};

describe("split date input core", () => {
  test("limits February days by leap year", () => {
    assert.equal(
      normalizeSplitDateParts({
        day: "30",
        month: "02",
        year: "2024",
      }).day,
      "29",
    );

    assert.equal(
      normalizeSplitDateParts({
        day: "29",
        month: "02",
        year: "2025",
      }).day,
      "28",
    );
  });

  test("uses month-specific maximum days", () => {
    assert.equal(
      normalizeSplitDateParts({
        day: "31",
        month: "04",
        year: "2026",
      }).day,
      "30",
    );

    assert.equal(
      normalizeSplitDateParts({
        day: "31",
        month: "12",
        year: "2026",
      }).day,
      "31",
    );
  });

  test("updates an existing day when the year or month changes", () => {
    assert.deepEqual(
      normalizeSplitDatePart("year", "2025", {
        day: "29",
        month: "02",
        year: "2024",
      }),
      {
        day: "28",
        month: "2",
        year: "2025",
      },
    );

    assert.deepEqual(
      normalizeSplitDatePart("month", "11", {
        day: "31",
        month: "12",
        year: "2026",
      }),
      {
        day: "30",
        month: "11",
        year: "2026",
      },
    );
  });

  test("keeps month input natural instead of forcing invalid values to twelve", () => {
    assert.deepEqual(
      normalizeSplitDatePart("month", "4", {
        ...emptyParts,
        year: "2026",
      }),
      {
        day: "",
        month: "4",
        year: "2026",
      },
    );

    assert.deepEqual(
      normalizeSplitDatePart("month", "04", {
        ...emptyParts,
        month: "0",
        year: "2026",
      }),
      {
        day: "",
        month: "4",
        year: "2026",
      },
    );

    assert.deepEqual(
      normalizeSplitDatePart("month", "13", {
        ...emptyParts,
        month: "1",
        year: "2026",
      }),
      {
        day: "",
        month: "1",
        year: "2026",
      },
    );
  });

  test("supports cafe date inputs with two-digit years", () => {
    const options = {
      yearLength: 2,
      yearPrefix: "20",
    };

    assert.equal(
      getSplitDateDayLimit({ month: "02", year: "24" }, options),
      29,
    );
    assert.equal(
      getSplitDateDayLimit({ month: "02", year: "25" }, options),
      28,
    );
    assert.deepEqual(
      normalizeSplitDatePart("day", "30", {
        ...emptyParts,
        month: "02",
        year: "24",
      }, options),
      {
        day: "29",
        month: "2",
        year: "24",
      },
    );
  });
});
