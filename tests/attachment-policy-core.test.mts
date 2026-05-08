import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  defaultAllowedAttachmentExtensions,
  normalizeExtensionList,
  parseExtensionText,
} from "../src/lib/attachment-policy-core.ts";

describe("attachment extension policy", () => {
  test("parses comma and whitespace separated extensions", () => {
    assert.deepEqual(parseExtensionText("PDF, .jpg\nhwp pdf"), [
      ".hwp",
      ".jpg",
      ".pdf",
    ]);
  });

  test("normalizes case, missing dots, duplicates, and invalid entries", () => {
    assert.deepEqual(
      normalizeExtensionList(["xlsx", ".PDF", "pdf", ".tar.gz", "."]),
      [".pdf", ".xlsx"],
    );
  });

  test("falls back to the default extension list for invalid stored values", () => {
    assert.deepEqual(
      normalizeExtensionList(null),
      defaultAllowedAttachmentExtensions
        .slice()
        .sort((a, b) => a.localeCompare(b, "en-US")),
    );
  });
});
