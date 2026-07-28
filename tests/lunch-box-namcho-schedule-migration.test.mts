import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260728120000_adjust_namcho_lunch_box_schedule/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Namcho lunch-box schedule migration", () => {
  test("sets Namcho to 14 serving meals plus one preserved meal from August 3", () => {
    assert.match(migrationSource, /school\."name" = '남초'/);
    assert.match(migrationSource, /school\."type" = 'elementary'/);
    assert.match(
      migrationSource,
      /"class1Count" = 14[\s\S]*"class2Count" = 0[\s\S]*"preservationCount" = 1/,
    );
    assert.match(
      migrationSource,
      /count\."date" BETWEEN DATE '2026-08-03' AND DATE '2026-08-31'/,
    );
  });

  test("clears completed checks after the schedule correction", () => {
    assert.match(migrationSource, /"checkedAt" = NULL/);
    assert.match(migrationSource, /"checkedById" = NULL/);
  });
});
