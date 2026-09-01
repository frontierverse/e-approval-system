import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { GET as getLiveness } from "../src/app/api/health/live/route.ts";
import {
  createLogId,
  getSafeErrorDigest,
} from "../src/lib/observability.ts";

const globalErrorSource = readFileSync(
  new URL("../src/app/global-error.tsx", import.meta.url),
  "utf8",
);

describe("observability", () => {
  test("creates prefixed, unique event identifiers", () => {
    const first = createLogId("req");
    const second = createLogId("req");

    assert.match(first, /^req_[A-Za-z0-9_-]+$/);
    assert.notEqual(first, second);
  });

  test("only exposes bounded opaque error digests", () => {
    assert.equal(getSafeErrorDigest({ digest: "1940287390" }), "1940287390");
    assert.equal(getSafeErrorDigest({ digest: "safe:ref-01" }), "safe:ref-01");
    assert.equal(getSafeErrorDigest({ digest: "name=홍길동\nphone=010" }), null);
    assert.equal(getSafeErrorDigest({ digest: { value: "unsafe" } }), null);
    assert.equal(getSafeErrorDigest(new Error("sensitive")), null);
  });

  test("returns a cache-bypassed liveness response without internal details", async () => {
    const response = getLiveness();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { status: "ok" });
  });

  test("keeps the root fallback readable in saved and system dark themes", () => {
    assert.match(globalErrorSource, /prefers-color-scheme: dark/);
    assert.match(globalErrorSource, /:root\[data-theme="dark"\]/);
    assert.match(globalErrorSource, /localStorage\.getItem\("gyeoljaeon-theme"\)/);
    assert.match(globalErrorSource, /global-error-retry:focus-visible/);
  });
});
