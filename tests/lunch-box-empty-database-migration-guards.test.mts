import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const strictMigrationNames = [
  "20260729140000_adjust_iri_elementary_linked_count",
  "20260802224500_sync_third_lunch_box_schedule",
  "20260804100000_remove_baekje_kindergarten_august_7",
  "20260819180000_adjust_iri_august_24_schedule",
  "20260819190000_clear_iri_school_check_after_schedule_change",
] as const;

const doBlockPattern =
  /^DO[ \t]+\$\$[ \t]*\r?\n([\s\S]*?)^END[ \t]+\$\$;[ \t]*$/gim;
const doOpeningPattern = /^DO[ \t]+\$\$[ \t]*$/gim;
const emptyDatabaseGuardAtBlockStart =
  /^(?:DECLARE\b.*?\bBEGIN|BEGIN) IF NOT EXISTS \(SELECT 1 FROM "LunchBoxSchool"\) AND NOT EXISTS \(SELECT 1 FROM "LunchBoxCount"\) THEN RETURN; END IF;/i;

function readMigration(name: (typeof strictMigrationNames)[number]) {
  return readFileSync(
    new URL(
      `../prisma/migrations-postgresql/${name}/migration.sql`,
      import.meta.url,
    ),
    "utf8",
  );
}

describe("strict lunch-box migration empty database guards", () => {
  for (const migrationName of strictMigrationNames) {
    const migrationSource = readMigration(migrationName);

    test(`${migrationName} returns from every DO block when both source tables are empty`, () => {
      const doOpeningCount = [...migrationSource.matchAll(doOpeningPattern)].length;
      const doBlocks = [...migrationSource.matchAll(doBlockPattern)].map(
        (match) => match[1],
      );

      assert.ok(doOpeningCount > 0, "at least one DO block is required");
      assert.equal(
        doBlocks.length,
        doOpeningCount,
        "every DO block must be parsed before its guard is checked",
      );

      for (const [index, block] of doBlocks.entries()) {
        const normalizedBlock = block.replace(/\s+/g, " ").trim();

        assert.match(
          normalizedBlock,
          emptyDatabaseGuardAtBlockStart,
          `DO block ${index + 1} must start by returning only when LunchBoxSchool and LunchBoxCount are both empty`,
        );
      }
    });

    test(`${migrationName} retains strict drift validation`, () => {
      assert.match(migrationSource, /\bRAISE\s+EXCEPTION\b/i);
    });
  }
});
