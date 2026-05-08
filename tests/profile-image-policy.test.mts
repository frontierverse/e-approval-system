import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  profileImageCompressionMaxDimension,
  profileImageCompressionMimeType,
  profileImageCompressionQualitySteps,
  getProfileImagePolicyText,
  profileImagePolicy,
  profileImageStoragePrefix,
} from "../src/lib/profile-image-policy.ts";

describe("profile image policy", () => {
  test("limits profile images to one small web image", () => {
    assert.equal(profileImagePolicy.maxFileCount, 1);
    assert.equal(profileImagePolicy.maxFileSizeMb, 2);
    assert.deepEqual(profileImagePolicy.allowedExtensions, [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
    ]);
  });

  test("uses a dedicated storage prefix", () => {
    assert.equal(profileImageStoragePrefix, "profile-images/");
    assert.match(getProfileImagePolicyText(), /2MB/);
  });

  test("defines browser compression settings", () => {
    assert.equal(profileImageCompressionMimeType, "image/webp");
    assert.equal(profileImageCompressionMaxDimension, 768);
    assert.ok(profileImageCompressionQualitySteps.every((quality) => quality < 1));
  });
});
