import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260804100000_remove_baekje_kindergarten_august_7/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Baekje Elementary kindergarten August 7 excursion migration", () => {
  test("targets only the kindergarten and exact excursion date", () => {
    assert.match(migrationSource, /school\."name" = '백제초 병설유치원'/);
    assert.match(migrationSource, /school\."type" = 'kindergarten'/);
    assert.match(migrationSource, /count\."date" = DATE '2026-08-07'/);
    assert.doesNotMatch(migrationSource, /BETWEEN DATE '2026-08-07'/);
  });

  test("changes the expected three meals to zero without deleting the row", () => {
    assert.match(
      migrationSource,
      /IS NOT DISTINCT FROM ROW\(3, 0, 0, 0, 0, 0, 0\)/,
    );
    assert.match(
      migrationSource,
      /IS DISTINCT FROM ROW\(0, 0, 0, 0, 0, 0, 0\)/,
    );
    assert.match(migrationSource, /"class1Count" = 0/);
    assert.match(migrationSource, /affected_rows <> 1/);
    assert.doesNotMatch(migrationSource, /DELETE FROM "LunchBoxCount"/);
  });

  test("checks exact totals and proves out-of-scope rows are unchanged", () => {
    assert.match(migrationSource, /daily_total <> 1144/);
    assert.match(migrationSource, /daily_total <> 1141/);
    assert.match(migrationSource, /august_total <> 14033/);
    assert.match(migrationSource, /august_total <> 14030/);
    assert.match(migrationSource, /"_lunch_box_baekje_kindergarten_before"/);
    assert.match(
      migrationSource,
      /to_jsonb\(count\) IS DISTINCT FROM to_jsonb\(before\)/,
    );
  });
});
