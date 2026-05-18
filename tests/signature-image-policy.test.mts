import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  signatureImageCompressionMaxDimension,
  signatureImageCompressionMimeType,
  signatureImageCompressionQualitySteps,
  getSignatureImagePolicyText,
  signatureImagePolicy,
  signatureImageStoragePrefix,
} from "../src/lib/signature-image-policy.ts";

describe("signature image policy", () => {
  test("limits signature images to one small web image", () => {
    assert.equal(signatureImagePolicy.maxFileCount, 1);
    assert.equal(signatureImagePolicy.maxFileSizeMb, 2);
    assert.deepEqual(signatureImagePolicy.allowedExtensions, [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
    ]);
  });

  test("uses a dedicated storage prefix", () => {
    assert.equal(signatureImageStoragePrefix, "signature-images/");
    assert.match(getSignatureImagePolicyText(), /투명 배경 PNG 권장/);
  });

  test("defines browser compression settings", () => {
    assert.equal(signatureImageCompressionMimeType, "image/webp");
    assert.equal(signatureImageCompressionMaxDimension, 1024);
    assert.ok(
      signatureImageCompressionQualitySteps.every((quality) => quality < 1),
    );
  });
});
