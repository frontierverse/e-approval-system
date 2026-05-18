import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  createSignedAttachmentFile,
  createSignedOriginalName,
  normalizeSignaturePlacement,
  parseSignaturePlacements,
  parseSignaturePlacement,
} from "../src/lib/attachment-signature-core.ts";

describe("attachment signature core", () => {
  test("normalizes signature placement values", () => {
    assert.deepEqual(
      normalizeSignaturePlacement({ page: 1.8, x: 10.4, y: 20.6, size: 120.2 }),
      {
        ok: true,
        placement: { page: 1, x: 10, y: 21, size: 120 },
      },
    );
    assert.equal(
      normalizeSignaturePlacement({ page: 0, x: 0, y: 0, size: 120 }).ok,
      false,
    );
    assert.equal(
      normalizeSignaturePlacement({ page: 1, x: 0, y: 0, size: 12 }).ok,
      false,
    );
  });

  test("parses placement from form data", () => {
    const formData = new FormData();
    formData.set("page", "2");
    formData.set("x", "42");
    formData.set("y", "84");
    formData.set("size", "96");

    assert.deepEqual(parseSignaturePlacement(formData), {
      ok: true,
      placement: { page: 2, x: 42, y: 84, size: 96 },
    });
  });

  test("parses multiple placements from form data", () => {
    const formData = new FormData();
    formData.set(
      "placements",
      JSON.stringify([
        { page: 1, x: 10, y: 20, size: 80 },
        { page: 2, x: 30, y: 40, size: 90 },
      ]),
    );

    assert.deepEqual(parseSignaturePlacements(formData), {
      ok: true,
      placements: [
        { page: 1, x: 10, y: 20, size: 80 },
        { page: 2, x: 30, y: 40, size: 90 },
      ],
    });
  });

  test("creates readable signed PDF copies", async () => {
    const pdfDocument = await PDFDocument.create();
    pdfDocument.addPage([300, 400]);

    const signedFile = await createSignedAttachmentFile({
      originalName: "approval.pdf",
      mimeType: "application/pdf",
      sourceBuffer: Buffer.from(await pdfDocument.save()),
      signatureBuffer: createSignatureImage(),
      placements: [
        { page: 1, x: 20, y: 30, size: 80 },
        { page: 1, x: 120, y: 140, size: 60 },
      ],
    });
    const signedPdf = await PDFDocument.load(signedFile.buffer);

    assert.equal(signedFile.originalName, "approval_서명본.pdf");
    assert.equal(signedFile.mimeType, "application/pdf");
    assert.equal(signedPdf.getPageCount(), 1);
    assert.ok(signedFile.buffer.byteLength > 0);
  });

  test("creates signed attachment names", () => {
    assert.equal(createSignedOriginalName("보고서.pdf", ".pdf"), "보고서_서명본.pdf");
    assert.equal(createSignedOriginalName("attachment", ".png"), "attachment_서명본.png");
  });
});

function createSignatureImage() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAC0lEQVR42mP8z8AABQMBgNwz6r0AAAAASUVORK5CYII=",
    "base64",
  );
}
