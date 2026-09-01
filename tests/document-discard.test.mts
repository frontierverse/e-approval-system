import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const schemaSource = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL(
    "../prisma/migrations-postgresql/20260901160000_add_document_discard_state/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const mutationSource = readFileSync(
  new URL("../src/lib/approval-mutations.ts", import.meta.url),
  "utf8",
);
const actionSource = readFileSync(
  new URL("../src/app/documents/[id]/actions.ts", import.meta.url),
  "utf8",
);

function getExportedFunctionSource(name: string) {
  const start = mutationSource.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} must be exported`);
  const nextExport = mutationSource.indexOf("\nexport async function ", start + 1);

  return mutationSource.slice(
    start,
    nextExport === -1 ? mutationSource.length : nextExport,
  );
}

describe("document discard persistence", () => {
  test("adds the discarded status, audit actions, and discard timestamp", () => {
    assert.match(schemaSource, /enum DocumentStatus \{[\s\S]*?\bDISCARDED\b/);
    assert.match(schemaSource, /enum AuditAction \{[\s\S]*?\bDISCARD_DOCUMENT\b/);
    assert.match(schemaSource, /enum AuditAction \{[\s\S]*?\bRESTORE_DOCUMENT\b/);
    assert.match(schemaSource, /discardedAt\s+DateTime\?/);

    assert.match(
      migrationSource,
      /ALTER TYPE "DocumentStatus" ADD VALUE 'DISCARDED'/,
    );
    assert.match(
      migrationSource,
      /ALTER TABLE "ApprovalDocument" ADD COLUMN "discardedAt" TIMESTAMP\(3\)/,
    );
  });

  test("atomically discards only an owner's recalled document without deleting evidence", () => {
    const source = getExportedFunctionSource("discardRecalledDocument");

    assert.match(source, /approvalDocument\.updateMany\(/);
    assert.match(source, /drafterId:\s*actorId/);
    assert.match(source, /status:\s*DocumentStatus\.RECALLED/);
    assert.match(source, /status:\s*DocumentStatus\.DISCARDED/);
    assert.match(source, /discardedAt:\s*new Date\(\)/);
    assert.match(source, /action:\s*AuditAction\.DISCARD_DOCUMENT/);
    assert.doesNotMatch(source, /approvalDocument\.delete/);
    assert.doesNotMatch(source, /attachment\.delete/);
    assert.doesNotMatch(source, /approvalStep\.delete/);
  });

  test("atomically restores only an owner's discarded document to recalled", () => {
    const source = getExportedFunctionSource("restoreDiscardedDocument");

    assert.match(source, /approvalDocument\.updateMany\(/);
    assert.match(source, /drafterId:\s*actorId/);
    assert.match(source, /status:\s*DocumentStatus\.DISCARDED/);
    assert.match(source, /status:\s*DocumentStatus\.RECALLED/);
    assert.match(source, /discardedAt:\s*null/);
    assert.match(source, /action:\s*AuditAction\.RESTORE_DOCUMENT/);
  });

  test("exposes authenticated server actions and revalidates affected views", () => {
    assert.match(
      actionSource,
      /export async function discardDocumentAction\([\s\S]*?requireUser\(\)[\s\S]*?discardRecalledDocument/,
    );
    assert.match(
      actionSource,
      /export async function restoreDocumentAction\([\s\S]*?requireUser\(\)[\s\S]*?restoreDiscardedDocument/,
    );
    assert.match(actionSource, /revalidatePath\("\/drafts"\)/);
    assert.match(actionSource, /revalidatePath\("\/sent"\)/);
  });
});
