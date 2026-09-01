import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const [detailPageSource, draftsPageSource, listActionsSource, querySource] =
  await Promise.all([
    readFile("src/app/documents/[id]/page.tsx", "utf8"),
    readFile("src/app/drafts/page.tsx", "utf8"),
    readFile("src/app/document-list-actions.ts", "utf8"),
    readFile("src/lib/approval-queries.ts", "utf8"),
  ]);

describe("document discard UI and list policy", () => {
  test("offers confirmed discard and restore actions on document detail", () => {
    assert.match(detailPageSource, /canDiscardRecalledDocumentByPolicy/);
    assert.match(detailPageSource, /discardDocumentAction/);
    assert.match(detailPageSource, /문서와 결재 이력은 보존/);
    assert.match(detailPageSource, /canRestoreDiscardedDocumentByPolicy/);
    assert.match(detailPageSource, /restoreDocumentAction/);
    assert.match(detailPageSource, /폐기된 문서입니다/);
  });

  test("keeps discarded documents behind an explicit drafts filter", () => {
    assert.match(draftsPageSource, /value: "discarded", label: "폐기 문서"/);
    assert.match(
      listActionsSource,
      /value === "draft" \|\| value === "recalled" \|\| value === "discarded"/,
    );
    assert.match(
      querySource,
      /in: \[DbDocumentStatus\.DRAFT, DbDocumentStatus\.RECALLED\]/,
    );
    assert.match(querySource, /discarded: DbDocumentStatus\.DISCARDED/);
  });
});
