import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260819180000_adjust_iri_august_24_schedule/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

const targetDates = [
  "2026-08-24",
  "2026-08-25",
  "2026-08-26",
  "2026-08-27",
  "2026-08-28",
  "2026-08-31",
];

function getTargetDateSection() {
  const section = migrationSource.match(
    /INSERT INTO "_lunch_box_iri_august_24_dates"\s*\([\s\S]*?\)\s*VALUES([\s\S]*?);/,
  )?.[1];

  assert.ok(section, "이리초 8월 24일 이후 대상 날짜 구간이 필요합니다.");
  return section;
}

describe("Iri Elementary August 24 lunch-box schedule migration", () => {
  test("targets only the six serving dates from August 24", () => {
    const dateSection = getTargetDateSection();

    assert.deepEqual(
      [...dateSection.matchAll(/DATE '(2026-\d{2}-\d{2})'/g)].map(
        (match) => match[1],
      ),
      targetDates,
    );
    assert.match(migrationSource, /school\."name" = '이리초'/);
    assert.match(migrationSource, /school\."type" = 'elementary'/);
    assert.match(migrationSource, /target_rows <> 6/);
  });

  test("maps the old counts to every requested count without double-counting preservation", () => {
    assert.match(
      migrationSource,
      /IS NOT DISTINCT FROM ROW\(22, 22, 0, 20, 1, 0\)/,
    );
    assert.match(migrationSource, /count\."class3Count" IN \(19, 22\)/);
    assert.match(migrationSource, /class3_variants <> 1/);
    assert.match(
      migrationSource,
      /IS (?:NOT )?DISTINCT FROM ROW\(22, 20, 21, 0, 19, 1, 0\)/,
    );
    assert.match(migrationSource, /"class1Count" = 22/);
    assert.match(migrationSource, /"class2Count" = 20/);
    assert.match(migrationSource, /"class3Count" = 21/);
    assert.match(migrationSource, /"class4Count" = 0/);
    assert.match(migrationSource, /"linkedCount" = 19/);
    assert.match(migrationSource, /"preservationCount" = 1/);
    assert.match(migrationSource, /"deliveryDriverCount" = 0/);
    assert.match(
      migrationSource,
      /(?:school\.)?"preservationClass"\s+(?:IS (?:NOT )?DISTINCT FROM|=)\s+1/,
    );
  });

  test("clears completed checks and updates exactly six rows", () => {
    assert.match(migrationSource, /"checkedAt" = NULL/);
    assert.match(migrationSource, /"checkedById" = NULL/);
    assert.match(migrationSource, /affected_rows <> 6/);
  });

  test("asserts the exact daily and August totals before and after the correction", () => {
    const expectedDailyTotals = [
      ["2026-08-24", 212, 215, 211],
      ["2026-08-25", 125, 128, 124],
      ["2026-08-26", 84, 87, 83],
      ["2026-08-27", 84, 87, 83],
      ["2026-08-28", 84, 87, 83],
      ["2026-08-31", 84, 87, 83],
    ] as const;

    for (const [date, localBefore, deployedBefore, after] of expectedDailyTotals) {
      assert.match(
        migrationSource,
        new RegExp(
          `DATE '${date}',\\s*${localBefore},\\s*${deployedBefore},\\s*${after}`,
        ),
      );
    }

    assert.match(migrationSource, /WHEN 19 THEN 14030/);
    assert.match(migrationSource, /WHEN 22 THEN 14048/);
    assert.match(migrationSource, /august_total <> 14024/);
  });

  test("locks the source tables and proves rows outside the six dates are unchanged", () => {
    assert.match(migrationSource, /LOCK TABLE "LunchBoxSchool"/);
    assert.match(migrationSource, /LOCK TABLE "LunchBoxCount"/);
    assert.match(migrationSource, /"_lunch_box_iri_august_24_before"/);
    assert.match(migrationSource, /expected\."date" IS NULL/);
    assert.match(
      migrationSource,
      /to_jsonb\(count\) IS DISTINCT FROM to_jsonb\(before\)/,
    );
  });
});
