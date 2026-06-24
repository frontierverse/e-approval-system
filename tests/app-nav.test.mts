import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isActivePath } from "../src/components/app-nav.tsx";

describe("app navigation active paths", () => {
  test("keeps work schedule and cafe management sibling links exclusive", () => {
    assert.equal(
      isActivePath(
        "/work-schedule/cafe",
        "/work-schedule",
        "/work-schedule/cafe",
      ),
      false,
    );
    assert.equal(
      isActivePath(
        "/work-schedule/cafe",
        "/work-schedule/cafe",
        "/work-schedule/cafe",
      ),
      true,
    );
    assert.equal(
      isActivePath("/work-schedule", "/work-schedule", "/work-schedule"),
      true,
    );
  });
});
