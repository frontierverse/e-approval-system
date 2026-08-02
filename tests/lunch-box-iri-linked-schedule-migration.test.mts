import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260729140000_adjust_iri_elementary_linked_count/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Iri Elementary linked-care lunch-box schedule migration", () => {
  test("sets the linked-care class to 20 meals on the 20 source dates", () => {
    assert.match(migrationSource, /school\."name" = '이리초'/);
    assert.match(migrationSource, /school\."type" = 'elementary'/);
    assert.match(migrationSource, /"linkedCount" = 20/);

    const dateSection = migrationSource.match(
      /INSERT INTO "_lunch_box_iri_dates" \("date"\)([\s\S]*?);/,
    )?.[1];
    assert.ok(dateSection);
    assert.deepEqual(
      [...dateSection.matchAll(/DATE '(2026-\d{2}-\d{2})'/g)].map(
        (match) => match[1],
      ),
      [
        "2026-08-03",
        "2026-08-04",
        "2026-08-05",
        "2026-08-06",
        "2026-08-07",
        "2026-08-10",
        "2026-08-11",
        "2026-08-12",
        "2026-08-13",
        "2026-08-14",
        "2026-08-18",
        "2026-08-19",
        "2026-08-20",
        "2026-08-21",
        "2026-08-24",
        "2026-08-25",
        "2026-08-26",
        "2026-08-27",
        "2026-08-28",
        "2026-08-31",
      ],
    );
  });

  test("does not overwrite the regular class counts", () => {
    assert.doesNotMatch(migrationSource, /"class[1-4]Count"\s*=/);
  });

  test("clears completed checks after the schedule correction", () => {
    assert.match(migrationSource, /"checkedAt" = NULL/);
    assert.match(migrationSource, /"checkedById" = NULL/);
  });

  test("aborts on drift and proves the correction stayed in scope", () => {
    assert.match(migrationSource, /LOCK TABLE "LunchBoxCount"/);
    assert.match(migrationSource, /"_lunch_box_iri_before"/);
    assert.match(migrationSource, /affected_rows <> 20/);
    assert.match(migrationSource, /august_total <> 14099/);
    assert.match(migrationSource, /august_total <> 14079/);
    assert.match(
      migrationSource,
      /to_jsonb\(count\) IS DISTINCT FROM to_jsonb\(before\)/,
    );
  });
});
