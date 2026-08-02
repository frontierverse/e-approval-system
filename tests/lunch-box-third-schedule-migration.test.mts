import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260802224500_sync_third_lunch_box_schedule/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

function sourceDatesFor(schoolName: string) {
  const escapedName = schoolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const section = migrationSource.match(
    new RegExp(
      `SELECT\\s+'${escapedName}',[\\s\\S]*?FROM unnest\\(ARRAY\\[([\\s\\S]*?)\\]::DATE\\[\\]\\)`,
    ),
  )?.[1];

  assert.ok(section, `${schoolName} 날짜 구간을 찾을 수 없습니다.`);
  return [...section.matchAll(/DATE '(2026-\d{2}-\d{2})'/g)].map(
    (match) => match[1],
  );
}

describe("third-edition lunch-box schedule migration", () => {
  test("contains only the three remaining schools and their exact service dates", () => {
    assert.deepEqual(sourceDatesFor("영만초"), [
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
    ]);
    assert.deepEqual(sourceDatesFor("송학초"), [
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
    ]);
    assert.deepEqual(sourceDatesFor("익산초"), [
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
    ]);
  });

  test("maps the document values to serving and preserved-meal fields", () => {
    assert.match(
      migrationSource,
      /'영만초',[\s\S]*?15, 15, 14, 0, 0, 1, 0,[\s\S]*?15, 15, 15, 0, 0, 1, 0/,
    );
    assert.match(
      migrationSource,
      /'송학초',[\s\S]*?18, 18, 17, 0, 0, 1, 0,[\s\S]*?17, 18, 17, 0, 0, 1, 0/,
    );
    assert.match(
      migrationSource,
      /'익산초',[\s\S]*?22, 22, 0, 0, 0, 1, 0,[\s\S]*?20, 20, 0, 0, 0, 1, 0/,
    );
  });

  test("asserts row counts, totals, daily totals, and out-of-scope immutability", () => {
    assert.match(migrationSource, /LOCK TABLE "LunchBoxSchool"/);
    assert.match(migrationSource, /LOCK TABLE "LunchBoxCount"/);
    assert.match(migrationSource, /"_lunch_box_third_before"/);
    assert.match(migrationSource, /affected_rows <> 33/);
    assert.match(migrationSource, /august_total <> 14079/);
    assert.match(migrationSource, /august_total <> 14033/);
    assert.match(migrationSource, /"_lunch_box_third_daily_total"/);
    assert.match(
      migrationSource,
      /to_jsonb\(count\) IS DISTINCT FROM to_jsonb\(before\)/,
    );
  });

  test("keeps the preceding Iri correction at 20 linked-care meals", () => {
    assert.match(migrationSource, /"_lunch_box_third_iri_dates"/);
    assert.match(
      migrationSource,
      /IS NOT DISTINCT FROM ROW\(22, 22, 19, 0, 20, 1, 0\)/,
    );
    assert.match(migrationSource, /iri_rows <> 20/);
  });
});
