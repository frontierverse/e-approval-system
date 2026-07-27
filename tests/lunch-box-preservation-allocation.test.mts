import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260727110000_reallocate_lunch_box_preservation_by_campus/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("lunch box campus preservation migration", () => {
  test("restores the two date-specific kindergarten attendance schedules", () => {
    assert.match(
      migrationSource,
      /'동남초 병설유치원',[\s\S]*\n\s*8,/,
    );
    assert.match(
      migrationSource,
      /'백제초 병설유치원',[\s\S]*\n\s*3,/,
    );

    for (const date of [
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
    ]) {
      assert.match(migrationSource, new RegExp(`DATE '${date}'`));
    }

    for (const date of ["2026-08-03", "2026-08-21"]) {
      assert.match(migrationSource, new RegExp(`DATE '${date}'`));
    }
  });

  test("gives one preserved meal to elementary first and kindergarten fallback", () => {
    assert.match(migrationSource, /expected_elementary/);
    assert.match(migrationSource, /expected_kindergarten/);
    assert.match(migrationSource, /elementary\."type" = 'elementary'/);
    assert.match(
      migrationSource,
      /elementary\."name" = regexp_replace\([\s\S]*' 병설유치원\$'/,
    );
    assert.match(
      migrationSource,
      /COALESCE\([\s\S]*elementary_count\."class1Count"[\s\S]*\) = 0/,
    );
    assert.match(
      migrationSource,
      /캠퍼스별 보존식은 날짜마다 정확히 1개여야 합니다/,
    );
  });

  test("clears completed checks when corrected counts change", () => {
    assert.match(migrationSource, /"checkedAt" = NULL/);
    assert.match(migrationSource, /"checkedById" = NULL/);
  });
});
