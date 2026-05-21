import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createLineDiffRows } from "../src/lib/text-diff.ts";

describe("text diff", () => {
  test("creates GitHub-style line diff rows", () => {
    assert.deepEqual(
      createLineDiffRows(
        "첫 번째 줄\n삭제될 줄\n공통 줄",
        "첫 번째 줄\n추가될 줄\n공통 줄",
      ),
      [
        {
          type: "unchanged",
          text: "첫 번째 줄",
          oldLineNumber: 1,
          newLineNumber: 1,
        },
        {
          type: "removed",
          text: "삭제될 줄",
          oldLineNumber: 2,
          newLineNumber: null,
        },
        {
          type: "added",
          text: "추가될 줄",
          oldLineNumber: null,
          newLineNumber: 2,
        },
        {
          type: "unchanged",
          text: "공통 줄",
          oldLineNumber: 3,
          newLineNumber: 3,
        },
      ],
    );
  });

  test("handles added content from an empty value", () => {
    assert.deepEqual(createLineDiffRows("", "새 본문"), [
      {
        type: "added",
        text: "새 본문",
        oldLineNumber: null,
        newLineNumber: 1,
      },
    ]);
  });

  test("treats Windows newlines as separate body lines", () => {
    assert.deepEqual(
      createLineDiffRows("첫 줄\r\n둘째 줄", "첫 줄\r\n바뀐 둘째 줄"),
      [
        {
          type: "unchanged",
          text: "첫 줄",
          oldLineNumber: 1,
          newLineNumber: 1,
        },
        {
          type: "removed",
          text: "둘째 줄",
          oldLineNumber: 2,
          newLineNumber: null,
        },
        {
          type: "added",
          text: "바뀐 둘째 줄",
          oldLineNumber: null,
          newLineNumber: 2,
        },
      ],
    );
  });
});
