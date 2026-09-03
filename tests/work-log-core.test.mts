import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildWorkLogContributionWeeks,
  getWorkLogContributionRange,
  getWorkLogMonthLabels,
  getWorkLogToday,
  hasWorkLogFormErrors,
  hasWorkLogSaveConflict,
  isWorkLogDate,
  normalizeWorkLogFormValues,
  validateWorkLogFormValues,
  workLogContentMaxLength,
  workLogKeywordMaxLength,
} from "../src/lib/work-log-core.ts";

describe("work log core", () => {
  test("validates real calendar dates including leap days", () => {
    assert.equal(isWorkLogDate("2024-02-29"), true);
    assert.equal(isWorkLogDate("2025-02-29"), false);
    assert.equal(isWorkLogDate("2026-13-01"), false);
    assert.equal(isWorkLogDate("09/02/2026"), false);
  });

  test("normalizes form values and preserves internal line breaks", () => {
    const formData = new FormData();
    formData.set("workDate", " 2026-09-02 ");
    formData.set("keyword", "  월간 보고서  ");
    formData.set("content", "  첫 줄\n둘째 줄  ");

    assert.deepEqual(normalizeWorkLogFormValues(formData), {
      workDate: "2026-09-02",
      keyword: "월간 보고서",
      content: "첫 줄\n둘째 줄",
    });
  });

  test("rejects missing, overlong, invalid, and future values", () => {
    const emptyErrors = validateWorkLogFormValues(
      { content: "", keyword: "", workDate: "2026-02-30" },
      "2026-09-02",
    );
    assert.equal(hasWorkLogFormErrors(emptyErrors), true);
    assert.match(emptyErrors.workDate ?? "", /날짜/);
    assert.match(emptyErrors.keyword ?? "", /키워드/);
    assert.match(emptyErrors.content ?? "", /내용/);

    const limitErrors = validateWorkLogFormValues(
      {
        content: "나".repeat(workLogContentMaxLength + 1),
        keyword: "가".repeat(workLogKeywordMaxLength + 1),
        workDate: "2026-09-03",
      },
      "2026-09-02",
    );
    assert.match(limitErrors.workDate ?? "", /오늘 이후/);
    assert.match(limitErrors.keyword ?? "", /100자/);
    assert.match(limitErrors.content ?? "", /5000자/);
  });

  test("uses the Seoul calendar date", () => {
    assert.equal(
      getWorkLogToday(new Date("2026-09-01T15:30:00.000Z")),
      "2026-09-02",
    );
  });

  test("detects stale and concurrently created work log saves", () => {
    assert.equal(
      hasWorkLogSaveConflict(
        "2026-09-03T00:00:00.000Z",
        "2026-09-03T00:00:00.000Z",
      ),
      false,
    );
    assert.equal(
      hasWorkLogSaveConflict(
        "2026-09-03T00:00:00.000Z",
        "2026-09-03T01:00:00.000Z",
      ),
      true,
    );
    assert.equal(
      hasWorkLogSaveConflict("", "2026-09-03T01:00:00.000Z"),
      true,
    );
    assert.equal(hasWorkLogSaveConflict("", null), false);
  });

  test("builds a Sunday-starting 53 week contribution grid", () => {
    const range = getWorkLogContributionRange("2026-09-02");
    const weeks = buildWorkLogContributionWeeks({
      recordedDates: ["2026-09-01", "2026-09-01", "2026-09-02"],
      today: "2026-09-02",
    });

    assert.deepEqual(range, {
      startDate: "2025-08-31",
      endDate: "2026-09-05",
    });
    assert.equal(weeks.length, 53);
    assert.equal(weeks.every((week) => week.days.length === 7), true);
    assert.equal(weeks[0]?.days[0]?.date, range.startDate);
    assert.equal(weeks[52]?.days[6]?.date, range.endDate);
    assert.equal(
      weeks.flatMap((week) => week.days).filter((day) => day.recorded).length,
      2,
    );
    assert.equal(
      weeks.flatMap((week) => week.days).find((day) => day.date === "2026-09-03")
        ?.future,
      true,
    );
    assert.equal(getWorkLogMonthLabels(weeks).some((item) => item.label === "9월"), true);
  });
});
