import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getAttachmentFileDisplay,
  mergeAttachmentSelections,
} from "../src/lib/file-display.ts";

describe("attachment file display", () => {
  test("maps extensions to readable file kinds", () => {
    assert.deepEqual(getAttachmentFileDisplay("계약서.pdf"), {
      extension: ".pdf",
      extensionLabel: "PDF",
      kind: "pdf",
      kindLabel: "PDF 문서",
    });
    assert.equal(getAttachmentFileDisplay("정산.xlsx").kindLabel, "스프레드시트");
    assert.equal(getAttachmentFileDisplay("이미지.png").kindLabel, "이미지 파일");
  });

  test("accumulates selected files without duplicating the same file", () => {
    const currentFiles = [
      { lastModified: 1, name: "a.pdf", size: 100 },
      { lastModified: 2, name: "b.xlsx", size: 200 },
    ];
    const addedFiles = [
      { lastModified: 2, name: "b.xlsx", size: 200 },
      { lastModified: 3, name: "c.hwp", size: 300 },
    ];

    assert.deepEqual(mergeAttachmentSelections(currentFiles, addedFiles), [
      { lastModified: 1, name: "a.pdf", size: 100 },
      { lastModified: 2, name: "b.xlsx", size: 200 },
      { lastModified: 3, name: "c.hwp", size: 300 },
    ]);
  });
});
