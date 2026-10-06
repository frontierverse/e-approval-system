import test from "node:test";
import assert from "node:assert/strict";
import { privateStoreProblems } from "./check-private-store.mjs";

function fixture() {
  return {
    targets: {
      android: { distribution: "managed-google-play-private", organizationIds: ["LC012345"], consolePrivateDistributionConfirmed: true },
      ios: { distribution: "apple-custom-app-private", organizationIds: ["12345678"], appStoreConnectAppId: "1234567890", consolePrivateDistributionConfirmed: true },
    },
    eas: {
      build: { production: { environment: "production", channel: "production" }, "private-store": {
        extends: "production", distribution: "store", android: { buildType: "app-bundle" },
      } },
      submit: { "private-store": { android: { track: "production", releaseStatus: "draft" }, ios: { ascAppId: "1234567890" } } },
    },
  };
}

test("separately verified private store targets pass", () => {
  const { targets, eas } = fixture();
  assert.deepEqual(privateStoreProblems(targets, eas), []);
});
test("missing organizations and console confirmation block Android submission", () => {
  const { targets, eas } = fixture();
  targets.android.organizationIds = [];
  targets.android.consolePrivateDistributionConfirmed = false;
  assert.equal(privateStoreProblems(targets, eas, "android").length, 2);
});
test("public or unlisted distribution is rejected", () => {
  const { targets, eas } = fixture();
  targets.ios.distribution = "unlisted";
  assert.match(privateStoreProblems(targets, eas, "ios").join("\n"), /비공개 배포/);
});
test("APK and auto-published releases are rejected", () => {
  const { targets, eas } = fixture();
  eas.build["private-store"].android.buildType = "apk";
  eas.submit["private-store"].android.releaseStatus = "completed";
  assert.equal(privateStoreProblems(targets, eas, "android").length, 2);
});
test("internal testing is not accepted as private production distribution", () => {
  const { targets, eas } = fixture();
  eas.submit["private-store"].android.track = "internal";
  assert.match(privateStoreProblems(targets, eas, "android").join("\n"), /운영 트랙/);
});
test("iOS submission must use the verified App Store Connect app", () => {
  const { targets, eas } = fixture();
  eas.submit["private-store"].ios.ascAppId = "9876543210";
  assert.match(privateStoreProblems(targets, eas, "ios").join("\n"), /앱 ID/);
});
test("Android readiness does not require a completed iOS organization", () => {
  const { targets, eas } = fixture();
  targets.ios.organizationIds = [];
  assert.deepEqual(privateStoreProblems(targets, eas, "android"), []);
  assert.ok(privateStoreProblems(targets, eas, "ios").length > 0);
});
test("placeholder, duplicate and blank organization IDs are rejected", () => {
  for (const ids of [["YOUR_ORG_ID"], ["LC123", "LC123"], [" "], [null]]) {
    const { targets, eas } = fixture();
    targets.android.organizationIds = ids;
    assert.match(privateStoreProblems(targets, eas, "android").join("\n"), /조직 ID/);
  }
});
test("missing build configuration and invalid platform fail closed", () => {
  const { targets } = fixture();
  assert.ok(privateStoreProblems(targets, {}).length > 0);
  assert.ok(privateStoreProblems(targets, {}, "web").length > 0);
});
