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
  test("sets the linked-care class to 20 meals from August 3", () => {
    assert.match(migrationSource, /school\."name" = '이리초'/);
    assert.match(migrationSource, /school\."type" = 'elementary'/);
    assert.match(migrationSource, /"linkedCount" = 20/);
    assert.match(
      migrationSource,
      /count\."date" BETWEEN DATE '2026-08-03' AND DATE '2026-08-31'/,
    );
  });

  test("does not overwrite the regular class counts", () => {
    assert.doesNotMatch(migrationSource, /"class[1-4]Count"\s*=/);
  });

  test("clears completed checks after the schedule correction", () => {
    assert.match(migrationSource, /"checkedAt" = NULL/);
    assert.match(migrationSource, /"checkedById" = NULL/);
  });
});
