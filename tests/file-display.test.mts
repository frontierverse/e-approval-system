import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getAttachmentPreviewContentType,
  getAttachmentPreviewKind,
  isPreviewableAttachmentFile,
} from "../src/lib/attachment-preview.ts";
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

  test("detects attachments that can be previewed inline", () => {
    assert.equal(getAttachmentPreviewKind("견적서.pdf"), "pdf");
    assert.equal(getAttachmentPreviewKind("사진.PNG"), "image");
    assert.equal(getAttachmentPreviewKind("capture", "image/webp"), "image");
    assert.equal(isPreviewableAttachmentFile("보고서.hwp"), false);
    assert.equal(isPreviewableAttachmentFile("vector.svg", "image/svg+xml"), false);
    assert.equal(
      getAttachmentPreviewContentType("preview.jpg", "application/octet-stream"),
      "image/jpeg",
    );
  });
});
